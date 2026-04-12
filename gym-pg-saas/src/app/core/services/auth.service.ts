import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { ConfirmationResult } from 'firebase/auth';
import {
  User,
  EmailAuthProvider,
  RecaptchaVerifier,
  deleteUser,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
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
import { normalizeOwnerPhone, ownerAuthEmailFromPhone } from '../utils/phone-auth.util';

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
  private readonly doc = inject(DOCUMENT);
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

  /**
   * --- Owner phone OTP (reCAPTCHA) contract (modular Firebase v9+) ---
   * 1. Never `new RecaptchaVerifier` inside `sendOwnerSignUpOtp` / `sendOtp` — only in `initOwnerSignUpRecaptcha`.
   * 2. Call `ensurePhoneAuthRecaptcha` (or `initRecaptcha`) while `#recaptcha-container` exists, **before** `signInWithPhoneNumber`.
   * 3. `await render()` runs in init so the widget is mounted before SMS.
   * 4. `ensurePhoneAuthRecaptcha` no-ops if the same verifier is already active (one instance per “details” phase).
   * 5. After a successful SMS send, `releaseOwnerSignUpRecaptchaWidget` tears the widget down; the next attempt
   *    runs `dispose` + init again (new verifier) — do not reuse a cleared verifier.
   * 6. Constructor order is `new RecaptchaVerifier(auth, containerId, options)` — NOT the compat `(id, opts, auth)` order.
   * 7. Phone must be E.164 (`normalizeOwnerPhone`) before `sendOtp`; do not raw-concat `+91` in the service.
   * 8. We use **size: 'normal'** (visible v2). Invisible often triggers `invalid-app-credential` on localhost; re-test if you change it.
   */
  private ownerSignUpRecaptcha: RecaptchaVerifier | null = null;
  private ownerSignUpConfirmation: ConfirmationResult | null = null;
  private ownerSignUpPhoneE164: string | null = null;
  /** Host element id for Firebase Phone Auth + reCAPTCHA v2; must match an empty div in the sign-up template. */
  private ownerSignUpRecaptchaContainerId: string | null = null;

  /**
   * Default reCAPTCHA mount point (Firebase docs use `recaptcha-container`).
   * We use **size: 'normal'** (visible v2), not invisible: invisible/clipped hosts often cause
   * `invalid-app-credential` on localhost / Firefox; do not switch without re-testing.
   */
  readonly phoneAuthRecaptchaContainerId = 'recaptcha-container' as const;

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
            console.warn('[Auth] onSnapshot owners/' + u.uid + ' error', err);
          }
          this.profile.set(null);
          this.loading.set(false);
        },
      );
    });
  }

  /**
   * Sign in with email (legacy owners) or mobile number (phone-first owners use a deterministic Auth email).
   */
  async signIn(identifier: string, password: string): Promise<void> {
    const id = identifier.trim();
    let loginEmail: string;
    if (id.includes('@')) {
      loginEmail = id;
    } else {
      const n = normalizeOwnerPhone(id);
      if (!n) {
        const err = new Error('Invalid mobile number');
        (err as { code?: string }).code = 'auth/invalid-phone-number';
        throw err;
      }
      loginEmail = ownerAuthEmailFromPhone(n);
    }
    await signInWithEmailAndPassword(this.fb.auth, loginEmail, password);
    await this.fb.auth.authStateReady();
  }

  /**
   * Password reset: accepts account email or the same mobile number used for sign-in.
   */
  async sendOwnerPasswordReset(identifier: string): Promise<void> {
    const id = identifier.trim();
    let email: string;
    if (id.includes('@')) {
      email = id;
    } else {
      const n = normalizeOwnerPhone(id);
      if (!n) {
        const err = new Error('Invalid mobile number');
        (err as { code?: string }).code = 'auth/invalid-phone-number';
        throw err;
      }
      email = ownerAuthEmailFromPhone(n);
    }
    await sendPasswordResetEmail(this.fb.auth, email);
  }

  /** Tear down reCAPTCHA between attempts / when leaving sign-up. */
  disposeOwnerSignUpPhone(): void {
    try {
      this.ownerSignUpRecaptcha?.clear();
    } catch {
      /* ignore */
    }
    this.ownerSignUpRecaptcha = null;
    this.ownerSignUpConfirmation = null;
    this.ownerSignUpPhoneE164 = null;
    if (this.ownerSignUpRecaptchaContainerId) {
      this.clearOwnerSignUpRecaptchaDom(this.ownerSignUpRecaptchaContainerId);
      this.ownerSignUpRecaptchaContainerId = null;
    }
  }

  /** True while a RecaptchaVerifier exists (not yet cleared after a successful send). */
  hasOwnerSignUpRecaptchaVerifier(): boolean {
    return this.ownerSignUpRecaptcha !== null;
  }

  /**
   * Ensure a single `RecaptchaVerifier` for `containerId` (no-op if already active).
   * Prefer this over forcing `initOwnerSignUpRecaptcha` on every action.
   */
  async ensurePhoneAuthRecaptcha(
    containerId: string = this.phoneAuthRecaptchaContainerId,
  ): Promise<void> {
    if (this.ownerSignUpRecaptcha && this.ownerSignUpRecaptchaContainerId === containerId) {
      return;
    }
    await this.initOwnerSignUpRecaptcha(containerId);
  }

  /** @see {@link ensurePhoneAuthRecaptcha} — alias for readability (Firebase Phone OTP flow). */
  initRecaptcha(containerId: string = this.phoneAuthRecaptchaContainerId): Promise<void> {
    return this.ensurePhoneAuthRecaptcha(containerId);
  }

  /**
   * Create a visible reCAPTCHA widget and wait until it is mounted (iframe loading).
   * Call only when `#containerId` is in the DOM. A short delay after teardown avoids flaky tokens.
   */
  async initOwnerSignUpRecaptcha(containerId: string): Promise<void> {
    this.disposeOwnerSignUpPhone();
    await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 80));
    this.ownerSignUpRecaptchaContainerId = containerId;
    this.clearOwnerSignUpRecaptchaDom(containerId);
    // Visible v2: hidden hosts often yield INVALID_APP_CREDENTIAL / 400 on web (esp. Firefox).
    this.ownerSignUpRecaptcha = new RecaptchaVerifier(this.fb.auth, containerId, {
      size: 'normal',
      callback: () => {
        /* solved — signInWithPhoneNumber drives the flow */
      },
      'expired-callback': () => {
        /* user can tap Send OTP again */
      },
    });
    await this.ownerSignUpRecaptcha.render();
  }

  async sendOwnerSignUpOtp(phoneE164: string): Promise<void> {
    if (!this.ownerSignUpRecaptcha) {
      const err = new Error('reCAPTCHA not ready');
      (err as { code?: string }).code = 'auth/captcha-check-failed';
      throw err;
    }
    try {
      // Invariant: never construct RecaptchaVerifier here — only `signInWithPhoneNumber` + existing verifier.
      // verify() reuses the same render promise from init + render() above.
      this.ownerSignUpConfirmation = await signInWithPhoneNumber(
        this.fb.auth,
        phoneE164,
        this.ownerSignUpRecaptcha,
      );
      this.ownerSignUpPhoneE164 = phoneE164;
    } catch (e) {
      if (!environment.production) {
        console.error('[AuthService] sendOwnerSignUpOtp', { phoneE164, error: e });
      }
      throw e;
    }
    // Widget must be released before the OTP step (or a retry); otherwise Firebase/grecaptcha errors with
    // "reCAPTCHA has already been rendered in this element" on the next send.
    this.releaseOwnerSignUpRecaptchaWidget();
  }

  /** @see {@link sendOwnerSignUpOtp} — `phoneE164` must already be normalized (e.g. +91…). */
  sendOtp(phoneE164: string): Promise<void> {
    return this.sendOwnerSignUpOtp(phoneE164);
  }

  /** Clear verifier + container DOM; keep phone confirmation flow state. */
  private releaseOwnerSignUpRecaptchaWidget(): void {
    try {
      this.ownerSignUpRecaptcha?.clear();
    } catch {
      /* ignore */
    }
    this.ownerSignUpRecaptcha = null;
    if (this.ownerSignUpRecaptchaContainerId) {
      this.clearOwnerSignUpRecaptchaDom(this.ownerSignUpRecaptchaContainerId);
      this.ownerSignUpRecaptchaContainerId = null;
    }
  }

  private clearOwnerSignUpRecaptchaDom(containerId: string): void {
    const el = this.doc.getElementById(containerId);
    if (el) {
      el.replaceChildren();
    }
  }

  /**
   * Verify SMS OTP (`confirmationResult.confirm`), link email/password, create `owners/{uid}`.
   * This is the “Verify OTP” step for owner phone sign-up (modular Firebase Auth v9+).
   */
  async completeOwnerSignUpWithOtp(
    otp: string,
    args: {
      contactEmail: string;
      password: string;
      name: string;
      businessName: string;
      businessType: 'gym' | 'pg';
    },
  ): Promise<void> {
    if (!this.ownerSignUpConfirmation || !this.ownerSignUpPhoneE164) {
      const err = new Error('Send OTP first');
      (err as { code?: string }).code = 'auth/missing-verification';
      throw err;
    }
    const phoneE164 = this.ownerSignUpPhoneE164;
    const loginEmail = ownerAuthEmailFromPhone(phoneE164);
    const cred = await this.ownerSignUpConfirmation.confirm(otp.trim());
    this.ownerSignUpConfirmation = null;
    try {
      await linkWithCredential(cred.user, EmailAuthProvider.credential(loginEmail, args.password));
    } catch (e) {
      try {
        await deleteUser(cred.user);
      } catch {
        /* ignore */
      }
      throw e;
    }
    const uid = cred.user.uid;
    try {
      await setDoc(doc(this.fb.db, 'owners', uid), {
        ownerId: uid,
        name: args.name.trim(),
        businessName: args.businessName.trim(),
        email: args.contactEmail.trim().toLowerCase(),
        phone: phoneE164,
        phoneVerified: true,
        businessType: args.businessType,
        role: 'owner',
        status: 'pending',
        complaintEnabled: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      try {
        await deleteUser(cred.user);
      } catch {
        /* ignore */
      }
      throw e;
    }
    this.ownerSignUpPhoneE164 = null;
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
      if (!environment.production) {
        console.log(
          '%c PayBook Auth ',
          'background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
          'No Firebase user after authStateReady — cannot load owners/{uid}.',
        );
      }
      this.profile.set(null);
      return { owner: null, uid: null, problem: 'no-signed-in-user' };
    }

    const uid = u.uid;
    if (!environment.production) {
      console.log(
        '%c PayBook Auth ',
        'background:#047857;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
        'Signed-in UID (use this as Firestore document ID under collection "owners"):',
        uid,
      );
    }

    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', uid));
      if (!snap.exists()) {
        if (!environment.production) {
          console.log(
            '%c PayBook Auth ',
            'background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
            'NO profile document found.',
            '\n1. Open Firebase Console → Firestore → collection "owners"',
            '\n2. Add document → Document ID = paste exactly:',
            '\n   ' + uid,
            '\n3. Fields: role, status, name, email, businessType, ownerId, createdAt',
          );
        }
        this.profile.set(null);
        return { owner: null, uid, problem: 'no-firestore-document' };
      }

      const o = ownerFromSnapshot(snap);
      if (o) {
        this.profile.set(o);
        if (!environment.production) {
          console.log(
            '%c PayBook Auth ',
            'background:#047857;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
            'Profile loaded OK.',
            { role: o.role, status: o.status },
          );
        }
      }
      return { owner: o, uid };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (!environment.production) {
        console.warn('getDoc(owners/' + uid + ') failed:', e);
      }
      this.profile.set(null);
      const problem = code === 'permission-denied' ? 'permission-denied' : 'fetch-failed';
      return { owner: null, uid, problem };
    }
  }
}
