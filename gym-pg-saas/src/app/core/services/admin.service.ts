import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Owner } from '../models/owner.model';
import { FirebaseAppService } from './firebase-app.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly fb = inject(FirebaseAppService);

  watchAllOwners(callback: (owners: Owner[]) => void): Unsubscribe {
    const q = query(collection(this.fb.db, 'owners'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const list: Owner[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as Owner), ownerId: d.id }));
      callback(list);
    });
  }

  watchOwnerMemberCounts(callback: (counts: Record<string, number>) => void): Unsubscribe {
    return onSnapshot(
      collection(this.fb.db, 'members'),
      (snap) => {
        const counts: Record<string, number> = {};
        snap.forEach((d) => {
          const ownerId = String((d.data() as { ownerId?: string }).ownerId || '').trim();
          if (!ownerId) return;
          counts[ownerId] = (counts[ownerId] || 0) + 1;
        });
        callback(counts);
      },
      () => {
        callback({});
      },
    );
  }

  allOwners$(): Observable<Owner[]> {
    return new Observable((sub) => {
      const unsub = this.watchAllOwners((owners) => {
        sub.next(owners);
      });
      return () => unsub();
    });
  }

  async approveOwner(ownerId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'owners', ownerId), { status: 'approved' });
  }

  async rejectOwner(ownerId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'owners', ownerId), { status: 'rejected' });
  }

  async setOwnerStatus(ownerId: string, status: Owner['status']): Promise<void> {
    await updateDoc(doc(this.fb.db, 'owners', ownerId), { status });
  }

  /**
   * Toggle a per-owner feature flag (e.g. supervisor accounts, WhatsApp).
   * Stored on `owners/{ownerId}.featureFlags.<key>`. Absence = disabled.
   */
  async setOwnerFeatureFlag(
    ownerId: string,
    key: 'supervisorEnabled' | 'whatsappEnabled',
    value: boolean,
  ): Promise<void> {
    // Dot-path update so we don't clobber other flag keys.
    await updateDoc(doc(this.fb.db, 'owners', ownerId), {
      [`featureFlags.${key}`]: value,
    });
  }

  /**
   * Set the maximum number of supervisors an owner is allowed to create.
   * Pass `null` to clear (which falls back to the default of 2).
   */
  async setOwnerSupervisorQuota(ownerId: string, value: number | null): Promise<void> {
    const next = value === null ? null : Math.max(0, Math.floor(Number(value) || 0));
    await updateDoc(doc(this.fb.db, 'owners', ownerId), { supervisorQuota: next });
  }

  stats(owners: Owner[]): { total: number; pending: number; approved: number } {
    const nonAdmin = owners.filter((o) => o.role === 'owner');
    return {
      total: nonAdmin.length,
      pending: nonAdmin.filter((o) => o.status === 'pending').length,
      approved: nonAdmin.filter((o) => o.status === 'approved').length,
    };
  }
}
