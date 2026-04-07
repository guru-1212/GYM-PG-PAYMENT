import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
import { dateToTimestamp, firstDueFromJoin } from '../utils/date.utils';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

export interface MemberInput {
  firstName: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  gender?: Member['gender'];
  aadhaarLast4?: string;
  address?: string;
  floorNumber: string;
  roomNumber: string;
  bedNumber: string;
  notes?: string;
  joinDate: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  status: Member['status'];
  /** Optional explicit due date (used by bulk import). */
  dueDate?: Date;
  /** Gym only; PG uses monthly billing. */
  subscriptionType?: SubscriptionType;
}

@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  watchMembersForOwner(ownerId: string, callback: (members: Member[]) => void): Unsubscribe {
    const q = query(collection(this.fb.db, 'members'), where('ownerId', '==', ownerId));
    return onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((d) => {
        const data = d.data() as Member;
        list.push({
          ...data,
          memberId: d.id,
          subscriptionType: data.subscriptionType || 'monthly',
          pendingAmount: Number(data.pendingAmount) || 0,
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

  async addMember(input: MemberInput): Promise<void> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner') throw new Error('Not an owner');
    const join = input.joinDate;
    const sub: SubscriptionType =
      owner.businessType === 'gym' ? input.subscriptionType || 'monthly' : 'monthly';
    const due = input.dueDate || firstDueFromJoin(join, sub);

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
      pendingAmount: 0,
      createdAt: serverTimestamp(),
    });

    // If an amount is provided (payment made during member creation), create payment record
    if (input.amount > 0) {
      console.log('💰 Creating payment record for new member:', input.amount);
      await addDoc(collection(this.fb.db, 'payments'), {
        memberId: memberRef.id,
        ownerId: owner.ownerId,
        amount: input.amount,
        date: dateToTimestamp(join), // Use join date as payment date
        method: input.paymentMethod,
        isPartialPayment: false,
        pendingAmount: 0,
        createdAt: serverTimestamp(),
      });
      console.log('✅ Payment record created for member:', memberRef.id);
    }
  }

  async updateMember(memberId: string, input: MemberInput): Promise<void> {
    const owner = this.auth.profile();
    const ref = doc(this.fb.db, 'members', memberId);
    const join = input.joinDate;
    const sub: SubscriptionType =
      owner?.businessType === 'gym' ? input.subscriptionType || 'monthly' : 'monthly';
    const due = input.dueDate || firstDueFromJoin(join, sub);
    await updateDoc(ref, {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || '',
      mobile: input.mobile?.trim() || '',
      email: input.email?.trim() || '',
      gender: input.gender || null,
      aadhaarLast4: input.aadhaarLast4?.trim() || '',
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
      pendingAmount: 0,
    });
  }

  async updateBillingState(
    memberId: string,
    payload: { dueDate?: Date; subscriptionType?: SubscriptionType; pendingAmount?: number },
  ): Promise<void> {
    const updatePayload: {
      dueDate?: ReturnType<typeof dateToTimestamp>;
      subscriptionType?: SubscriptionType;
      pendingAmount?: number;
    } = {};
    if (payload.dueDate) updatePayload.dueDate = dateToTimestamp(payload.dueDate);
    if (payload.subscriptionType) updatePayload.subscriptionType = payload.subscriptionType;
    if (payload.pendingAmount !== undefined) updatePayload.pendingAmount = Math.max(0, Number(payload.pendingAmount) || 0);
    if (Object.keys(updatePayload).length === 0) return;
    await updateDoc(doc(this.fb.db, 'members', memberId), updatePayload);
  }

  async deleteMember(memberId: string): Promise<void> {
    await deleteDoc(doc(this.fb.db, 'members', memberId));
  }
}
