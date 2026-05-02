import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  addDoc,
} from 'firebase/firestore';
import { FirebaseAppService } from './firebase-app.service';
import { AdminPayment } from '../models/owner.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly fb = inject(FirebaseAppService);

  /**
   * Approve owner and set subscription plan
   */
  async approveOwnerWithPlan(ownerId: string, planDays: number): Promise<void> {
    const now = new Date();
    const endDate = new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);

    const batch = writeBatch(this.fb.db);

    // Update owner status and plan dates
    const ownerRef = doc(this.fb.db, 'owners', ownerId);
    batch.update(ownerRef, {
      status: 'approved',
      planStartDate: serverTimestamp(),
      planEndDate: endDate,
      'featureFlags.tenantMemberAppEnabled': true,
      complaintEnabled: true,
    });

    // Optional: Create admin payment record if you want to track revenue
    // (uncomment if needed)
    // const paymentRef = doc(collection(this.fb.db, 'adminPayments'));
    // batch.set(paymentRef, {
    //   ownerId,
    //   planDays,
    //   date: serverTimestamp(),
    //   createdAt: serverTimestamp(),
    // });

    await batch.commit();
  }

  /**
   * Extend owner's subscription
   */
  async extendPlan(ownerId: string, additionalDays: number): Promise<Date> {
    const q = query(collection(this.fb.db, 'owners'), where('__name__', '==', ownerId));
    const ownerDocs = await getDocs(q);

    if (ownerDocs.empty) {
      throw new Error('Owner not found');
    }

    const ownerData = ownerDocs.docs[0].data();

    // Calculate new end date based on current end date or today
    let newEndDate: Date;
    const currentEndDate = ownerData['planEndDate']?.toDate?.() || new Date();
    newEndDate = new Date(currentEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);

    await updateDoc(doc(this.fb.db, 'owners', ownerId), {
      planEndDate: newEndDate,
    });

    return newEndDate;
  }

  async setPlanEndDate(ownerId: string, planEndDate: Date): Promise<void> {
    await updateDoc(doc(this.fb.db, 'owners', ownerId), {
      planEndDate,
    });
  }

  /**
   * Check if owner subscription is active
   */
  async isSubscriptionActive(ownerId: string): Promise<boolean> {
    try {
      const q = query(collection(this.fb.db, 'owners'), where('__name__', '==', ownerId));
      const ownerDocs = await getDocs(q);

      if (ownerDocs.empty) return false;

      const ownerData = ownerDocs.docs[0].data();
      const planEndDate = ownerData['planEndDate']?.toDate?.();
      if (!planEndDate) return false;

      return new Date() <= planEndDate;
    } catch {
      return false;
    }
  }

  /**
   * Get days remaining in subscription
   */
  async getDaysRemaining(ownerId: string): Promise<number> {
    try {
      const q = query(collection(this.fb.db, 'owners'), where('__name__', '==', ownerId));
      const ownerDocs = await getDocs(q);

      if (ownerDocs.empty) return 0;

      const ownerData = ownerDocs.docs[0].data();
      if (!ownerData['planEndDate']) return 0;

      const planEndDate = ownerData['planEndDate'].toDate();
      const now = new Date();
      const daysRemaining = Math.ceil((planEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return Math.max(0, daysRemaining);
    } catch {
      return 0;
    }
  }

  /**
   * Get all owners with subscription info
   */
  async getAllOwnersWithSubscription(): Promise<any[]> {
    const q = query(collection(this.fb.db, 'owners'), where('role', '==', 'owner'));
    const docs = await getDocs(q);

    return docs.docs.map((docSnap) => {
      const data = docSnap.data();
      const planEndDate = data['planEndDate']?.toDate?.();
      const now = new Date();
      const daysRemaining = planEndDate
        ? Math.ceil((planEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const isExpired = planEndDate ? now > planEndDate : true;

      return {
        ownerId: docSnap.id,
        name: data['name'] || '',
        email: data['email'] || '',
        businessName: data['businessName'] || '',
        status: data['status'] || 'pending',
        planStartDate: data['planStartDate']?.toDate?.() || null,
        planEndDate: planEndDate || null,
        daysRemaining: Math.max(0, daysRemaining),
        isExpired,
        createdAt: data['createdAt']?.toDate?.() || null,
      };
    });
  }

  /**
   * Get this month's admin earnings
   */
  async getMonthlyAdminEarnings(): Promise<number> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const q = query(
      collection(this.fb.db, 'adminPayments'),
      where('date', '>=', firstDay),
      where('date', '<', new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    );

    const docs = await getDocs(q);
    let total = 0;

    docs.forEach((docSnap) => {
      total += docSnap.data()['amount'] || 0;
    });

    return total;
  }

  /**
   * Record admin payment (when owner purchases/renews subscription)
   */
  async recordAdminPayment(
    ownerId: string,
    ownerName: string,
    ownerEmail: string,
    amount: number,
    planDays: number,
  ): Promise<void> {
    const paymentRef = doc(collection(this.fb.db, 'adminPayments'));
    const payment: AdminPayment = {
      ownerId,
      ownerName,
      ownerEmail,
      amount,
      planDays,
      date: serverTimestamp() as any,
      createdAt: serverTimestamp() as any,
    };

    await addDoc(collection(this.fb.db, 'adminPayments'), payment);
  }
}
