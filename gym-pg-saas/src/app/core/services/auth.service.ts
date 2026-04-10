import { Injectable, computed, inject, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  DocumentSnapshot,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { Owner, OwnerRole, OwnerStatus } from '../models/owner.model';
// Complaints disabled — restore when feature fixed
// import { ComplaintService } from './complaint.service';
import { FirebaseAppService } from './firebase-app.service';

function normalizeRole(v: unknown): OwnerRole | '' {
  const s = String(v ?? '')
    .toLowerCase()
    .trim();
  if (s === 'admin' || s === 'owner') return s;
  return s as OwnerRole;
}

function normalizeStatus(v: unknown): OwnerStatus | '' {
  const s = String(v ?? '')
    .toLowerCase()
    .trim();
  if (s === 'pending' || s === 'approved' || s === 'rejected' || s === 'inactive') return s;
  return s as OwnerStatus;
}

function ownerFromSnapshot(snap: DocumentSnapshot): Owner | null {
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  return {
    ...(raw as unknown as Owner),
    ownerId: snap.id,
    role: normalizeRole(raw['role']) as Owner['role'],
    status: normalizeStatus(raw['status']) as Owner['status'],
  };
}

/** Result of reading `owners/{uid}` (used for login toasts / console — not an HTTP error when doc is missing). */
export type ProfileLoadResult = {
  owner: Owner | null;
  uid: string | null;
  problem?: 'no-signed-in-user' | 'no-firestore-document' | 'permission-denied' | 'fetch-failed';
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly fb = inject(FirebaseAppService);
  // private readonly complaints = inject(ComplaintService);

  readonly user = signal<User | null>(null);
  readonly profile = signal<Owner | null>(null);
  readonly loading = signal(true);

  readonly isAdmin = computed(() => this.profile()?.role === 'admin');
  readonly isApprovedOwner = computed(
    () => this.profile()?.role === 'owner' && this.profile()?.status === 'approved',
  );
  readonly isSubscriptionValid = computed(() => {
    const profile = this.profile();
    if (!profile || !profile.planEndDate) return false;
    const planEndDate = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    return new Date() <= planEndDate;
  });

  private profileUnsub: Unsubscribe | null = null;
  /** Avoid unsub/resub on repeated onAuthStateChanged for the same UID (Firefox: NS_BINDING_ABORTED on Write/Listen channel). */
  private profileListenerUid: string | null = null;

  constructor() {
    onAuthStateChanged(this.fb.auth, (u) => {
      this.user.set(u);

      if (!u) {
        this.profileUnsub?.();
        this.profileUnsub = null;
        this.profileListenerUid = null;
        this.profile.set(null);
        this.loading.set(false);
        return;
      }

      if (this.profileListenerUid === u.uid && this.profileUnsub) {
        this.loading.set(false);
        return;
      }

      this.profileUnsub?.();
      this.profileUnsub = null;
      this.profileListenerUid = u.uid;

      if (!environment.production) {
        console.log('[Auth] Firebase Auth UID:', u.uid, '(attach owners listener)');
      }

      const ref = doc(this.fb.db, 'owners', u.uid);
      this.profileUnsub = onSnapshot(
        ref,
        (snap) => {
          const o = ownerFromSnapshot(snap);
          this.profile.set(o);
          if (!environment.production) {
            console.log('[Auth] onSnapshot owners/' + u.uid, o ? { role: o.role, status: o.status } : 'no document');
          }
          this.loading.set(false);
          /* Complaints disabled — restore when feature fixed
          if (o?.role === 'owner') {
            void this.complaints.publishPublicComplaintSettings(o.ownerId, Boolean(o.complaintEnabled));
          }
          */
        },
        (err) => {
          if (!environment.production) {
            console.error('[Auth] onSnapshot owners/' + u.uid + ' error', err);
          }
          this.profile.set(null);
          this.loading.set(false);
        },
      );
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.fb.auth, email.trim(), password);
    // Ensures currentUser is set before refreshProfile / getDoc (avoids race after sign-in)
    await this.fb.auth.authStateReady();
  }

  async signUp(
    email: string,
    password: string,
    name: string,
    businessName: string,
    businessType: 'gym' | 'pg',
  ): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.fb.auth, email.trim(), password);
    const uid = cred.user.uid;
    try {
      await setDoc(doc(this.fb.db, 'owners', uid), {
        ownerId: uid,
        name: name.trim(),
        businessName: businessName.trim(),
        email: email.trim().toLowerCase(),
        businessType,
        role: 'owner',
        status: 'pending',
        complaintEnabled: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      // Avoid orphaned Auth users when Firestore create is denied (rules) or fails
      try {
        await deleteUser(cred.user);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  async signOut(): Promise<void> {
    await signOut(this.fb.auth);
  }

  /**
   * One-shot read of `owners/{uid}`. Prefer this return value right after sign-in —
   * the `profile` signal may not match until the microtask queue runs if you only read `profile()`.
   */
  async refreshProfile(): Promise<Owner | null> {
    const r = await this.loadProfileOnce();
    return r.owner;
  }

  /**
   * Same as refreshProfile but explains *why* `owner` is null.
   * Firestore often returns HTTP 200 with an empty document — that is "no profile", not a failed request.
   */
  async loadProfileOnce(): Promise<ProfileLoadResult> {
    await this.fb.auth.authStateReady();
    const u = this.fb.auth.currentUser;
    if (!u) {
      console.log(
        '%c PayBook Auth ',
        'background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
        'No Firebase user after authStateReady — cannot load owners/{uid}.',
      );
      this.profile.set(null);
      return { owner: null, uid: null, problem: 'no-signed-in-user' };
    }

    const uid = u.uid;
    // Use console.log (not info/warn): Firefox “Errors”-only filter hides info/warn; production may strip some levels.
    console.log(
      '%c PayBook Auth ',
      'background:#047857;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
      'Signed-in UID (use this as Firestore document ID under collection "owners"):',
      uid,
    );

    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', uid));
      if (!snap.exists()) {
        console.log(
          '%c PayBook Auth ',
          'background:#b91c1c;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
          'NO profile document found.',
          '\n1. Open Firebase Console → Firestore → collection "owners"',
          '\n2. Add document → Document ID = paste exactly:',
          '\n   ' + uid,
          '\n3. Fields: role, status, name, email, businessType, ownerId, createdAt',
        );
        this.profile.set(null);
        return { owner: null, uid, problem: 'no-firestore-document' };
      }

      const o = ownerFromSnapshot(snap);
      if (o) {
        this.profile.set(o);
        console.log(
          '%c PayBook Auth ',
          'background:#047857;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
          'Profile loaded OK.',
          { role: o.role, status: o.status },
        );
      }
      return { owner: o, uid };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      console.log(
        '%c PayBook Auth ERROR ',
        'background:#b91c1c;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
        'getDoc(owners/' + uid + ') failed:',
        e,
      );
      this.profile.set(null);
      const problem = code === 'permission-denied' ? 'permission-denied' : 'fetch-failed';
      return { owner: null, uid, problem };
    }
  }
}
