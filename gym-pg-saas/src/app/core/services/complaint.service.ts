import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  // @ts-expect-error addDoc not exported from Firebase v12 client SDK
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { FirebaseAppService } from './firebase-app.service';
import { dateToTimestamp } from '../utils/date.utils';

export interface Complaint {
  complaintId: string;
  ownerId: string;
  memberMobile: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: Timestamp | null;
}

@Injectable({ providedIn: 'root' })
export class ComplaintService {
  private readonly fb = inject(FirebaseAppService);
  private readonly syncedMemberLookups = new Set<string>();

  private normalizeMobile(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-10);
  }

  private publicSettingsRef(ownerId: string) {
    return doc(this.fb.db, 'publicOwnerComplaintSettings', ownerId.trim());
  }

  private complaintMobileLookupRef(ownerId: string, mobile10: string) {
    return doc(this.fb.db, 'owners', ownerId.trim(), 'complaintMemberMobiles', mobile10);
  }

  /**
   * Creates/updates `publicOwnerComplaintSettings/{ownerId}` with `complaintEnabled`.
   * Call when the owner profile is known (login snapshot, shell, toggle).
   */
  async publishPublicComplaintSettings(ownerId: string, complaintEnabled: boolean): Promise<void> {
    const id = ownerId?.trim();
    if (!id || !this.fb.auth.currentUser) return;
    try {
      await setDoc(this.publicSettingsRef(id), { complaintEnabled }, { merge: true });
    } catch {
      // Non-fatal; public form stays disabled until next successful sync.
    }
  }

  /**
   * Writes owners/{ownerId}/complaintMemberMobiles/{mobile} for every member (10-digit mobile).
   * Needed for the public complaint form when the visitor is not signed in.
   */
  async syncMemberMobileLookupsForOwner(ownerId: string): Promise<void> {
    const id = ownerId?.trim();
    if (!id || this.syncedMemberLookups.has(id) || !this.fb.auth.currentUser) return;
    try {
      const q = query(collection(this.fb.db, 'members'), where('ownerId', '==', id));
      const snap = await getDocs(q);
      let batch = writeBatch(this.fb.db);
      let n = 0;
      for (const d of snap.docs) {
        const m = this.normalizeMobile(String((d.data() as Record<string, unknown>)['mobile'] ?? ''));
        if (m.length !== 10) continue;
        batch.set(this.complaintMobileLookupRef(id, m), { _: true });
        n++;
        if (n >= 400) {
          await batch.commit();
          batch = writeBatch(this.fb.db);
          n = 0;
        }
      }
      if (n > 0) await batch.commit();
      this.syncedMemberLookups.add(id);
    } catch {
      // Owner can still use app; public form may fail member check until sync succeeds.
    }
  }

  /**
   * Safe for unauthenticated users: never throws. Missing doc, errors, or false → disabled.
   */
  async isComplaintEnabled(ownerId: string): Promise<boolean> {
    if (!ownerId?.trim()) return false;
    try {
      const snap = await getDoc(this.publicSettingsRef(ownerId.trim()));
      // @ts-ignore
      if (!snap.exists()) return false;
      const data = snap.data() as Record<string, unknown>;
      return Boolean(data['complaintEnabled']);
    } catch {
      return false;
    }
  }

  async setComplaintEnabled(ownerId: string, enabled: boolean): Promise<void> {
    const id = ownerId?.trim();
    if (!id) return;
    try {
      await updateDoc(doc(this.fb.db, 'owners', id), { complaintEnabled: enabled });
      await setDoc(this.publicSettingsRef(id), { complaintEnabled: enabled }, { merge: true });
    } catch (e) {
      this.rethrowFirestoreError(e, 'setComplaintEnabled');
    }
  }

  async memberExistsByMobile(ownerId: string, mobile: string): Promise<boolean> {
    const normalized = this.normalizeMobile(mobile);
    if (!ownerId?.trim() || normalized.length !== 10) return false;
    try {
      const snap = await getDoc(this.complaintMobileLookupRef(ownerId.trim(), normalized));
      // @ts-ignore
      return snap.exists();
    } catch (e) {
      this.rethrowFirestoreError(e, 'memberExistsByMobile');
    }
  }

  async hasComplaintInLast24Hours(ownerId: string, mobile: string): Promise<boolean> {
    const normalized = this.normalizeMobile(mobile);
    if (!ownerId?.trim() || normalized.length !== 10) return false;
    if (!this.fb.auth.currentUser) {
      return false;
    }
    const last24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      // Firestore Index Required:
      // Collection: complaints
      // Fields:
      // ownerId (Asc)
      // memberMobile (Asc)
      // createdAt (Asc)
      const q = query(
        collection(this.fb.db, 'complaints'),
        where('ownerId', '==', ownerId.trim()),
        where('memberMobile', '==', normalized),
        where('createdAt', '>=', dateToTimestamp(last24)),
        orderBy('createdAt', 'asc'),
        limit(1),
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (e) {
      this.rethrowFirestoreError(e, 'hasComplaintInLast24Hours');
    }
  }

  async submitComplaint(input: { ownerId: string; memberMobile: string; message: string }): Promise<void> {
    const ownerId = input.ownerId.trim();
    const mobile = this.normalizeMobile(input.memberMobile);
    const message = input.message.trim();
    if (!ownerId) throw new Error('ownerId missing');
    if (mobile.length !== 10) throw new Error('invalid mobile');
    if (!message) throw new Error('message required');
    try {
      await addDoc(collection(this.fb.db, 'complaints'), {
        ownerId,
        memberMobile: mobile,
        message,
        status: 'open',
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      this.rethrowFirestoreError(e, 'submitComplaint');
    }
  }

  watchComplaintsForOwner(ownerId: string, callback: (rows: Complaint[]) => void): () => void {
    // Firestore Index Required:
    // Collection: complaints
    // Fields:
    // ownerId (Asc)
    // createdAt (Desc)
    const q = query(
      collection(this.fb.db, 'complaints'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    return onSnapshot(
      q,
      (snap: any) => {
        const rows: Complaint[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as Record<string, unknown>;
          rows.push({
            complaintId: d.id,
            ownerId: String(data['ownerId'] || ''),
            memberMobile: String(data['memberMobile'] || ''),
            message: String(data['message'] || ''),
            status: data['status'] === 'resolved' ? 'resolved' : 'open',
            createdAt: (data['createdAt'] as Timestamp | null) || null,
          });
        });
        callback(rows);
      },
      (e) => {
        this.rethrowFirestoreError(e, 'watchComplaintsForOwner');
      },
    );
  }

  private rethrowFirestoreError(err: unknown, stage: string): never {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'unknown';
    const message =
      err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Unknown Firestore error';
    throw new Error(`[ComplaintService:${stage}] ${code} - ${message}`);
  }
}

