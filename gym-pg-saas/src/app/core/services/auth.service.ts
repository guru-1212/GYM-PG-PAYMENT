import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ConfirmationResult,
  EmailAuthProvider,
  RecaptchaVerifier,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
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
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { Owner, OwnerRole, OwnerStatus } from '../models/owner.model';
import {
  Supervisor,
  SupervisorPermissions,
  SUPERVISOR_LOGIN_ALIASES_COLLECTION,
  SUPERVISORS_COLLECTION,
  sanitizeSupervisorUserId,
} from '../utils/supervisor.util';
import { normalizeSupervisorPermissions } from '../models/supervisor.model';
import { environment } from '../../../environments/environment';
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
  if (s === 'admin' || s === 'owner' || s === 'supervisor') return s;
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

/**
 * Project a `supervisors/{uid}` doc into the same `Owner` shape consumed by
 * the rest of the app.
 *
 * IMPORTANT: We deliberately set `ownerId` on the projected Owner to the
 * **parent owner's** id (not the supervisor's UID). All downstream services
 * use `auth.profile()?.ownerId` as a data-scope key, and supervisors must
 * see their parent owner's members / payments. The supervisor's actual
 * Firebase Auth UID remains available via `auth.user()?.uid`. We also
 * expose `parentOwnerId` for callers that want the explicit semantics.
 *
 * `businessName`, `businessType` etc. are filled in lazily later when the
 * parent owner doc snapshot arrives.
 */
