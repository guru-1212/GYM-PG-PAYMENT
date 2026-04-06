import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import type { SubscriptionType } from '../models/member.model';
import { Payment, PaymentMethod } from '../models/payment.model';
import { coerceFirestoreDate, dateToTimestamp, isDateInCalendarMonth, nextDueAfterPaid, timestampToDate } from '../utils/date.utils';
import { FirebaseAppService } from './firebase-app.service';
import { MemberService } from './member.service';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly fb = inject(FirebaseAppService);
  private readonly members = inject(MemberService);

  watchPaymentsForOwner(ownerId: string, callback: (payments: Payment[]) => void): Unsubscribe {
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      orderBy('date', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      const list: Payment[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as Payment), paymentId: d.id }));
      callback(list);
    });
  }

  /**
   * Authoritative sum for the calendar month of `refDate` (same rules as dashboard cards).
   */
  async sumPaymentsForCalendarMonth(ownerId: string, refDate: Date = new Date()): Promise<number> {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      where('date', '>=', dateToTimestamp(start)),
      where('date', '<=', dateToTimestamp(end)),
    );
    const snap = await getDocs(q);
    let sum = 0;
    snap.forEach((docSnap) => {
      const row = docSnap.data() as Record<string, unknown>;
      const d = coerceFirestoreDate(row['date']);
      if (!d || !isDateInCalendarMonth(d, refDate)) return;
      sum += Number(row['amount']) || 0;
    });
    return sum;
  }

  payments$(ownerId: string): Observable<Payment[]> {
    return new Observable((sub) => {
      const unsub = this.watchPaymentsForOwner(ownerId, (p) => sub.next(p));
      return () => unsub();
    });
  }

  watchPaymentsForMember(
    memberId: string,
    callback: (payments: Payment[]) => void,
  ): Unsubscribe {
    const q = query(
      collection(this.fb.db, 'payments'),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      const list: Payment[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as Payment), paymentId: d.id }));
      callback(list);
    });
  }

  /**
   * Record payment. Next due date is derived from the existing due date + subscription period
   * (calendar months), not from the payment date.
   */
  async markPaid(params: {
    memberId: string;
    ownerId: string;
    amount: number;
    method: PaymentMethod;
    currentDueDate: Date;
    subscriptionType?: SubscriptionType | null;
    isPartialPayment?: boolean;
    pendingAmount?: number;
  }): Promise<void> {
    const payDate = new Date();
    const nextDue = nextDueAfterPaid(params.currentDueDate, params.subscriptionType);
    const pendingAmount = Math.max(0, Number(params.pendingAmount) || 0);
    const isPartialPayment = !!params.isPartialPayment;
    await addDoc(collection(this.fb.db, 'payments'), {
      memberId: params.memberId,
      ownerId: params.ownerId,
      amount: params.amount,
      date: dateToTimestamp(payDate),
      method: params.method,
      isPartialPayment,
      pendingAmount: isPartialPayment ? pendingAmount : 0,
      createdAt: serverTimestamp(),
    });
    if (isPartialPayment) {
      await this.members.updateBillingState(params.memberId, {
        subscriptionType: params.subscriptionType ?? undefined,
        pendingAmount,
      });
      return;
    }
    await this.members.updateBillingState(params.memberId, {
      dueDate: nextDue,
      subscriptionType: params.subscriptionType ?? undefined,
      pendingAmount: 0,
    });
  }

  paymentDate(p: Payment): Date | null {
    return timestampToDate(p.date);
  }
}
