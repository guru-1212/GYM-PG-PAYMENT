import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  getDocs,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Owner } from '../models/owner.model';
import { OwnerFeatures } from '../models/feture.model';
import { FirebaseAppService } from './firebase-app.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly fb = inject(FirebaseAppService);

  watchAllOwners(callback: (owners: Owner[]) => void): () => void {
    const q = query(collection(this.fb.db, 'owners'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap: any) => {
      const list: Owner[] = [];
      snap.forEach((d: any) => list.push({ ...(d.data() as Owner), ownerId: d.id }));
      callback(list);
    });
  }

  watchOwnerMemberCounts(callback: (counts: Record<string, number>) => void): () => void {
    return onSnapshot(
      collection(this.fb.db, 'members'),
      (snap: any) => {
        const counts: Record<string, number> = {};
        snap.forEach((d: any) => {
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

  async updateOwnerFeatures(ownerId: string, features: OwnerFeatures): Promise<void> {
    // Update owner features
    await updateDoc(doc(this.fb.db, 'owners', ownerId), { features });
    
    // Sync features to all active workers of this owner
    const q = query(
      collection(this.fb.db, 'workers'),
      where('ownerId', '==', ownerId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const batch = writeBatch(this.fb.db);
    snap.docs.forEach(workerDoc => {
      batch.update(doc(this.fb.db, 'workers', workerDoc.id), { features });
    });
    await batch.commit();
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