function ownerFromSupervisorSnapshot(snap: DocumentSnapshot): Owner | null {
  if (!snap.exists()) return null;
  const raw = snap.data() as Partial<Supervisor> & Record<string, unknown>;
  const status = (raw['status'] === 'disabled' ? 'inactive' : 'approved') as OwnerStatus;
  const parentOwnerId =
    typeof raw['ownerId'] === 'string' && raw['ownerId'] ? (raw['ownerId'] as string) : snap.id;
  return {
    ownerId: parentOwnerId,
    name: String(raw['name'] ?? ''),
    email: '',
    role: 'supervisor',
    status,
    businessType: 'gym', // overridden when parent owner profile is merged in
    createdAt: raw['createdAt'] as never,
    parentOwnerId,
  } satisfies Owner;
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

  /** Permissions live on the supervisor doc; null for owners/admins. */
  readonly supervisorPermissions = signal<SupervisorPermissions | null>(null);

  readonly isAdmin = computed(() => this.profile()?.role === 'admin');
  readonly isApprovedOwner = computed(
    () => this.profile()?.role === 'owner' && this.profile()?.status === 'approved',
  );
  readonly isSupervisor = computed(() => this.profile()?.role === 'supervisor');
  /**
   * For owners/admins this returns their own ownerId (so scoped reads "just work"
   * for the existing call-sites). For supervisors this returns their parent owner.
   */
  readonly effectiveOwnerId = computed(() => {
    const p = this.profile();
    if (!p) return null;
    return p.role === 'supervisor' ? p.parentOwnerId ?? null : p.ownerId;
  });
  readonly isSubscriptionValid = computed(() => {
    const profile = this.profile();
    if (!profile || !profile.planEndDate) return false;
    const planEndDate = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    return new Date() <= planEndDate;
  });

  /**
   * Helper used by the permission guard / templates: returns true if the
   * current user is allowed to perform the named supervisor action.
   * Owners/admins always pass; for supervisors we read the per-account flag.
   */
  hasPermission(key: keyof SupervisorPermissions): boolean {
    const role = this.profile()?.role;
    if (role !== 'supervisor') return true;
    const perms = this.supervisorPermissions();
    return perms ? perms[key] === true : false;
  }

  private profileUnsub: Unsubscribe | null = null;
  private profileListenerUid: string | null = null;
  private supervisorParentUnsub: Unsubscribe | null = null;

  constructor() {
    onAuthStateChanged(this.fb.auth, (u) => {
      this.user.set(u);

      if (!u) {
        this.tearDownProfileListeners();
        this.profile.set(null);
        this.supervisorPermissions.set(null);
        this.loading.set(false);
        return;
      }

      // Same user reattach (e.g. tab focus). Listener is still alive.
      if (this.profileListenerUid === u.uid && this.profileUnsub) {
        this.loading.set(false);
        return;
      }

      // ---- New / different signed-in user ----
      // CRITICAL: flip loading back to true so guards waiting on `!loading()`
      // (subscriptionGuard, permissionGuard) don't race against stale profile
      // state from the previous session. Also wipe stale profile + supervisor
      // permissions so no component briefly renders with the wrong identity.
      this.tearDownProfileListeners();
      this.profile.set(null);
      this.supervisorPermissions.set(null);
      this.loading.set(true);
      this.profileListenerUid = u.uid;

      const ownerRef = doc(this.fb.db, 'owners', u.uid);
      this.profileUnsub = onSnapshot(
        ownerRef,
        (snap) => {
          if (snap.exists()) {
            // Standard owner / admin path — unchanged behaviour.
            const o = ownerFromSnapshot(snap);
            this.profile.set(o);
            this.supervisorPermissions.set(null);
            this.tearDownSupervisorParentListener();
            this.loading.set(false);
            return;
          }
          // Fallback: this UID might belong to a supervisor sub-account.
          this.subscribeAsSupervisor(u.uid);
        },
        () => {
          this.profile.set(null);
          this.supervisorPermissions.set(null);
          this.loading.set(false);
        },
      );
    });
  }

  private tearDownProfileListeners(): void {
    this.profileUnsub?.();
    this.profileUnsub = null;
    this.profileListenerUid = null;
    this.tearDownSupervisorParentListener();
  }

  private tearDownSupervisorParentListener(): void {
    this.supervisorParentUnsub?.();
    this.supervisorParentUnsub = null;
  }

  /**
   * Subscribe to `supervisors/{uid}`; when found, project to Owner shape and
   * additionally subscribe to the parent owner doc so we inherit subscription
   * status, businessType, businessName, featureFlags etc. without the
   * supervisor needing direct read access (rules grant read on parent for
   * supervisors via `isActiveSupervisorOf`).
   *
   * IMPORTANT: We do NOT flip `loading()` to false until the parent owner doc
   * has been fetched at least once. Otherwise the subscription guard runs
   * against a half-hydrated profile (no `planEndDate`) and bounces the
   * supervisor to `/subscription-expired`.
   */
  private subscribeAsSupervisor(uid: string): void {
    const supRef = doc(this.fb.db, SUPERVISORS_COLLECTION, uid);
    let parentBootstrapped = false;
    // Tear down the previous owner-doc listener (still alive after the
    // owners/{supervisorUid} miss callback) to avoid a phantom listener
    // overwriting the supervisor profile with `null` if the doc later
    // appears (e.g. admin promotes the user to a real owner).
    this.profileUnsub?.();
    this.profileUnsub = onSnapshot(
      supRef,
      async (snap) => {
        if (!snap.exists()) {
          this.profile.set(null);
          this.supervisorPermissions.set(null);
          this.loading.set(false);
          return;
        }
        const projected = ownerFromSupervisorSnapshot(snap);
        this.profile.set(projected);
        const raw = snap.data() as Partial<Supervisor> | undefined;
        this.supervisorPermissions.set(
          normalizeSupervisorPermissions(raw?.permissions),
        );

        const parentId = projected?.parentOwnerId;
        if (!parentId) {
          this.tearDownSupervisorParentListener();
          this.loading.set(false);
          return;
        }

        // Bootstrap once with a synchronous getDoc so the rest of the app
        // (route guards, dashboard) sees a fully-hydrated profile by the time
        // `loading()` flips to false. Re-runs of this snapshot handler don't
        // need to bootstrap again.
        if (!parentBootstrapped) {
          parentBootstrapped = true;
          try {
            const parentSnap = await getDoc(doc(this.fb.db, 'owners', parentId));
            if (parentSnap.exists()) {
              this.mergeParentOwnerIntoSupervisorProfile(parentSnap.data() as Partial<Owner>);
            }
          } catch {
            /* ignore — listener below will retry */
          }
          this.loading.set(false);
        }

        // Live updates for plan changes / feature flag toggles by admin.
        this.tearDownSupervisorParentListener();
        this.supervisorParentUnsub = onSnapshot(
          doc(this.fb.db, 'owners', parentId),
          (parentSnap) => {
            if (!parentSnap.exists()) return;
            this.mergeParentOwnerIntoSupervisorProfile(parentSnap.data() as Partial<Owner>);
          },
          () => {
            /* ignore — supervisor still has its own profile */
          },
        );
      },
      () => {
        this.profile.set(null);
        this.supervisorPermissions.set(null);
        this.loading.set(false);
      },
    );
  }

  private mergeParentOwnerIntoSupervisorProfile(parent: Partial<Owner>): void {
    const current = this.profile();
    if (!current || current.role !== 'supervisor') return;
    this.profile.set({
      ...current,
      businessType: (parent.businessType as Owner['businessType']) ?? current.businessType,
      businessName: parent.businessName ?? current.businessName,
      planStartDate: parent.planStartDate ?? current.planStartDate,
      planEndDate: parent.planEndDate ?? current.planEndDate,
      featureFlags: parent.featureFlags ?? current.featureFlags,
    });
  }

  /**
   * Email: Firebase email/password, with optional `ownerLoginAliases` retry for legacy mapped emails.
   * Mobile: digits-only key → `ownerPhoneLoginAliases/{digits}` → `email` field → signInWithEmailAndPassword.
   * Supervisor: non-email, non-phone identifier → `supervisorLoginAliases/{userId}*` → email → password sign-in.
   * No Firebase Phone Auth / OTP.
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
      const phoneNorm = normalizeOwnerPhone(id);
      const phoneDigits = phoneNorm ? digitsOnly(phoneNorm) : '';
      const looksLikePhone = phoneDigits.length >= 10;
      if (looksLikePhone) {
        const loginEmail = await this.getLoginEmailFromPhoneAliasDoc(phoneDigits);
        if (loginEmail) {
          await signInWithEmailAndPassword(this.fb.auth, loginEmail, password);
        } else {
          const err = new Error('Phone not registered. Sign up first or sign in with your email.');
          (err as { code?: string }).code = 'auth/phone-not-registered';
          throw err;
        }
      } else {
        // Treat as a supervisor userId. We don't know the parent ownerId yet,
        // so the alias collection is queried by userId-prefixed doc id; the
        // most reliable resolution is via getDoc on candidate keys. Owners
        // create supervisors with `<userId>__<ownerId>` so we list a tiny
        // query prefix using getDocs ordered/range query.
        const loginEmail = await this.getLoginEmailFromSupervisorUserId(id);
        if (!loginEmail) {
          const err = new Error('User not found.');
          (err as { code?: string }).code = 'auth/user-not-found';
          throw err;
        }
        await signInWithEmailAndPassword(this.fb.auth, loginEmail, password);
      }
    }
    await this.fb.auth.authStateReady();
  }

  /**
   * Supervisor login: doc id is `<userId>__<ownerId>`. Since we don't know
   * ownerId, we look up via a Firestore range query on the doc id prefix.
   * This stays inside Firestore rules (collection allows public read).
   */
  private async getLoginEmailFromSupervisorUserId(rawUserId: string): Promise<string | null> {
    const u = sanitizeSupervisorUserId(rawUserId);
    if (!u) return null;
    try {
      // Lazy-load query helpers to keep tree-shake-friendly.
      const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
      const ref = collection(this.fb.db, SUPERVISOR_LOGIN_ALIASES_COLLECTION);
      // Doc ids look like `<userId>__<ownerId>`. We range-scan that prefix.
      const start = `${u}__`;
      const end = `${u}__\uf8ff`;
      const q = query(
        ref,
        where('__name__', '>=', start),
        where('__name__', '<', end),
        orderBy('__name__'),
        limit(2),
      );
      const snaps = await getDocs(q);
      if (snaps.empty) return null;
      // Prefer an exact match if multiple owners ever picked the same userId.
      const data = snaps.docs[0].data() as Record<string, unknown> | undefined;
      const email = data?.['email'];
      return typeof email === 'string' && email.includes('@') ? email : null;
    } catch {
      return null;
    }
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
    // Temporary debug: compare these values with the reset-link URL query (`apiKey`) and host.
    // Remove after diagnosing "expired / already used" behavior.
    const opts = this.fb.app.options;
    console.info('[AuthDebug][PasswordReset][send]', {
      identifier: id,
      resolvedEmail: email,
      firebaseProjectId: opts.projectId,
      firebaseAuthDomain: opts.authDomain,
      firebaseApiKeyTail: typeof opts.apiKey === 'string' ? opts.apiKey.slice(-6) : '',
      sentAtIso: new Date().toISOString(),
    });
    await sendPasswordResetEmail(this.fb.auth, email);
  }

  /** Legacy no-op (older UI called this around phone OTP). */
  disposeOwnerSignUpPhone(): void {}

  // ------------------- Mobile OTP password reset -------------------

  /** Holds the active reCAPTCHA so we can clean it up between retries. */
  private phoneResetRecaptcha: RecaptchaVerifier | null = null;

  /**
   * Step 1 of mobile-OTP password reset.
   *
   * - Validates and normalises the phone to E.164.
   * - Confirms the phone is registered (lookup in `ownerPhoneLoginAliases`).
   * - Builds an *invisible* reCAPTCHA bound to `recaptchaContainerId`.
   * - Calls Firebase Phone Auth to send the SMS OTP.
   *
   * Returns the `ConfirmationResult` the caller must pass to `confirmPhoneResetOtp`.
   */
  async startPhonePasswordReset(
    rawPhone: string,
    recaptchaContainerId: string,
  ): Promise<ConfirmationResult> {
    const phoneE164 = normalizeOwnerPhone(rawPhone);
    if (!phoneE164) {
      const err = new Error('Invalid mobile number');
      (err as { code?: string }).code = 'auth/invalid-phone-number';
      throw err;
    }
    const aliasEmail = await this.getLoginEmailFromPhoneAliasDoc(digitsOnly(phoneE164));
    if (!aliasEmail) {
      const err = new Error('Phone not registered.');
      (err as { code?: string }).code = 'auth/phone-not-registered';
      throw err;
    }

    // Phone Auth requires a fresh, signed-out state. If a previous user is
    // still around (e.g. supervisor logged in), bail out cleanly.
    if (this.fb.auth.currentUser) {
      try {
        await signOut(this.fb.auth);
      } catch {
        /* ignore */
      }
    }

    this.disposePhoneResetRecaptcha();
    const verifier = new RecaptchaVerifier(this.fb.auth, recaptchaContainerId, {
      size: 'invisible',
    });
    this.phoneResetRecaptcha = verifier;
    // Diagnostic: helps debug "OTP not received" issues. Look for these logs in
    // the browser console (filter: "[PhoneReset]"). The promise below resolves
    // as soon as Firebase queues the SMS — it does NOT confirm carrier delivery.
    const opts = this.fb.app.options;
    console.info('[PhoneReset][send]', {
      phoneE164,
      firebaseProjectId: opts.projectId,
      firebaseAuthDomain: opts.authDomain,
      attemptedAt: new Date().toISOString(),
      origin: typeof window !== 'undefined' ? window.location.origin : '(no-window)',
    });
    try {
      const confirmation = await signInWithPhoneNumber(this.fb.auth, phoneE164, verifier);
      console.info('[PhoneReset][queued]', {
        phoneE164,
        verificationIdTail: String(confirmation.verificationId || '').slice(-6),
        note: 'SMS was accepted by Firebase. If it never arrives: check Firebase Console → Authentication → Users (was a phone user created?), Authentication → Settings → SMS region policy, and add a Test phone number to confirm wiring.',
      });
      return confirmation;
    } catch (e) {
      console.error('[PhoneReset][failed]', {
        phoneE164,
        code: e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '',
        message:
          e && typeof e === 'object' && 'message' in e
            ? (e as { message: string }).message
            : String(e),
      });
      this.disposePhoneResetRecaptcha();
      throw e;
    }
  }

  /**
   * Step 2: confirm the 6-digit OTP. On success the user is signed in as a
   * temporary phone-auth identity (UID is *not* the owner's UID).
   */
  async confirmPhoneResetOtp(
    confirmation: ConfirmationResult,
    code: string,
  ): Promise<void> {
    await confirmation.confirm(String(code || '').trim());
    await this.fb.auth.authStateReady();
  }

  /**
   * Step 3: ask the Cloud Function to update the owner's email/password
   * account using the verified phone identity, then sign out.
   *
   * Server enforces the security checks (verified phone match, strong password).
   */
  async finishPhonePasswordReset(newPassword: string): Promise<void> {
    await this.fb.auth.authStateReady();
    if (!this.fb.auth.currentUser) {
      const err = new Error('OTP session expired. Please request a new code.');
      (err as { code?: string }).code = 'auth/unauthenticated';
      throw err;
    }
    try {
      const { getFunctions, httpsCallable, httpsCallableFromURL } = await import('firebase/functions');
      const fns = getFunctions(this.fb.app, 'us-central1');
      const callTimeout = 110_000;
      /**
       * Only call through an explicit URL (e.g. Firebase Hosting `/api-fn/...` rewrite if you need same-origin).
       * Auto same-origin was removed: on some hosts (notably Vercel external rewrites) the `Authorization`
       * header may not reach Cloud Functions, which surfaces as HTTP 401 and our "OTP session expired" copy.
       * Default: SDK → `*.cloudfunctions.net` (works from the browser when callable CORS/invoker are normal).
       */
      const configured = environment.resetOwnerPasswordCallableUrl?.trim() || null;
      const callableUrl = configured || null;
      const call = callableUrl
        ? httpsCallableFromURL<{ newPassword: string }, { ok: true }>(fns, callableUrl, {
            timeout: callTimeout,
          })
        : httpsCallable<{ newPassword: string }, { ok: true }>(fns, 'resetOwnerPasswordWithPhoneOtp', {
            timeout: callTimeout,
          });
      await call({ newPassword });
    } finally {
      this.disposePhoneResetRecaptcha();
      try {
        await signOut(this.fb.auth);
      } catch {
        /* ignore */
      }
    }
  }

  /** Tear-down hook called by the forgot-password page on cancel/destroy. */
  disposePhoneResetRecaptcha(): void {
    if (this.phoneResetRecaptcha) {
      try {
        this.phoneResetRecaptcha.clear();
      } catch {
        /* ignore */
      }
      this.phoneResetRecaptcha = null;
    }
  }

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

  /**
   * Re-authenticate the signed-in user with email + password (sensitive admin actions).
   * Requires the account to have an email link (email/password sign-in).
   */
  async reauthenticateWithPassword(password: string): Promise<void> {
    await this.fb.auth.authStateReady();
    const user = this.fb.auth.currentUser;
    if (!user?.email) {
      const e = new Error('no-email-for-reauth');
      e.name = 'NoEmailForReauth';
      throw e;
    }
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  }

  async signOut(): Promise<void> {
    // Eagerly clear local listeners + state so the very next render after
    // `signOut()` returns does not flash the previous user's profile while
    // Firebase's onAuthStateChanged callback is still in flight.
    this.tearDownProfileListeners();
    this.profile.set(null);
    this.supervisorPermissions.set(null);
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
      if (snap.exists()) {
        const o = ownerFromSnapshot(snap);
        if (o) this.profile.set(o);
        return { owner: o, uid };
      }
      // Fallback: this UID could be a supervisor sub-account.
      const supSnap = await getDoc(doc(this.fb.db, SUPERVISORS_COLLECTION, uid));
      if (supSnap.exists()) {
        const projected = ownerFromSupervisorSnapshot(supSnap);
        if (projected) this.profile.set(projected);
        const raw = supSnap.data() as Partial<Supervisor> | undefined;
        this.supervisorPermissions.set(
          normalizeSupervisorPermissions(raw?.permissions),
        );
        // Eagerly merge the parent owner's plan / business fields so the
        // caller (login redirect, subscription guard) sees a fully-hydrated
        // profile. Without this the supervisor lands on /subscription-expired
        // because planEndDate is undefined.
        const parentId = projected?.parentOwnerId;
        if (parentId) {
          try {
            const parentSnap = await getDoc(doc(this.fb.db, 'owners', parentId));
            if (parentSnap.exists()) {
              this.mergeParentOwnerIntoSupervisorProfile(parentSnap.data() as Partial<Owner>);
            }
          } catch {
            /* ignore — live listener will pick this up later */
          }
        }
        return { owner: this.profile(), uid };
      }
      this.profile.set(null);
      return { owner: null, uid, problem: 'no-firestore-document' };
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      this.profile.set(null);
      const problem = code === 'permission-denied' ? 'permission-denied' : 'fetch-failed';
      return { owner: null, uid, problem };
    }
  }
}
