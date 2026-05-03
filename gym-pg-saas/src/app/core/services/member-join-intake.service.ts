import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { MemberJoinIntake, MemberJoinIntakeStatus } from '../models/member-join-intake.model';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

const COLLECTION = 'memberJoinIntakes';
const TOKEN_TTL_MS = 10 * 60 * 1000;

export interface MemberJoinIntakeCreateResult {
  token: string;
  url: string;
  expiresAt: Date;
}

export interface MemberJoinIntakeSubmitPayload {
  firstName: string;
  lastName: string;
  mobile: string;
  aadhaarNumber: string;
  address: string;
}

@Injectable({ providedIn: 'root' })
export class MemberJoinIntakeService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  private intakeRef(token: string) {
    return doc(this.fb.db, COLLECTION, token);
  }

  private generateToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  buildShareUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/join-intake/${token}`;
  }

  normalizeMobile(raw: string): string {
    return String(raw || '')
      .replace(/\D/g, '')
      .slice(-10);
  }

  async createIntake(): Promise<MemberJoinIntakeCreateResult> {
    const profile = this.auth.profile();
    if (!profile) throw new Error('Not signed in');
    if (profile.status !== 'approved') throw new Error('Account must be approved.');
    const ownerId = profile.ownerId;
    if (!ownerId) throw new Error('Missing owner scope');

    const role = profile.role;
    if (role === 'owner') {
      // ok
    } else if (role === 'supervisor') {
      if (!this.auth.hasPermission('canAddMembers')) {
        throw new Error('You do not have permission to invite members.');
      }
    } else {
      throw new Error('Only owners or supervisors can create a join invite.');
    }

    const token = this.generateToken();
    const now = Date.now();
    const expiresAt = new Date(now + TOKEN_TTL_MS);
    const businessName =
      (profile.businessName || '').trim() || (profile.name || '').trim() || 'Your host';

    await setDoc(this.intakeRef(token), {
      ownerId,
      businessName,
      status: 'active' satisfies MemberJoinIntakeStatus,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });

    return { token, url: this.buildShareUrl(token), expiresAt };
  }

  async readIntake(token: string): Promise<MemberJoinIntake> {
    const snap = await getDoc(this.intakeRef(token));
    if (!snap.exists()) throw new Error('INTAKE_NOT_FOUND');
    const data = snap.data() as Omit<MemberJoinIntake, 'token'>;
    return { ...data, token };
  }

  /** Live updates for one invite (e.g. owner modal while QR is shown). */
  watchIntakeDoc(token: string, cb: (intake: MemberJoinIntake | null) => void): Unsubscribe {
    return onSnapshot(
      this.intakeRef(token),
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const data = snap.data() as Omit<MemberJoinIntake, 'token'>;
        cb({ ...data, token: snap.id });
      },
      () => cb(null),
    );
  }

  isIntakeOpenForPublicForm(intake: MemberJoinIntake): boolean {
    if (intake.status !== 'active') return false;
    if (!intake.expiresAt) return false;
    return intake.expiresAt.toDate().getTime() > Date.now();
  }

  async submitIntake(token: string, payload: MemberJoinIntakeSubmitPayload): Promise<void> {
    const mobile = this.normalizeMobile(payload.mobile);
    if (mobile.length !== 10) throw new Error('INVALID_MOBILE');

    await updateDoc(this.intakeRef(token), {
      status: 'submitted' satisfies MemberJoinIntakeStatus,
      submittedAt: serverTimestamp(),
      submissionFirstName: payload.firstName.trim().slice(0, 80),
      submissionLastName: (payload.lastName || '').trim().slice(0, 80),
      submissionMobile: mobile,
      submissionAadhaarNumber: (payload.aadhaarNumber || '').replace(/\D/g, '').slice(0, 12),
      submissionAddress: payload.address.trim().slice(0, 500),
    });
  }

  watchSubmittedIntakes(ownerId: string, cb: (rows: MemberJoinIntake[]) => void): Unsubscribe {
    const q = query(
      collection(this.fb.db, COLLECTION),
      where('ownerId', '==', ownerId),
      where('status', '==', 'submitted'),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows: MemberJoinIntake[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<MemberJoinIntake, 'token'>;
          rows.push({ ...data, token: d.id });
        });
        rows.sort((a, b) => {
          const ta = a.submittedAt?.toMillis?.() ?? 0;
          const tb = b.submittedAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        cb(rows);
      },
      (err) => {
        console.error('[memberJoinIntakes] submitted query failed', err);
        cb([]);
      },
    );
  }

  async dismissIntake(token: string): Promise<void> {
    const profile = this.auth.profile();
    if (!profile?.ownerId) throw new Error('Not signed in');
    await updateDoc(this.intakeRef(token), {
      status: 'dismissed' satisfies MemberJoinIntakeStatus,
      dismissedAt: serverTimestamp(),
    });
  }

  async markCompleted(token: string, linkedMemberId: string): Promise<void> {
    const profile = this.auth.profile();
    if (!profile?.ownerId) throw new Error('Not signed in');
    await updateDoc(this.intakeRef(token), {
      status: 'completed' satisfies MemberJoinIntakeStatus,
      linkedMemberId,
      completedAt: serverTimestamp(),
    });
  }
}
