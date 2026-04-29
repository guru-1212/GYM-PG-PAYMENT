import { Timestamp } from 'firebase/firestore';

export type PaymentMethod = 'cash' | 'upi' | 'card';

/**
 * Role of the person who recorded the payment. Useful in the UI to render
 * a small "by supervisor" / "by owner" pill on each row, and downstream
 * for any reconciliation report (e.g. "who collected what last week").
 */
export type PaymentRecordedByRole = 'owner' | 'supervisor' | 'admin';

export interface Payment {
  paymentId: string;
  memberId: string;
  ownerId: string;
  amount: number;
  date: Timestamp;
  method: PaymentMethod;
  isPartialPayment?: boolean;
  pendingAmount?: number;
  createdAt: Timestamp;

  /* ---------- Audit log (set on creation only; never edited) ----------
   * These fields answer "who recorded this payment?" — essential when
   * supervisors collect cash on behalf of the owner. The owner can see at
   * a glance whether they took the payment themselves or one of their
   * staff did, which is critical for reconciliation and dispute handling.
   *
   * Optional in the model so legacy rows (written before this audit log
   * landed) continue to render correctly.
   */
  /** Firebase Auth UID of whoever clicked "record payment". */
  recordedBy?: string;
  /** Display name at the moment of recording (snapshot, not a live link). */
  recordedByName?: string;
  /** Role at the moment of recording — supports business reporting. */
  recordedByRole?: PaymentRecordedByRole;
  /** Server timestamp of when the payment was written (mirror of createdAt). */
  recordedAt?: Timestamp;
}
