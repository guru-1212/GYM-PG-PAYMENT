import { Timestamp } from 'firebase/firestore';

export type PaymentMethod = 'cash' | 'upi' | 'card';

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
}
