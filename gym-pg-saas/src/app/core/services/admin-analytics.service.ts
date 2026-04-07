import { Injectable, inject } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FirebaseAppService } from './firebase-app.service';

export interface AdminStats {
  totalOwners: number;
  totalMembers: number;
  totalPayments: number;
  monthlyAdminEarnings: number;
}

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private readonly fb = inject(FirebaseAppService);

  async getAdminStats(): Promise<AdminStats> {
    const [totalOwners, totalMembers, totalPayments, monthlyAdminEarnings] = await Promise.all([
      this.getTotalOwners(),
      this.getTotalMembers(),
      this.getTotalPayments(),
      this.getMonthlyAdminEarnings(),
    ]);

    return {
      totalOwners,
      totalMembers,
      totalPayments,
      monthlyAdminEarnings,
    };
  }

  async getTotalOwners(): Promise<number> {
    const q = query(collection(this.fb.db, 'owners'), where('role', '==', 'owner'));
    const docs = await getDocs(q);
    return docs.size;
  }

  async getTotalMembers(): Promise<number> {
    const docs = await getDocs(collection(this.fb.db, 'members'));
    return docs.size;
  }

  async getTotalPayments(): Promise<number> {
    const docs = await getDocs(collection(this.fb.db, 'payments'));
    return docs.size;
  }

  async getMonthlyAdminEarnings(): Promise<number> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const q = query(
      collection(this.fb.db, 'adminPayments'),
      where('date', '>=', firstDay),
      where('date', '<', lastDay),
    );

    const docs = await getDocs(q);
    let total = 0;

    docs.forEach((docSnap) => {
      total += docSnap.data()['amount'] || 0;
    });

    return total;
  }
}
