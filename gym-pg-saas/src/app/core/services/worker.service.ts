import { Injectable, inject } from '@angular/core';
import {
  collection,
  addDoc,
  DocumentData,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  serverTimestamp,
  Unsubscribe,
  where,
  QueryDocumentSnapshot,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { Worker, WorkerPermissions } from '../models/worker.model';
import { OwnerFeatures } from '../models/feture.model';
import { FirebaseAppService } from './firebase-app.service';

@Injectable({ providedIn: 'root' })
export class WorkerService {
  private readonly fb = inject(FirebaseAppService);

  /**
   * Watch all workers for a specific owner in real-time
   */
  watchWorkersByOwner(
    ownerId: string,
    callback: (workers: Worker[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    const q = query(
      collection(this.fb.db, 'workers'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const list: Worker[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
          ...(d.data() as Worker),
          workerId: d.id,
        }));
        callback(list);
      },
      (error: any) => {
        console.error('Worker listener error:', error);
        onError?.(error);
      }
    );
  }

  /**
   * Get only active workers for an owner (for counting max 2 workers limit)
   */
  async getActiveWorkersCount(ownerId: string): Promise<number> {
    const q = query(
      collection(this.fb.db, 'workers'),
      where('ownerId', '==', ownerId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  /**
   * Create a new worker (max 2 per owner)
   */
  async createWorker(
    ownerId: string,
    name: string,
    email: string,
    password: string,
    permissions: WorkerPermissions,
    ownerFeatures: OwnerFeatures
  ): Promise<string> {
    // Check max 2 workers limit
    const activeCount = await this.getActiveWorkersCount(ownerId);
    if (activeCount >= 2) {
      throw new Error('Maximum 2 workers allowed per owner');
    }

    // Validate that worker permissions are subset of owner features
    const validPermissions = this.validatePermissions(permissions, ownerFeatures);

    try {
      const docRef = await addDoc(collection(this.fb.db, 'workers'), {
        ownerId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password, // Note: Should be hashed in production! For now using Firestore-based login
        role: 'worker',
        status: 'active',
        permissions: validPermissions,
        features: ownerFeatures,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating worker:', error);
      throw error;
    }
  }

  /**
   * Update worker permissions (must be subset of owner features)
   */
  async updateWorkerPermissions(
    workerId: string,
    permissions: WorkerPermissions,
    ownerFeatures: OwnerFeatures
  ): Promise<void> {
    const validPermissions = this.validatePermissions(permissions, ownerFeatures);
    await updateDoc(doc(this.fb.db, 'workers', workerId), {
      permissions: validPermissions,
    });
  }

  /**
   * Deactivate a worker
   */
  async deactivateWorker(workerId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'workers', workerId), {
      status: 'inactive',
    });
  }

  /**
   * Reactivate a worker
   */
  async reactivateWorker(workerId: string): Promise<void> {
    await updateDoc(doc(this.fb.db, 'workers', workerId), {
      status: 'active',
    });
  }

  /**
   * Delete a worker
   */
  async deleteWorker(workerId: string): Promise<void> {
    await deleteDoc(doc(this.fb.db, 'workers', workerId));
  }

  /**
   * Firestore-based worker login (check email/password)
   */
  async workerLogin(email: string, password: string): Promise<Worker | null> {
    const normalizedEmail = email.trim().toLowerCase();
    console.debug('[Worker] Login attempt: email =', normalizedEmail);
    
    try {
      console.debug('[Worker] Query 1: Querying active workers with email+status filter');
      const q = query(
        collection(this.fb.db, 'workers'),
        where('email', '==', normalizedEmail),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      console.debug('[Worker] Query 1 returned', snap.size, 'document(s)');

      if (snap.size > 0) {
        const workerDoc = snap.docs[0];
        const worker = workerDoc.data() as Worker;

        // Simple password check (in production, use bcrypt or similar)
        if (worker.password !== password) {
          console.debug('[Worker] Password mismatch for email:', normalizedEmail);
          return null;
        }

        console.debug('[Worker] Query 1 login successful for:', normalizedEmail);
        return {
          ...worker,
          workerId: workerDoc.id,
        };
      }
    } catch (error: any) {
      console.warn('[Worker] Query 1 failed:', error?.code, error?.message);
      // Continue to fallback query
    }

    // Fallback: Try to find worker without status filter (in case status field missing)
    try {
      console.debug('[Worker] Query 2 (Fallback): Searching by email only');
      const q = query(
        collection(this.fb.db, 'workers'),
        where('email', '==', normalizedEmail)
      );
      const snap = await getDocs(q);
      console.debug('[Worker] Query 2 returned', snap.size, 'document(s)');

      if (snap.size === 0) {
        console.debug('[Worker] No worker found with email:', normalizedEmail);
        return null;
      }

      // Check first result
      const workerDoc = snap.docs[0];
      const worker = workerDoc.data() as Worker;

      // Verify password
      if (worker.password !== password) {
        console.debug('[Worker] Password mismatch (Query 2)');
        return null;
      }

      // Verify status is 'active' or missing (treat missing as active)
      const status = worker.status || 'active';
      if (status !== 'active') {
        console.debug('[Worker] Worker status is not active:', status);
        return null;
      }

      console.debug('[Worker] Query 2 login successful for:', normalizedEmail);
      return {
        ...worker,
        workerId: workerDoc.id,
      };
    } catch (error: any) {
      console.error('[Worker] Query 2 also failed:', error?.code, error?.message);
      return null;
    }
  }

  /**
   * Get worker by ID
   */
  async getWorkerById(workerId: string): Promise<Worker | null> {
    const snap = await getDocs(query(
      collection(this.fb.db, 'workers'),
      where('workerId', '==', workerId)
    ));

    if (snap.empty) {
      return null;
    }

    const workerDoc = snap.docs[0];
    return {
      ...(workerDoc.data() as Worker),
      workerId: workerDoc.id,
    };
  }

  /**
   * Ensure worker permissions are only a subset of owner features
   */
  private validatePermissions(
    permissions: WorkerPermissions,
    ownerFeatures: OwnerFeatures
  ): WorkerPermissions {
    const validated: WorkerPermissions = {};

    // Map worker permissions to owner features
    const permissionMap: Record<keyof WorkerPermissions, keyof OwnerFeatures | null> = {
      dashboard_view_basic: 'monthly_view',
      dashboard_view_member_count: 'monthly_view',
      dashboard_view_earnings: 'monthly_view',
      members_view_list: 'monthly_view',
      members_add: 'worker_management',
      members_edit: 'worker_management',
      members_activate_deactivate: 'worker_management',
      members_delete: 'worker_management',
      members_view_history: 'monthly_view',
      payments_view: 'payment_edit',
      payments_collect: 'payment_edit',
      payments_export_pdf: 'payment_edit',
      monthly_earnings_view: 'monthly_view',
      rooms_view: 'worker_management',
      rooms_edit_layout: 'worker_management',
      workers_view: 'worker_management',
      workers_manage: 'worker_management',
      reports_download: 'monthly_view',
      view_members: 'monthly_view', // Example mapping
      view_payments: 'payment_edit',
      view_rooms: 'worker_management',
      view_monthly_earnings: 'monthly_view',
      view_dashboard_earnings: 'monthly_view',
      add_member: 'worker_management',
      collect_payment: 'payment_edit',
    };

    for (const [workerPerm, featureKey] of Object.entries(permissionMap)) {
      if (featureKey && ownerFeatures[featureKey]) {
        validated[workerPerm as keyof WorkerPermissions] = permissions[workerPerm as keyof WorkerPermissions] || false;
      } else {
        validated[workerPerm as keyof WorkerPermissions] = false;
      }
    }

    return validated;
  }
}
