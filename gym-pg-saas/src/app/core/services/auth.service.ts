import { Injectable, computed, inject, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  DocumentSnapshot,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { Owner, OwnerRole, OwnerStatus } from '../models/owner.model';
import { FirebaseAppService } from './firebase-app.service';
import {
  digitsOnly,
  normalizeOwnerLoginEmailKey,
  normalizeOwnerPhone,
  OWNER_LOGIN_ALIASES_COLLECTION,
  OWNER_PHONE_LOGIN_ALIASES_COLLECTION,
} from '../utils/phone-auth.util';

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

/** Auth email stored on alias docs: field name must match Firestore rules (`email` on phone aliases). */
function readAliasAuthEmail(data: Record<string, unknown>): string | null {
  const v = data['email'] ?? data['authLoginEmail'];
  return typeof v === 'string' && v.includes('@') ? v.trim().toLowerCase() : null;
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

      const ref = doc(this.fb.db, 'owners', u.uid);
      this.profileUnsub = onSnapshot(
        ref,
        (snap) => {
          const o = ownerFromSnapshot(snap);
          this.profile.set(o);
          this.loading.set(false);
        },
        () => {
          this.profile.set(null);
          this.loading.set(false);
        },
      );
    });
  }

  /**
   * Email: Firebase email/password, with optional `ownerLoginAliases` retry for legacy mapped emails.
   * Mobile: digits-only key → `ownerPhoneLoginAliases/{digits}` → `email` field → signInWithEmailAndPassword.
   * No Firebase Phone Auth / OTP / synthetic Auth emails.
   */
  async signIn(identifier: string, password: string): Promise<void> {
    const id = identifier.trim();
    if (id.includes('@')) {
      try {
        await signInWithEmailAndPassword(this.fb.auth, id, password);
      } catch (e) {
        if (!this.isAuthRetryableForAlias(e)) throw e;
        const resolved = await this.getAuthEmailForContactLogin(id);
        if (!resolved || resolved === normalizeOwnerLoginEmailKey(id)) throw e;
        await signInWithEmailAndPassword(this.fb.auth, resolved, password);
      }
    } else {
      const n = normalizeOwnerPhone(id);
      if (!n) {
        const err = new Error('Invalid mobile number');
        (err as { code?: string }).code = 'auth/invalid-phone-number';
        throw err;
      }
      const phoneDigits = digitsOnly(n);
      if (phoneDigits.length < 10) {
        const err = new Error('Invalid mobile number');
        (err as { code?: string }).code = 'auth/invalid-phone-number';
        throw err;
      }
      const loginEmail = await this.getLoginEmailFromPhoneAliasDoc(phoneDigits);
      if (!loginEmail) {
        const err = new Error('Phone not registered. Sign up first or sign in with your email.');
        (err as { code?: string }).code = 'auth/phone-not-registered';
        throw err;
      }
      await signInWithEmailAndPassword(this.fb.auth, loginEmail, password);
    }
    await this.fb.auth.authStateReady();
  }

  private isAuthRetryableForAlias(e: unknown): boolean {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    return (
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-email'
    );
  }

  /** Optional legacy: ownerLoginAliases/{lowercaseEmail} → email (or authLoginEmail) = Auth login email. */
  private async getAuthEmailForContactLogin(trimmedEmail: string): Promise<string | null> {
    const key = normalizeOwnerLoginEmailKey(trimmedEmail);
    if (!key.includes('@')) return null;
    try {
      const snap = await getDoc(doc(this.fb.db, OWNER_LOGIN_ALIASES_COLLECTION, key));
      if (!snap.exists()) return null;
      return readAliasAuthEmail(snap.data() as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  /** `ownerPhoneLoginAliases/{phoneDigits}` → `email` (Firebase Auth email for password sign-in). */
  private async getLoginEmailFromPhoneAliasDoc(phoneDigits: string): Promise<string | null> {
    try {
      const snap = await getDoc(doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION, phoneDigits));
      if (!snap.exists()) return null;
      return readAliasAuthEmail(snap.data() as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async sendOwnerPasswordReset(identifier: string): Promise<void> {
    const id = identifier.trim();
    let email: string;
    if (id.includes('@')) {
      // Use the exact email entered for reset; avoids stale alias mapping issues.
      email = normalizeOwnerLoginEmailKey(id);
    } else {
      const n = normalizeOwnerPhone(id);
      if (!n) {
        const err = new Error('Invalid mobile number');
        (err as { code?: string }).code = 'auth/invalid-phone-number';
        throw err;
      }
      const resolved = await this.getLoginEmailFromPhoneAliasDoc(digitsOnly(n));
      if (!resolved) {
        const err = new Error('Phone not registered.');
        (err as { code?: string }).code = 'auth/phone-not-registered';
        throw err;
      }
      email = resolved;
    }
    await sendPasswordResetEmail(this.fb.auth, email);
  }

  /** Legacy no-op (older UI called this around phone OTP). */
  disposeOwnerSignUpPhone(): void {}

  /**
   * Sign-up: createUserWithEmailAndPassword, then owners + ownerPhoneLoginAliases in one batch.
   * Phone alias doc uses field `email` to match your security rules.
   */
  async completeOwnerSignUpWithEmailPassword(args: {
    contactEmail: string;
    password: string;
    name: string;
    businessName: string;
    businessType: 'gym' | 'pg';
    phoneE164: string;
  }): Promise<void> {
    const emailNorm = args.contactEmail.trim().toLowerCase();
    const phoneDigits = digitsOnly(args.phoneE164);
    if (phoneDigits.length < 10) {
      const err = new Error('Invalid mobile number');
      (err as { code?: string }).code = 'auth/invalid-phone-number';
      throw err;
    }

    const phoneAliasSnap = await getDoc(doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION, phoneDigits));
    if (phoneAliasSnap.exists()) {
      const err = new Error('Phone already registered');
      (err as { code?: string }).code = 'auth/credential-already-in-use';
      throw err;
    }

    const cred = await createUserWithEmailAndPassword(this.fb.auth, emailNorm, args.password);
    const uid = cred.user.uid;
    try {
      const batch = writeBatch(this.fb.db);
      const ownerRef = doc(this.fb.db, 'owners', uid);
      // Core fields + app routing (role/status/business*) — phone stored digits-only per product spec.
      batch.set(ownerRef, {
        ownerId: uid,
        name: args.name.trim(),
        email: emailNorm,
        phone: phoneDigits,
        businessName: args.businessName.trim(),
        businessType: args.businessType,
        role: 'owner',
        status: 'pending',
        complaintEnabled: false,
        phoneVerified: false,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION, phoneDigits), {
        email: emailNorm,
      });
      await batch.commit();
    } catch (e) {
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

  async refreshProfile(): Promise<Owner | null> {
    const r = await this.loadProfileOnce();
    return r.owner;
  }

  async loadProfileOnce(): Promise<ProfileLoadResult> {
    await this.fb.auth.authStateReady();
    const u = this.fb.auth.currentUser;
    if (!u) {
      this.profile.set(null);
      return { owner: null, uid: null, problem: 'no-signed-in-user' };
    }

    const uid = u.uid;

    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', uid));
      if (!snap.exists()) {
        this.profile.set(null);
        return { owner: null, uid, problem: 'no-firestore-document' };
      }

      const o = ownerFromSnapshot(snap);
      if (o) {
        this.profile.set(o);
      }
      return { owner: o, uid };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      this.profile.set(null);
      const problem = code === 'permission-denied' ? 'permission-denied' : 'fetch-failed';
      return { owner: null, uid, problem };
    }
  }
}
