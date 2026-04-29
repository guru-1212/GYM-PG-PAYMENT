import { Injectable, inject } from '@angular/core';
import { getAuth } from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { Member } from '../models/member.model';
import { Payment } from '../models/payment.model';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Identity of the signed-in member as projected from the custom-token claims
 * minted by `verifyMemberForApp`.
 */
export interface MemberAppIdentity {
  ownerId: string;
  memberId: string;
  memberDisplayName: string;
  ownerBusinessName: string;
}

/** Allowed complaint categories — fixed dropdown + free-text body. */
export const MEMBER_COMPLAINT_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Cleanliness',
  'Wi-Fi / Internet',
  'Food',
  'Security',
  'Maintenance',
  'Noise',
  'Other',
] as const;
export type MemberComplaintCategory = (typeof MEMBER_COMPLAINT_CATEGORIES)[number];

export interface MemberComplaint {
  complaintId: string;
  ownerId: string;
  memberId: string;
  memberMobile: string;
  memberName: string;
  roomNumber: string;
  floorNumber: string;
  bedNumber: string;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  source: 'member_app';
  createdAt: Timestamp | null;
  resolvedAt?: Timestamp | null;
  resolutionNote?: string;
}

/**
 * Member-only data service. All reads use a single `onSnapshot` per surface
 * (no polling) and all writes are scoped strictly to the signed-in member's
 * own ownerId/memberId, mirroring the additive Firestore rules added for the
 * `member_app` custom-token role.
 */
@Injectable({ providedIn: 'root' })
export class MemberSelfService {
  private readonly fb = inject(FirebaseAppService);

  /** Read identity straight from the active custom token claims. */
  async getIdentity(): Promise<MemberAppIdentity | null> {
    const auth = getAuth(this.fb.app);
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdTokenResult();
    if (token.claims['role'] !== 'member_app') return null;
    const ownerId = String(token.claims['ownerId'] || '');
    const memberId = String(token.claims['memberId'] || '');
    if (!ownerId || !memberId) return null;
    return {
      ownerId,
      memberId,
      memberDisplayName: String(token.claims['memberDisplayName'] || 'Member'),
      ownerBusinessName: String(token.claims['ownerBusinessName'] || 'your property'),
    };
  }

  /* ------------------------- profile ------------------------- */

  watchMyProfile(memberId: string, cb: (member: Member | null) => void): Unsubscribe {
    const ref = doc(this.fb.db, 'members', memberId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      cb({ ...(raw as unknown as Member), memberId: snap.id });
    });
  }

  /* ------------------------- payments ------------------------- */

  watchMyPayments(
    ownerId: string,
    memberId: string,
    cb: (rows: Payment[]) => void,
  ): Unsubscribe {
    // Firestore Index Required:
    //   payments | ownerId ASC, memberId ASC, date DESC
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
      limit(120),
    );
    return onSnapshot(q, (snap) => {
      const rows: Payment[] = [];
      snap.forEach((d) => {
        rows.push({ ...(d.data() as Payment), paymentId: d.id });
      });
      cb(rows);
    });
  }

  /* ------------------------- complaints ------------------------- */

  watchMyComplaints(
    ownerId: string,
    memberId: string,
    cb: (rows: MemberComplaint[]) => void,
  ): Unsubscribe {
    // Firestore Index Required:
    //   complaints | ownerId ASC, memberId ASC, createdAt DESC
    const q = query(
      collection(this.fb.db, 'complaints'),
      where('ownerId', '==', ownerId),
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      const rows: MemberComplaint[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        rows.push({
          complaintId: d.id,
          ownerId: String(data['ownerId'] || ''),
          memberId: String(data['memberId'] || ''),
          memberMobile: String(data['memberMobile'] || ''),
          memberName: String(data['memberName'] || ''),
          roomNumber: String(data['roomNumber'] || ''),
          floorNumber: String(data['floorNumber'] || ''),
          bedNumber: String(data['bedNumber'] || ''),
          category: String(data['category'] || 'Other'),
          message: String(data['message'] || ''),
          status: data['status'] === 'resolved' ? 'resolved' : 'open',
          source: 'member_app',
          createdAt: (data['createdAt'] as Timestamp | null) || null,
          resolvedAt: (data['resolvedAt'] as Timestamp | null) || null,
          resolutionNote:
            typeof data['resolutionNote'] === 'string' ? (data['resolutionNote'] as string) : undefined,
        });
      });
      cb(rows);
    });
  }

  /**
   * Read once whether the member has raised a complaint in the last 24h.
   * Used to render the cooldown copy + disable the form before submit.
   * Returns the next-allowed timestamp (in ms) when blocked, or `null` when
   * the next complaint can be raised immediately.
   */
  async getNextComplaintAllowedAtMs(memberId: string): Promise<number | null> {
    const ref = doc(this.fb.db, 'complaintLimits', memberId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const ts = data['lastCreatedAt'] as Timestamp | null;
    const last = ts?.toDate ? ts.toDate().getTime() : 0;
    if (!last) return null;
    const next = last + 24 * 60 * 60 * 1000;
    return next > Date.now() ? next : null;
  }

  /**
   * Submit a complaint. Atomic: in one writeBatch, upsert the per-member
   * rate-limit doc AND create the complaint. If 24h haven't elapsed since
   * the last complaint, Firestore rejects the limit-doc update and the whole
   * batch fails — keeping client and server in sync without server code.
   */
  async submitComplaint(input: {
    ownerId: string;
    memberId: string;
    memberMobile: string;
    memberName: string;
    roomNumber: string;
    floorNumber: string;
    bedNumber: string;
    category: MemberComplaintCategory | string;
    message: string;
  }): Promise<void> {
    const message = String(input.message || '').trim();
    if (message.length < 5) throw new Error('Please describe the issue (at least 5 characters).');
    if (message.length > 4000) throw new Error('Complaint is too long.');
    const category = String(input.category || '').trim();
    if (!category) throw new Error('Pick a category for your complaint.');

    const limitRef = doc(this.fb.db, 'complaintLimits', input.memberId);
    const complaintsCol = collection(this.fb.db, 'complaints');
    const newComplaintRef = doc(complaintsCol);

    const limitSnap = await getDoc(limitRef);

    const batch = writeBatch(this.fb.db);
    if (!limitSnap.exists()) {
      // First-ever complaint — `create` rule allows this.
      batch.set(limitRef, {
        ownerId: input.ownerId,
        memberId: input.memberId,
        lastCreatedAt: serverTimestamp(),
      });
    } else {
      // Subsequent — `update` rule enforces the 24h window server-side.
      batch.update(limitRef, { lastCreatedAt: serverTimestamp() });
    }
    batch.set(newComplaintRef, {
      ownerId: input.ownerId,
      memberId: input.memberId,
      memberMobile: input.memberMobile,
      memberName: input.memberName,
      roomNumber: input.roomNumber,
      floorNumber: input.floorNumber,
      bedNumber: input.bedNumber,
      category,
      message,
      status: 'open',
      source: 'member_app',
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'permission-denied') {
        throw new Error(
          'You can raise only one complaint every 24 hours. Please try again later.',
        );
      }
      throw e;
    }
  }
}

/** Convenience helper to upsert a `complaintLimits` doc — exported for tests. */
export async function _internalUpsertComplaintLimit(
  fb: FirebaseAppService,
  ownerId: string,
  memberId: string,
): Promise<void> {
  await setDoc(
    doc(fb.db, 'complaintLimits', memberId),
    { ownerId, memberId, lastCreatedAt: serverTimestamp() },
    { merge: true },
  );
}
