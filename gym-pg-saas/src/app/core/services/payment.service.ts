import { Injectable, inject } from '@angular/core';
import {
  // @ts-ignore
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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
    // Check for field existence first, then convert to amount
    // Order: amount > paidAmount > paymentAmount > totalPaid
    if (row['amount'] !== undefined && row['amount'] !== null) {
      const val = this.toAmount(row['amount']);
      if (val > 0) return val;
    }
    if (row['paidAmount'] !== undefined && row['paidAmount'] !== null) {
      const val = this.toAmount(row['paidAmount']);
      if (val > 0) return val;
    }
    if (row['paymentAmount'] !== undefined && row['paymentAmount'] !== null) {
      const val = this.toAmount(row['paymentAmount']);
      if (val > 0) return val;
    }
    if (row['totalPaid'] !== undefined && row['totalPaid'] !== null) {
      const val = this.toAmount(row['totalPaid']);
      if (val > 0) return val;
    }
    return 0;
  }

  private toAmount(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const n = Number(value.replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  watchPaymentsForOwner(ownerId: string, callback: (payments: Payment[]) => void): () => void {
    // OPTIMIZATION: Limit to 500 most recent payments per owner for cost reduction
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      orderBy('date', 'desc'),
      limit(500),
    );
    return onSnapshot(
      q,
      (snap: any) => {
        const list: Payment[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as Payment;
          list.push({ ...data, paymentId: d.id });
        });
        console.log(`✅ Payments snapshot received: ${list.length} payments for ownerId: ${ownerId}`);
        list.forEach((p, i) => {
          const pDate = p.date instanceof Object && 'toDate' in p.date ? p.date.toDate() : p.date;
          console.log(`  [${i}] Amount: ${p.amount}, Date: ${pDate}, OwnerId: ${p.ownerId}`);
        });
        callback(list);
      },
      (error) => {
        console.error('❌ Payments listener error:', error);
      },
    );
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
  ): () => void {
    // OPTIMIZATION: Limit to 100 most recent payments per member
    const q = query(
      collection(this.fb.db, 'payments'),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
      limit(100),
    );
    return onSnapshot(q, (snap: any) => {
      const list: Payment[] = [];
      snap.forEach((d: any) => list.push({ ...(d.data() as Payment), paymentId: d.id }));
      callback(list);
    });
  }

  /**
   * Record payment. Next due date is derived from the existing due date + subscription period
   * (calendar months), not from the payment date.
   *
   * When the member already had a balance (`priorPendingAmount`), paying toward that balance does
   * not advance the billing cycle. The due date moves forward only if there is no prior balance,
   * or the payment clears the balance and the amount above the balance is at least the plan fee
   * (`memberPlanAmount`).
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
    /** Member's balance before this payment (from `member.pendingAmount`). */
    priorPendingAmount?: number;
    /** Recurring plan amount (`member.amount`); used to allow renew in same txn after balance cleared. */
    memberPlanAmount?: number;
  }): Promise<void> {
    const payDate = new Date();
    const nextDue = nextDueAfterPaid(params.currentDueDate, params.subscriptionType);
    const pendingFromForm = Math.max(0, Number(params.pendingAmount) || 0);
    const isPartialPayment = !!params.isPartialPayment;
    const paid = Math.max(0, Number(params.amount) || 0);
    const priorPending = Math.max(0, Number(params.priorPendingAmount) || 0);
    const planAmount = Math.max(0, Number(params.memberPlanAmount) || 0);

    await addDoc(collection(this.fb.db, 'payments'), {
      memberId: params.memberId,
      ownerId: params.ownerId,
      amount: params.amount,
      date: dateToTimestamp(payDate),
      method: params.method,
      isPartialPayment,
      pendingAmount: isPartialPayment ? pendingFromForm : 0,
      createdAt: serverTimestamp(),
    });

    if (isPartialPayment) {
      await this.members.updateBillingState(params.memberId, {
        subscriptionType: params.subscriptionType ?? undefined,
        pendingAmount: pendingFromForm,
      });
      return;
    }

    if (priorPending > 0) {
      const appliedToBalance = Math.min(paid, priorPending);
      const excess = paid - appliedToBalance;
      const newPending = priorPending - appliedToBalance;

      if (newPending > 0) {
        await this.members.updateBillingState(params.memberId, {
          subscriptionType: params.subscriptionType ?? undefined,
          pendingAmount: newPending,
        });
        return;
      }

      const renewsThisTxn = planAmount > 0 && excess >= planAmount;
      if (!renewsThisTxn) {
        await this.members.updateBillingState(params.memberId, {
          subscriptionType: params.subscriptionType ?? undefined,
          pendingAmount: 0,
        });
        return;
      }

      await this.members.updateBillingState(params.memberId, {
        dueDate: nextDue,
        subscriptionType: params.subscriptionType ?? undefined,
        pendingAmount: 0,
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

  /**
   * Get the latest payment for a member (most recent by date)
   */
  async getLatestPaymentForMember(memberId: string): Promise<Payment | null> {
    const q = query(
      collection(this.fb.db, 'payments'),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as Payment;
    return { ...data, paymentId: doc.id };
  }

  /**
   * Update the amount of an existing payment
   */
  async updatePaymentAmount(paymentId: string, newAmount: number): Promise<void> {
    const ref = doc(this.fb.db, 'payments', paymentId);
    await updateDoc(ref, { amount: newAmount });
  }
}
