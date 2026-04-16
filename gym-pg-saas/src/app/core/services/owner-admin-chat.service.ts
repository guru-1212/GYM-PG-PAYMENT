import { Injectable, inject } from '@angular/core';
import {
  // @ts-ignore
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OwnerAdminChatMessage } from '../models/owner-admin-chat.model';
import { FirebaseAppService } from './firebase-app.service';

@Injectable({ providedIn: 'root' })
export class OwnerAdminChatService {
  private readonly fb = inject(FirebaseAppService);

  async createChatIfNotExists(chatId: string): Promise<void> {
    if (!chatId?.trim()) return;
    await setDoc(
      doc(this.fb.db, `chats/${chatId}`),
      {
        chatId,
        ownerId: chatId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  watchThread(chatId: string, callback: (messages: OwnerAdminChatMessage[]) => void): () => void {
    void this.createChatIfNotExists(chatId).catch((err) =>
      console.error('[Chat] Failed to ensure chat doc before listening:', err),
    );

    const q = query(
      collection(this.fb.db, `chats/${chatId}/messages`),
      orderBy('timestamp', 'asc'),
      limit(50),
    );

    return onSnapshot(
      q,
      (snap: any) => {
        const list: OwnerAdminChatMessage[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as Omit<OwnerAdminChatMessage, 'id'>;
          list.push({
            ...data,
            id: d.id,
            chatId: data.chatId || chatId,
            ownerId: data.ownerId || chatId,
            timestamp: data.timestamp || null,
          });
        });
        list.sort((a, b) => (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0));
        callback(list);
      },
      (error) => {
        console.error('[Chat] listen error:', error);
        callback([]);
      },
    );
  }

  watchAdminUnreadCounts(callback: (counts: Record<string, number>) => void): () => void {
    const q = query(
      collectionGroup(this.fb.db, 'messages'),
      where('senderRole', '==', 'owner'),
      where('readByAdmin', '==', false),
      orderBy('timestamp', 'desc'),
      limit(50),
    );

    return onSnapshot(
      q,
      (snap: any) => {
        const counts: Record<string, number> = {};
        snap.forEach((d: any) => {
          const msg = d.data() as OwnerAdminChatMessage;
          const ownerId = String(msg.ownerId || msg.chatId || '');
          if (!ownerId) return;
          counts[ownerId] = (counts[ownerId] || 0) + 1;
        });
        callback(counts);
      },
      (error) => {
        console.error('[Chat] admin unread listener error:', error);
        callback({});
      },
    );
  }

  watchOwnerUnreadCount(chatId: string, callback: (count: number) => void): () => void {
    const q = query(
      collection(this.fb.db, `chats/${chatId}/messages`),
      where('senderRole', '==', 'admin'),
      where('readByOwner', '==', false),
      orderBy('timestamp', 'desc'),
      limit(50),
    );

    return onSnapshot(
      q,
      (snap: any) => callback(snap.size),
      (error) => {
        console.error('[Chat] owner unread listener error:', error);
        callback(0);
      },
    );
  }

  async sendMessage(params: {
    chatId: string;
    senderRole: 'admin' | 'owner';
    senderId?: string;
    senderName?: string;
    text: string;
  }): Promise<void> {
    const chatId = params.chatId?.trim();
    const text = params.text?.trim();

    if (!chatId) throw new Error('chatId is required');
    if (!text) throw new Error('Message cannot be empty');

    const currentUser = this.fb.auth.currentUser;
    if (!currentUser) throw new Error('User must be authenticated before sending messages');

    await this.createChatIfNotExists(chatId);

    await addDoc(collection(this.fb.db, `chats/${chatId}/messages`), {
      chatId,
      ownerId: chatId,
      senderRole: params.senderRole,
      senderId: params.senderId || currentUser.uid,
      senderName: params.senderName || '',
      text,
      timestamp: serverTimestamp(),
      readByAdmin: params.senderRole === 'admin',
      readByOwner: params.senderRole === 'owner',
    });

    await setDoc(
      doc(this.fb.db, `chats/${chatId}`),
      {
        updatedAt: serverTimestamp(),
        lastMessageText: text,
        lastSenderRole: params.senderRole,
      },
      { merge: true },
    );
  }

  async markThreadReadByAdmin(chatId: string): Promise<void> {
    const q = query(
      collection(this.fb.db, `chats/${chatId}/messages`),
      where('senderRole', '==', 'owner'),
      where('readByAdmin', '==', false),
      limit(50),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(this.fb.db);
    (snap.docs as any).forEach((d: any) => batch.update(d.ref, { readByAdmin: true }));
    await batch.commit();
  }

  async markThreadReadByOwner(chatId: string): Promise<void> {
    const q = query(
      collection(this.fb.db, `chats/${chatId}/messages`),
      where('senderRole', '==', 'admin'),
      where('readByOwner', '==', false),
      limit(50),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(this.fb.db);
    (snap.docs as any).forEach((d: any) => batch.update(d.ref, { readByOwner: true }));
    await batch.commit();
  }
}