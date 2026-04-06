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

  private paymentDateFromRow(row: Record<string, unknown>): Date | null {
    return coerceFirestoreDate(row['date']) ?? coerceFirestoreDate(row['createdAt']);
  }

  private paymentAmountFromRow(row: Record<string, unknown>): number {
    return (
      this.toAmount(row['amount']) ||
      this.toAmount(row['paidAmount']) ||
      this.toAmount(row['paymentAmount']) ||
      this.toAmount(row['totalPaid']) ||
      0
    );
  }

  private toAmount(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const n = Number(value.replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

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
    const monthlyByDateQ = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      where('date', '>=', dateToTimestamp(start)),
      where('date', '<=', dateToTimestamp(end)),
    );
    const snap = await getDocs(monthlyByDateQ);
    let sum = 0;
    snap.forEach((docSnap) => {
      const row = docSnap.data() as Record<string, unknown>;
      const d = this.paymentDateFromRow(row);
      if (!d || !isDateInCalendarMonth(d, refDate)) return;
      sum += this.paymentAmountFromRow(row);
    });
    if (sum > 0) return sum;

    // Fallback for legacy rows where `date` field may be missing/malformed.
    const ownerOnlyQ = query(collection(this.fb.db, 'payments'), where('ownerId', '==', ownerId));
    const ownerOnlySnap = await getDocs(ownerOnlyQ);
    ownerOnlySnap.forEach((docSnap) => {
      const row = docSnap.data() as Record<string, unknown>;
      const d = this.paymentDateFromRow(row);
      if (!d || !isDateInCalendarMonth(d, refDate)) return;
      sum += this.paymentAmountFromRow(row);
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
