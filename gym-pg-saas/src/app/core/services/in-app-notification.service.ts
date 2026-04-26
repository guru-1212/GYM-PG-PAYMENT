import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Member } from '../models/member.model';
import type { AppNotification, AppNotificationCategory } from '../models/app-notification.model';
import {
  calendarDaysBetween,
  startOfDay,
  startOfToday,
  timestampToDate,
} from '../utils/date.utils';
import { FirebaseAppService } from './firebase-app.service';

export interface AddOwnerNotificationInput {
  title: string;
  body: string;
  category: AppNotificationCategory;
  memberId?: string;
  meta?: Record<string, string>;
  stableId?: string;
}

@Injectable({ providedIn: 'root' })
export class InAppNotificationService {
  private readonly fb = inject(FirebaseAppService);

  private notifCol(ownerId: string) {
    return collection(this.fb.db, 'owners', ownerId, 'appNotifications');
  }

  async addOwnerNotification(ownerId: string, input: AddOwnerNotificationInput): Promise<void> {
    const payload: Record<string, unknown> = {
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 2000),
      category: input.category,
      read: false,
      createdAt: serverTimestamp(),
    };
    if (input.memberId) payload['memberId'] = input.memberId;
    if (input.meta && Object.keys(input.meta).length) payload['meta'] = input.meta;

    if (input.stableId) {
      const ref = doc(this.fb.db, 'owners', ownerId, 'appNotifications', input.stableId);
      await setDoc(ref, payload, { merge: true });
      return;
    }

    await addDoc(this.notifCol(ownerId), payload);
  }

  watchOwnerNotifications(ownerId: string, cb: (rows: AppNotification[]) => void): Unsubscribe {
    const q = query(this.notifCol(ownerId), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const rows: AppNotification[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        rows.push({
          id: d.id,
          title: String(data['title'] ?? ''),
          body: String(data['body'] ?? ''),
          category: (data['category'] as AppNotificationCategory) || 'system',
          read: Boolean(data['read']),
          createdAt: (data['createdAt'] as AppNotification['createdAt']) ?? null,
          memberId: typeof data['memberId'] === 'string' ? data['memberId'] : undefined,
          meta: data['meta'] && typeof data['meta'] === 'object' ? (data['meta'] as Record<string, string>) : undefined,
        });
      });
      cb(rows);
    });
  }

  async markRead(ownerId: string, notificationId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'owners', ownerId, 'appNotifications', notificationId), {
      read: true,
    });
  }

  async markAllRead(ownerId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const batch = writeBatch(this.fb.db);
    for (const id of ids) {
      batch.update(doc(this.fb.db, 'owners', ownerId, 'appNotifications', id), { read: true });
    }
    await batch.commit();
  }

  async syncDueAlertsFromMembers(ownerId: string, members: Member[]): Promise<void> {
    const today = startOfToday();
    const overdue: Member[] = [];
    const dueSoon: Member[] = [];

    for (const m of members) {
      if (m.status !== 'active') continue;
      const due = timestampToDate(m.dueDate);
      if (!due) continue;
      const daysLeft = calendarDaysBetween(today, startOfDay(due));
      if (daysLeft < 0) overdue.push(m);
      else if (daysLeft >= 0 && daysLeft <= 2) dueSoon.push(m);
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    if (overdue.length > 0) {
      const names = overdue
        .slice(0, 5)
        .map((m) => `${m.firstName} ${m.lastName || ''}`.trim())
        .join(', ');
      const more = overdue.length > 5 ? ` (+${overdue.length - 5} more)` : '';
      await this.addOwnerNotification(ownerId, {
        title: 'Overdue payments',
        body: `${overdue.length} active member(s) are overdue: ${names}${more}`,
        category: 'payment_overdue',
        stableId: `auto_overdue_${dayKey}`,
      });
    }

    if (dueSoon.length > 0) {
      const names = dueSoon
        .slice(0, 5)
        .map((m) => `${m.firstName} ${m.lastName || ''}`.trim())
        .join(', ');
      const more = dueSoon.length > 5 ? ` (+${dueSoon.length - 5} more)` : '';
      await this.addOwnerNotification(ownerId, {
        title: 'Payments due soon',
        body: `${dueSoon.length} member(s) due within 2 days: ${names}${more}`,
        category: 'payment_due_soon',
        stableId: `auto_due_soon_${dayKey}`,
      });
    }
  }

  async notifyNewMemberJoined(ownerId: string, member: Member): Promise<void> {
    const name = `${member.firstName} ${member.lastName || ''}`.trim() || 'Member';
    const dayKey = new Date().toISOString().slice(0, 10);
    await this.addOwnerNotification(ownerId, {
      title: 'New member',
      body: `${name} joined or was added to your list.`,
      category: 'member_added',
      memberId: member.memberId,
      stableId: `auto_new_member_${member.memberId}_${dayKey}`,
    });
  }
}
