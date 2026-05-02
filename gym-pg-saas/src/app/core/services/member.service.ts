import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import type { SubscriptionType } from '../models/member.model';
import type { PaymentMethod } from '../models/payment.model';
import { Member } from '../models/member.model';
import { dateToTimestamp, firstDueFromJoin, yyyyMmDdFromLocalDate } from '../utils/date.utils';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';
import { InAppNotificationService } from './in-app-notification.service';

export interface MemberInput {
  firstName: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  gender?: Member['gender'];
  /** Legacy 4-digit Aadhaar tail. Kept for backward compat but new flow uses aadhaarNumber. */
  aadhaarLast4?: string;
  /** Full 12-digit Aadhaar number (optional, owner or member can fill). */
  aadhaarNumber?: string;
  address?: string;
  floorNumber: string;
  roomNumber: string;
  bedNumber: string;
  notes?: string;
  joinDate: Date;
  amount: number;
  /** Optional paid amount at onboarding (supports partial payment on create). */
  paidAmount?: number;
  /** Remaining balance when onboarding payment is partial. */
  pendingAmount?: number;
  /** Rent paid toward plan (display / member profile); use with `amount` and `pendingAmount`. */
  paidRent?: number;
  /** Security deposit / advance paid by member. */
  advancePaid?: number;
  /** Internal advance lifecycle marker. */
  advanceStatus?: 'held' | 'returned';
  paymentMethod: PaymentMethod;
  /** Edit flow: optionally add a payment record while updating member details. */
  recordPaymentOnUpdate?: boolean;
  status: Member['status'];
  /** Optional explicit due date (used by bulk import). */
  dueDate?: Date;
  /** Gym only; PG uses monthly billing. */
  subscriptionType?: SubscriptionType;
  /* ---- Optional self-onboarding fields (uploaded by owner now or by member later via link) ---- */
  profilePhotoUrl?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);
  private readonly inApp = inject(InAppNotificationService);

  /* Complaints disabled — restore helpers + getDoc/setDoc imports when feature fixed
  private normMobile10(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-10);
  }

  private complaintLookupRef(ownerId: string, mobile10: string) {
    return doc(this.fb.db, 'owners', ownerId, 'complaintMemberMobiles', mobile10);
  }

  private async upsertComplaintLookup(ownerId: string, mobileRaw: string): Promise<void> {
    const m = this.normMobile10(mobileRaw);
    if (m.length !== 10) return;
    await setDoc(this.complaintLookupRef(ownerId, m), { _: true }, { merge: true });
  }

  private async removeComplaintLookup(ownerId: string, mobileRaw: string): Promise<void> {
    const m = this.normMobile10(mobileRaw);
    if (m.length !== 10) return;
    try {
      await deleteDoc(this.complaintLookupRef(ownerId, m));
    } catch {
    }
  }
  */

  watchMembersForOwner(ownerId: string, callback: (members: Member[]) => void): Unsubscribe {
    const q = query(collection(this.fb.db, 'members'), where('ownerId', '==', ownerId));
    return onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => {
        const data = d.data() as Member;
        const amount = Math.max(0, Number(data.amount) || 0);
        const pendingAmount = Number(data.pendingAmount) || 0;
        const rawPaid = data.paidRent;
        const paidRent =
          rawPaid !== undefined && rawPaid !== null && String(rawPaid) !== ''
            ? Math.max(0, Math.min(amount, Number(rawPaid) || 0))
            : Math.max(0, amount - pendingAmount);
        list.push({
          ...data,
          memberId: d.id,
          subscriptionType: data.subscriptionType || 'monthly',
          pendingAmount,
          paidRent,
          advancePaid: Math.max(0, Number(data.advancePaid) || 0),
          advanceStatus: data.advanceStatus === 'returned' ? 'returned' : 'held',
        });
      });
      callback(list);
    });
  }

  members$(ownerId: string): Observable<Member[]> {
    return new Observable((sub) => {
      const unsub = this.watchMembersForOwner(ownerId, (m) => sub.next(m));
      return () => unsub();
    });
  }

  async addMember(input: MemberInput): Promise<string> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner') throw new Error('Not an owner');
    if (owner.status !== 'approved') {
      throw new Error('Your gym account must be approved by admin before you can add members.');
    }
    const join = input.joinDate;
    const sub: SubscriptionType =
      owner.businessType === 'gym' ? input.subscriptionType || 'monthly' : 'monthly';
    const due = input.dueDate || firstDueFromJoin(join, sub);
    const totalAmount = Math.max(0, Number(input.amount) || 0);
    const paidAmount = Math.max(0, Number(input.paidAmount ?? input.amount) || 0);
    const pendingAmount = Math.max(0, Number(input.pendingAmount) || 0);
    const advancePaid = Math.max(0, Number(input.advancePaid) || 0);
    const paidRentStored =
      input.paidRent !== undefined && input.paidRent !== null
        ? Math.max(0, Math.min(totalAmount, Number(input.paidRent) || 0))
        : Math.max(0, totalAmount - pendingAmount);
    const pendingAmountAligned = Math.max(0, totalAmount - paidRentStored);
    const isPartialPayment = pendingAmountAligned > 0;

    const profilePhotoUrl = (input.profilePhotoUrl || '').trim();
    const aadhaarFrontUrl = (input.aadhaarFrontUrl || '').trim();
    const aadhaarBackUrl = (input.aadhaarBackUrl || '').trim();
    const aadhaarNumber = (input.aadhaarNumber || '').trim();
    const allSelfFieldsFilled =
      Boolean(profilePhotoUrl) && Boolean(aadhaarFrontUrl) && Boolean(aadhaarBackUrl);

    // Create member document
    const memberRef = await addDoc(collection(this.fb.db, 'members'), {
      ownerId: owner.ownerId,
      businessType: owner.businessType,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || '',
      mobile: input.mobile?.trim() || '',
      email: input.email?.trim() || '',
      gender: input.gender || null,
      aadhaarLast4: input.aadhaarLast4?.trim() || '',
      aadhaarNumber,
      address: input.address?.trim() || '',
      floorNumber: input.floorNumber.trim(),
      roomNumber: input.roomNumber.trim(),
      bedNumber: input.bedNumber.trim(),
      notes: input.notes?.trim() || '',
      joinDate: dateToTimestamp(join),
      amount: totalAmount,
      dueDate: dateToTimestamp(due),
      status: input.status,
      subscriptionType: sub,
      pendingAmount: pendingAmountAligned,
      paidRent: paidRentStored,
      advancePaid,
      advanceStatus: 'held',
      profilePhotoUrl,
      aadhaarFrontUrl,
      aadhaarBackUrl,
      selfOnboardingStatus: allSelfFieldsFilled ? 'completed' : 'pending',
      createdAt: serverTimestamp(),
    });

    // If an amount is provided (payment made during member creation), create payment record
    if (paidAmount > 0) {
      await addDoc(collection(this.fb.db, 'payments'), {
        memberId: memberRef.id,
        ownerId: owner.ownerId,
        amount: paidAmount,
        date: dateToTimestamp(join), // Use join date as payment date
        method: input.paymentMethod,
        isPartialPayment,
        pendingAmount: pendingAmountAligned,
        createdAt: serverTimestamp(),
      });
    }

    /* Complaints disabled — restore when feature fixed
    try {
      await this.upsertComplaintLookup(owner.ownerId, input.mobile || '');
    } catch (e) {
    }
    */

    try {
      const display = `${input.firstName.trim()} ${input.lastName?.trim() || ''}`.trim() || 'Member';
      await this.inApp.addOwnerNotification(owner.ownerId, {
        title: 'New member added',
        body: `${display} was added to your list.`,
        category: 'member_added',
        memberId: memberRef.id,
      });
    } catch {
      /* non-fatal */
    }

    return memberRef.id;
  }

  async updateMember(memberId: string, input: MemberInput): Promise<void> {
    const owner = this.auth.profile();
    const ref = doc(this.fb.db, 'members', memberId);
    /* Complaints disabled — was: prevSnap/prevMobile for lookup sync
    const prevSnap = await getDoc(ref);
    const prevMobile = prevSnap.exists() ? String((prevSnap.data() as Member)['mobile'] ?? '') : '';
    */
    const join = input.joinDate;
    const sub: SubscriptionType =
      owner?.businessType === 'gym' ? input.subscriptionType || 'monthly' : 'monthly';
    const due = input.dueDate || firstDueFromJoin(join, sub);
    const paidAmount = Math.max(0, Number(input.paidAmount) || 0);
    const amount = Math.max(0, Number(input.amount) || 0);
    const paidRent =
      input.paidRent !== undefined && input.paidRent !== null
        ? Math.max(0, Math.min(amount, Number(input.paidRent) || 0))
        : Math.max(0, amount - Math.max(0, Number(input.pendingAmount) || 0));
    const pendingAmount = Math.max(0, amount - paidRent);
    const payload: Record<string, any> = {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || '',
      mobile: input.mobile?.trim() || '',
      email: input.email?.trim() || '',
      gender: input.gender || null,
      aadhaarLast4: input.aadhaarLast4?.trim() || '',
      aadhaarNumber: (input.aadhaarNumber || '').trim(),
      address: input.address?.trim() || '',
      floorNumber: input.floorNumber.trim(),
      roomNumber: input.roomNumber.trim(),
      bedNumber: input.bedNumber.trim(),
      notes: input.notes?.trim() || '',
      joinDate: dateToTimestamp(join),
      amount: input.amount,
      dueDate: dateToTimestamp(due),
      status: input.status,
      subscriptionType: sub,
      pendingAmount,
      paidRent,
      advancePaid: Math.max(0, Number(input.advancePaid) || 0),
    };
    if (typeof input.profilePhotoUrl === 'string') {
      payload['profilePhotoUrl'] = input.profilePhotoUrl.trim();
    }
    if (typeof input.aadhaarFrontUrl === 'string') {
      payload['aadhaarFrontUrl'] = input.aadhaarFrontUrl.trim();
    }
    if (typeof input.aadhaarBackUrl === 'string') {
      payload['aadhaarBackUrl'] = input.aadhaarBackUrl.trim();
    }
    if (input.status === 'inactive') {
      payload['advanceStatus'] = 'returned';
    }
    await updateDoc(ref, payload);

    if (input.recordPaymentOnUpdate && paidAmount > 0 && owner?.ownerId) {
      await addDoc(collection(this.fb.db, 'payments'), {
        memberId,
        ownerId: owner.ownerId,
        amount: paidAmount,
        date: dateToTimestamp(new Date()),
        method: input.paymentMethod,
        isPartialPayment: pendingAmount > 0,
        pendingAmount,
        createdAt: serverTimestamp(),
      });
    }
    /* Complaints disabled — restore when feature fixed
    const oid = owner?.ownerId;
    if (oid) {
      try {
        const nextMobile = input.mobile || '';
        if (this.normMobile10(prevMobile) !== this.normMobile10(nextMobile)) {
          await this.removeComplaintLookup(oid, prevMobile);
        }
        await this.upsertComplaintLookup(oid, nextMobile);
      } catch (e) {
      }
    }
    */
  }

  async updateBillingState(
    memberId: string,
    payload: { dueDate?: Date; subscriptionType?: SubscriptionType; pendingAmount?: number },
  ): Promise<void> {
    const ref = doc(this.fb.db, 'members', memberId);
    const updatePayload: {
      dueDate?: ReturnType<typeof dateToTimestamp>;
      subscriptionType?: SubscriptionType;
      pendingAmount?: number;
      paidRent?: number;
    } = {};
    if (payload.dueDate) updatePayload.dueDate = dateToTimestamp(payload.dueDate);
    if (payload.subscriptionType) updatePayload.subscriptionType = payload.subscriptionType;
    if (payload.pendingAmount !== undefined) {
      const pend = Math.max(0, Number(payload.pendingAmount) || 0);
      updatePayload.pendingAmount = pend;
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const plan = Math.max(0, Number((snap.data() as Member).amount) || 0);
        updatePayload.paidRent = Math.max(0, Math.min(plan, plan - pend));
      }
    }
    if (Object.keys(updatePayload).length === 0) return;
    await updateDoc(ref, updatePayload);
  }

  async updateMemberStatus(memberId: string, status: Member['status']): Promise<void> {
    const ref = doc(this.fb.db, 'members', memberId);
    if (status === 'inactive') {
      await updateDoc(ref, {
        status,
        advanceStatus: 'returned',
        scheduledVacateYyyyMmDd: deleteField(),
      });
    } else {
      await updateDoc(ref, { status });
    }
  }

  /** Set or clear planned vacate date (YYYY-MM-DD). Pass null/empty to remove. */
  async setMemberScheduledVacate(memberId: string, yyyyMmDd: string | null): Promise<void> {
    const ref = doc(this.fb.db, 'members', memberId);
    const v = String(yyyyMmDd ?? '').trim();
    if (!v) {
      await updateDoc(ref, { scheduledVacateYyyyMmDd: deleteField() });
      return;
    }
    await updateDoc(ref, { scheduledVacateYyyyMmDd: v });
  }

  /**
   * Marks active members inactive when their scheduled vacate date is on or before today (local).
   * Idempotent; safe to call after each members snapshot.
   */
  async applyScheduledVacatesIfDue(ownerId: string, list: Member[]): Promise<void> {
    const today = yyyyMmDdFromLocalDate(new Date());
    const due = list.filter(
      (m) =>
        m.ownerId === ownerId &&
        m.status === 'active' &&
        typeof m.scheduledVacateYyyyMmDd === 'string' &&
        m.scheduledVacateYyyyMmDd.length >= 8 &&
        m.scheduledVacateYyyyMmDd <= today,
    );
    for (const m of due) {
      try {
        await this.updateMemberStatus(m.memberId, 'inactive');
      } catch (e) {
        console.warn('applyScheduledVacatesIfDue failed', m.memberId, e);
      }
    }
  }

  /** Apply member-submitted onboarding data after owner approves. */
  async approvePendingSelfOnboarding(memberId: string): Promise<void> {
    const ref = doc(this.fb.db, 'members', memberId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Member not found');
    const m = snap.data() as Member;
    const p = m.pendingSelfOnboarding;
    if (!p) throw new Error('Nothing to approve');

    const aadhaarNumber = (p.aadhaarNumber || '').trim();
    const aadhaarLast4 =
      aadhaarNumber.length >= 4 ? aadhaarNumber.slice(-4) : (m.aadhaarLast4 || '').trim();

    const gender =
      p.gender === 'male' || p.gender === 'female' || p.gender === 'other' ? p.gender : m.gender ?? null;

    await updateDoc(ref, {
      profilePhotoUrl: p.profilePhotoUrl,
      aadhaarFrontUrl: p.aadhaarFrontUrl,
      aadhaarBackUrl: p.aadhaarBackUrl,
      email: (p.email || '').trim(),
      lastName: (p.lastName || '').trim(),
      gender,
      address: (p.address || '').trim(),
      aadhaarNumber,
      aadhaarLast4: aadhaarNumber ? aadhaarLast4 : (m.aadhaarLast4 || ''),
      pendingSelfOnboarding: deleteField(),
      selfOnboardingStatus: 'completed',
      selfOnboardingCompletedAt: serverTimestamp(),
      selfOnboardingTokenUsed: p.selfOnboardingTokenUsed,
    });
  }

  /** Discard pending submission so the member can be sent a new link. */
  async rejectPendingSelfOnboarding(memberId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'members', memberId), {
      pendingSelfOnboarding: deleteField(),
      selfOnboardingStatus: 'pending',
      selfOnboardingTokenUsed: deleteField(),
    });
  }

  async deleteMember(memberId: string): Promise<void> {
    const ref = doc(this.fb.db, 'members', memberId);
    await deleteDoc(ref);
    /* Complaints disabled — restore when feature fixed (was: getDoc + removeComplaintLookup)
    const owner = this.auth.profile();
    const snap = await getDoc(ref);
    const prevMobile = snap.exists() ? String((snap.data() as Member)['mobile'] ?? '') : '';
    if (owner?.ownerId) {
      try {
        await this.removeComplaintLookup(owner.ownerId, prevMobile);
      } catch (e) {
      }
    }
    */
  }
}
