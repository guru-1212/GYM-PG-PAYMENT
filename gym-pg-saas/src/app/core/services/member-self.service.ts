import { Injectable, inject } from '@angular/core';
import { getAuth } from 'firebase/auth';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { Member } from '../models/member.model';
import { Payment } from '../models/payment.model';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Identity projected from the `verifyMemberForApp` custom token claims.
 * Minted by Cloud Functions; read-only on the client.
 */
export interface MemberAppIdentity {
  ownerId: string;
  memberId: string;
  memberDisplayName: string;
  ownerBusinessName: string;
  /** 10-digit mobile from custom token (set by verifyMemberForApp). */
  memberMobile?: string;
  roomNumber?: string;
  floorNumber?: string;
  bedNumber?: string;
}

/** Allowed complaint categories in the member PWA (must stay in sync with owner UI). */
export const MEMBER_COMPLAINT_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Cleaning',
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

export interface SubmitMemberComplaintInput {
  ownerId: string;
  memberId: string;
  memberMobile: string;
  memberName: string;
  roomNumber: string;
  floorNumber: string;
  bedNumber: string;
  category: MemberComplaintCategory | string;
  message: string;
}

/**
 * Member-only Firestore reads + complaint submit. All listeners are scoped to
 * `ownerId` + `memberId` from the signed-in custom token — no cross-tenant access.
 */
@Injectable({ providedIn: 'root' })
export class MemberSelfService {
  private readonly fb = inject(FirebaseAppService);

  /** Parse `member_app` claims from the active Firebase session. */
  async getIdentity(): Promise<MemberAppIdentity | null> {
    const auth = getAuth(this.fb.app);
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdTokenResult();
    if (String(token.claims['role'] || '') !== 'member_app') return null;
    const ownerId = String(token.claims['ownerId'] || '');
    const memberId = String(token.claims['memberId'] || '');
    if (!ownerId || !memberId) return null;
    const mobileRaw = String(token.claims['memberMobile'] || '').replace(/\D/g, '').slice(-10);
    return {
      ownerId,
      memberId,
      memberDisplayName: String(token.claims['memberDisplayName'] || 'Member'),
      ownerBusinessName: String(token.claims['ownerBusinessName'] || 'Your property'),
      memberMobile: mobileRaw.length === 10 ? mobileRaw : undefined,
      roomNumber: String(token.claims['roomNumber'] || '') || undefined,
      floorNumber: String(token.claims['floorNumber'] || '') || undefined,
      bedNumber: String(token.claims['bedNumber'] || '') || undefined,
    };
  }

  /** Live member profile (`members/{memberId}`). */
  watchMyProfile(
    memberId: string,
    cb: (m: Member | null) => void,
    onError?: (err: unknown) => void,
  ): Unsubscribe {
    const ref = doc(this.fb.db, 'members', memberId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        cb({ ...(snap.data() as Member), memberId: snap.id });
      },
      (err) => {
        onError?.(err);
        cb(null);
      },
    );
  }

  /**
   * All payments for this member under the top-level `payments` collection.
   * Composite index: ownerId ASC, memberId ASC, date DESC.
   */
  watchMyPayments(
    ownerId: string,
    memberId: string,
    cb: (rows: Payment[]) => void,
    onError?: (err: unknown) => void,
  ): Unsubscribe {
    const q = query(
      collection(this.fb.db, 'payments'),
      where('ownerId', '==', ownerId),
      where('memberId', '==', memberId),
      orderBy('date', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows: Payment[] = [];
        snap.forEach((d) => {
          rows.push({ ...(d.data() as Payment), paymentId: d.id });
        });
        cb(rows);
      },
      (err) => {
        onError?.(err);
        cb([]);
      },
    );
  }

  /** This member's in-app complaints, newest first. */
  watchMyComplaints(
    ownerId: string,
    memberId: string,
    cb: (rows: MemberComplaint[]) => void,
    onError?: (err: unknown) => void,
  ): Unsubscribe {
    const q = query(
      collection(this.fb.db, 'complaints'),
      where('ownerId', '==', ownerId),
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows: MemberComplaint[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          rows.push({
            complaintId: d.id,
            ownerId: String(x['ownerId'] || ''),
            memberId: String(x['memberId'] || ''),
            memberMobile: String(x['memberMobile'] || ''),
            memberName: String(x['memberName'] || ''),
            roomNumber: String(x['roomNumber'] || ''),
            floorNumber: String(x['floorNumber'] || ''),
            bedNumber: String(x['bedNumber'] || ''),
            category: String(x['category'] || ''),
            message: String(x['message'] || ''),
            status: x['status'] === 'resolved' ? 'resolved' : 'open',
            source: 'member_app',
            createdAt: (x['createdAt'] as Timestamp) || null,
            resolvedAt: (x['resolvedAt'] as Timestamp) || null,
            resolutionNote: x['resolutionNote'] ? String(x['resolutionNote']) : undefined,
          });
        });
        cb(rows);
      },
      (err) => {
        onError?.(err);
        cb([]);
      },
    );
  }

  /**
   * Create an in-app complaint for this member. Firestore rules enforce `source`,
   * field sizes, and tenant access.
   */
  async submitComplaint(input: SubmitMemberComplaintInput): Promise<void> {
    const identity = await this.getIdentity();
    if (!identity || identity.memberId !== input.memberId || identity.ownerId !== input.ownerId) {
      throw new Error('Not signed in as this member.');
    }

    const message = String(input.message || '').trim();
    if (message.length < 5 || message.length > 4000) {
      throw new Error('Please enter a complaint message (5–4000 characters).');
    }
    const category = String(input.category || '').trim();
    if (category.length < 2 || category.length > 60) {
      throw new Error('Please pick a valid category.');
    }

    const db = this.fb.db;
    try {
      await addDoc(collection(db, 'complaints'), {
        ownerId: input.ownerId,
        memberId: input.memberId,
        memberMobile: input.memberMobile,
        memberName: input.memberName,
        roomNumber: input.roomNumber,
        floorNumber: input.floorNumber,
        bedNumber: input.bedNumber,
        category,
        message,
        source: 'member_app',
        status: 'open',
        createdAt: serverTimestamp(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/permission|insufficient/i.test(msg)) {
        throw new Error('Could not send complaint. Check your connection or ask your owner if complaints are enabled.');
      }
      throw e instanceof Error ? e : new Error('Could not send complaint.');
    }
  }
}
