import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

export interface OwnerBroadcast {
  id: string;
  title: string;
  body: string;
  createdAt: Timestamp | null;
}

@Injectable({ providedIn: 'root' })
export class MemberBroadcastService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  private broadcastsCol(ownerId: string) {
    return collection(this.fb.db, 'owners', ownerId, 'broadcasts');
  }

  async sendBroadcast(ownerId: string, title: string, body: string): Promise<void> {
    const owner = this.auth.profile();
    if (!owner || owner.ownerId !== ownerId) throw new Error('Not allowed');
    await addDoc(this.broadcastsCol(ownerId), {
      title: title.trim().slice(0, 120),
      body: body.trim().slice(0, 4000),
      createdAt: serverTimestamp(),
    });
  }

  watchBroadcasts(
    ownerId: string,
    cb: (rows: OwnerBroadcast[]) => void,
    onError?: (err: unknown) => void,
    options?: { limit?: number },
  ): Unsubscribe {
    const lim = Math.min(500, Math.max(1, Math.floor(options?.limit ?? 40)));
    const q = query(this.broadcastsCol(ownerId), orderBy('createdAt', 'desc'), limit(lim));
    return onSnapshot(
      q,
      (snap) => {
        const rows: OwnerBroadcast[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          rows.push({
            id: d.id,
            title: String(data['title'] ?? ''),
            body: String(data['body'] ?? ''),
            createdAt: (data['createdAt'] as OwnerBroadcast['createdAt']) ?? null,
          });
        });
        cb(rows);
      },
      (err) => {
        onError?.(err);
        cb([]);
      },
    );
  }
}
