import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { Owner } from '../models/owner.model';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Public-readable mirror of a small slice of the owner doc that the Member
 * PWA needs at runtime. The Member PWA cannot read `owners/{ownerId}` (PII),
 * so this lightweight projection lives at `publicOwnerStatus/{ownerId}` with
 * a wide-open read rule.
 *
 * Source of truth still lives on the owner doc - this is just an outbound
 * projection kept up to date by the owner shell (no Cloud Function required).
 */
export interface OwnerPublicStatus {
  ownerId: string;
  businessName: string;
  businessType: 'gym' | 'pg';
  /** Mirrors `owners.planEndDate`. null while the owner has not been activated yet. */
  planEndDate: Timestamp | null;
  planActive: boolean;
  /** Mirror of the owner's complaint feature toggle (kept for future use). */
  complaintEnabled: boolean;
  /**
   * When `false`, tenant QR sign-in + in-app complaints are off (admin revoked).
   * Absent/`true` = allowed for legacy + approved owners.
   */
  tenantMemberAppEnabled: boolean;
  /** Server timestamp of the last sync (debug + cache freshness). */
  updatedAt?: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class OwnerPublicStatusService {
  private readonly fb = inject(FirebaseAppService);

  private statusRef(ownerId: string) {
    return doc(this.fb.db, 'publicOwnerStatus', ownerId);
  }

  /**
   * Owner-only: upsert the mirror doc whenever the owner profile changes.
   * Idempotent and merge-based; safe to call on every profile snapshot tick.
   */
  async publishStatus(profile: Owner): Promise<void> {
    if (profile.role !== 'owner' || profile.status !== 'approved') return;
    const ownerId = profile.ownerId;
    if (!ownerId) return;
    const planEndDate = profile.planEndDate ?? null;
    const planActive =
      planEndDate?.toDate ? planEndDate.toDate().getTime() > Date.now() : false;
    try {
      await setDoc(
        this.statusRef(ownerId),
        {
          ownerId,
          businessName: String(profile.businessName || profile.name || '').trim(),
          businessType: profile.businessType,
          planEndDate,
          planActive,
          complaintEnabled: profile.complaintEnabled !== false,
          tenantMemberAppEnabled: profile.featureFlags?.tenantMemberAppEnabled !== false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      // Transient write failures are non-fatal; the next profile tick retries.
    }
  }

  /**
   * Public read (also used by the Member PWA via custom token). Returns
   * `null` if the doc doesn't exist yet (e.g. owner just signed up and
   * hasn't yet pushed their first sync).
   */
  watchStatus(
    ownerId: string,
    cb: (status: OwnerPublicStatus | null) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.statusRef(ownerId),
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        cb({
          ownerId,
          businessName: String(data['businessName'] || ''),
          businessType: data['businessType'] === 'gym' ? 'gym' : 'pg',
          planEndDate: (data['planEndDate'] as Timestamp | null) ?? null,
          planActive: Boolean(data['planActive']),
          complaintEnabled: data['complaintEnabled'] !== false,
          tenantMemberAppEnabled: data['tenantMemberAppEnabled'] !== false,
          updatedAt: (data['updatedAt'] as Timestamp | undefined) ?? undefined,
        });
      },
      (err) => {
        // Missing/outdated rules on a Firebase project used for local dev
        // (e.g. test-gym-pg-sass) would deny reads here; tenant sign-in still works.
        console.warn(
          '[OwnerPublicStatus] snapshot failed — deploy firestore.rules to this project or set useProdFirebase in environment.development.ts',
          err,
        );
        cb(null);
      },
    );
  }
}
