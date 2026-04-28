import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import type { SubscriptionType } from '../models/member.model';
import { Payment, PaymentMethod } from '../models/payment.model';
import { coerceFirestoreDate, dateToTimestamp, isDateInCalendarMonth, nextDueAfterPaid, timestampToDate } from '../utils/date.utils';
import { FirebaseAppService } from './firebase-app.service';
import { MemberService } from './member.service';

/**
 * What `markPaid()` actually wrote to the member document. Returned to callers
 * so they can apply the same patch to their local cache for an instant UI update.
 */
export interface MarkPaidResult {
  /** New pendingAmount on the member after the payment is applied. */
  pendingAmount: number;
  /** New due date on the member; only set when the billing cycle advanced. */
  dueDate?: Date;
  /** Subscription type recorded with this payment (if any). */
  subscriptionType?: SubscriptionType;
}

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

  /**
   * Newest first for the Payments UI: when the row was recorded (`createdAt`),
   * then business `date`, then doc id. Matches "recent activity" even when `date` is backdated.
   */
  private sortPaymentsNewestFirst(list: Payment[]): void {
    list.sort((a, b) => {
      const ca = coerceFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const cb = coerceFirestoreDate(b.createdAt)?.getTime() ?? 0;
      if (cb !== ca) return cb - ca;
      const da = coerceFirestoreDate(a.date)?.getTime() ?? 0;
      const db = coerceFirestoreDate(b.date)?.getTime() ?? 0;
      if (db !== da) return db - da;
      return b.paymentId.localeCompare(a.paymentId);
    });
  }

  watchPaymentsForOwner(ownerId: string, callback: (payments: Payment[]) => void): Unsubscribe {
    // Use orderBy('date') — composite index is already deployed in most projects.
    // Rows are then sorted client-side (see sortPaymentsNewestFirst) so "just recorded"
    // appears above same-day older writes when appropriate.
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      orderBy('date', 'desc'),
      limit(500),
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: Payment[] = [];
        snap.forEach((d) => {
          const data = d.data() as Payment;
          list.push({ ...data, paymentId: d.id });
        });
        this.sortPaymentsNewestFirst(list);
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
  ): Unsubscribe {
    // OPTIMIZATION: Limit to 100 most recent payments per member
    const q = query(
      collection(this.fb.db, 'payments'),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
      limit(100),
    );
    return onSnapshot(q, (snap) => {
      const list: Payment[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as Payment), paymentId: d.id }));
      this.sortPaymentsNewestFirst(list);
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
   *
   * Returns the changes applied to the member doc so callers can patch their local cache
   * immediately (optimistic update) without waiting for the Firestore listener to fire.
   */
  async markPaid(params: {
    memberId: string;
    ownerId: string;
    amount: number;
    method: PaymentMethod;
    currentDueDate: Date;
    subscriptionType?: SubscriptionType | null;
    isPartialPayment?: boolean;
    moveDueOnPartial?: boolean;
    pendingAmount?: number;
    /** Member's balance before this payment (from `member.pendingAmount`). */
    priorPendingAmount?: number;
    /** Recurring plan amount (`member.amount`); used to allow renew in same txn after balance cleared. */
    memberPlanAmount?: number;
  }): Promise<MarkPaidResult> {
    const payDate = new Date();
    const nextDue = nextDueAfterPaid(params.currentDueDate, params.subscriptionType);
    const pendingFromForm = Math.max(0, Number(params.pendingAmount) || 0);
    const isPartialPayment = !!params.isPartialPayment;
    const moveDueOnPartial = !!params.moveDueOnPartial;
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
      const dueDate = moveDueOnPartial ? nextDue : undefined;
      await this.members.updateBillingState(params.memberId, {
        dueDate,
        subscriptionType: params.subscriptionType ?? undefined,
        pendingAmount: pendingFromForm,
      });
      return {
        pendingAmount: pendingFromForm,
        dueDate,
        subscriptionType: params.subscriptionType ?? undefined,
      };
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
        return {
          pendingAmount: newPending,
          subscriptionType: params.subscriptionType ?? undefined,
        };
      }

      const renewsThisTxn = planAmount > 0 && excess >= planAmount;
      if (!renewsThisTxn) {
        await this.members.updateBillingState(params.memberId, {
          subscriptionType: params.subscriptionType ?? undefined,
          pendingAmount: 0,
        });
        return {
          pendingAmount: 0,
          subscriptionType: params.subscriptionType ?? undefined,
        };
      }

      await this.members.updateBillingState(params.memberId, {
        dueDate: nextDue,
        subscriptionType: params.subscriptionType ?? undefined,
        pendingAmount: 0,
      });
      return {
        pendingAmount: 0,
        dueDate: nextDue,
        subscriptionType: params.subscriptionType ?? undefined,
      };
    }

    await this.members.updateBillingState(params.memberId, {
      dueDate: nextDue,
      subscriptionType: params.subscriptionType ?? undefined,
      pendingAmount: 0,
    });
    return {
      pendingAmount: 0,
      dueDate: nextDue,
      subscriptionType: params.subscriptionType ?? undefined,
    };
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
