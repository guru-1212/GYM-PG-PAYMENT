import type { Timestamp } from 'firebase/firestore';

/** Categories used for filtering, analytics, and deduplication keys. */
export type AppNotificationCategory =
  | 'member_added'
  | 'member_onboarding'
  | 'profile_review'
  | 'payment_overdue'
  | 'payment_due_soon'
  | 'broadcast'
  | 'system';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: AppNotificationCategory;
  read: boolean;
  createdAt: Timestamp | null;
  /** Optional deep-link or context */
  memberId?: string;
  /** Arbitrary payload for future UI (e.g. route hints). */
  meta?: Record<string, string>;
}
