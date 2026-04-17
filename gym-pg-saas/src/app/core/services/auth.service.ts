import { Injectable, computed, inject, signal } from '@angular/core';
import { PermissionService } from './permission.service';
import { WorkerService } from './worker.service';

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  
  sendPasswordResetEmail as fbSendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  DocumentSnapshot,
  getDoc,
  onSnapshot,
  serverTimestamp,

  writeBatch,
} from 'firebase/firestore';
import { Owner, OwnerRole, OwnerStatus } from '../models/owner.model';
import { Worker } from '../models/worker.model';
import { FirebaseAppService } from './firebase-app.service';

const OWNER_LOGIN_ALIASES_COLLECTION = 'ownerLoginAliases';
const OWNER_PHONE_LOGIN_ALIASES_COLLECTION = 'ownerPhoneLoginAliases';

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
  if (!(snap as any).exists()) return null;
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
  private readonly permissionService = inject(PermissionService);
  private readonly workerService = inject(WorkerService);
  readonly user = signal<User | null>(null);
  readonly profile = signal<Owner | null>(null);
  readonly workerProfile = signal<Worker | null>(null);
  readonly loading = signal(true);

  readonly isAdmin = computed(() => this.profile()?.role === 'admin');
  readonly isApprovedOwner = computed(
    () => this.profile()?.role === 'owner' && this.profile()?.status === 'approved',
  );
  readonly isWorker = computed(() => this.workerProfile() !== null);
  readonly isSubscriptionValid = computed(() => {
    const profile = this.profile();
    if (!profile || !profile.planEndDate) return false;
    const planEndDate = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    return new Date() <= planEndDate;
  });

  private profileUnsub: (() => void) | null = null;
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
          this.profileUnsub = onSnapshot(ref, (snap: any) => {
        const o = ownerFromSnapshot(snap);
        this.profile.set(o);

        if (o) {
          this.permissionService.setRole('owner');
          this.permissionService.setOwnerFeatures(o.features);
        }
      });
    });
  }

  /**
   * Email: Firebase email/password (owner), with optional `ownerLoginAliases` retry.
   * If owner login fails, try worker login (Firestore-based).
   * Mobile: digits-only key → `ownerPhoneLoginAliases/{digits}` → `email` field → signInWithEmailAndPassword.
   * No Firebase Phone Auth / OTP / synthetic Auth emails.
   */
  async signIn(identifier: string, password: string): Promise<void> {
    const id = identifier.trim();
    if (id.includes('@')) {
      // Email login: try owner, then alias, then worker
      let lastError: any = null;

      // Try 1: Direct owner login
      try {
        console.debug('[Auth] Attempting Firebase Auth (owner) login with email:', id);
        await signInWithEmailAndPassword(this.fb.auth, id, password);
        console.debug('[Auth] Firebase Auth login successful');
        // Wait for auth state to propagate
        await new Promise<void>((resolve) => {
          const unsub = onAuthStateChanged(this.fb.auth, () => {
            unsub();
            resolve();
          });
        });
        return;
      } catch (e) {
        lastError = e;
        const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
        console.debug('[Auth] Firebase Auth login failed with code:', code);
        console.info('[Auth] This is normal if: (1) Email not in Firebase Auth, or (2) Wrong password. System will try Firestore worker login next.');
        // If not a credential error, don't retry further
        if (!['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-email'].includes(code)) {
          throw e;
        }
      }

      // Try 2: Try alias resolution for owner
      try {
        console.debug('[Auth] Attempting alias resolution for owner...');
        const resolved = await this.getAuthEmailForContactLogin(id);
        if (resolved && resolved !== normalizeOwnerLoginEmailKey(id)) {
          console.debug('[Auth] Alias resolved, attempting Firebase Auth with resolved email');
          await signInWithEmailAndPassword(this.fb.auth, resolved, password);
          // Wait for auth state to propagate
          await new Promise<void>((resolve) => {
            const unsub = onAuthStateChanged(this.fb.auth, () => {
              unsub();
              resolve();
            });
          });
          return;
        }
      } catch (e) {
        lastError = e;
        console.debug('[Auth] Alias resolution failed:', e);
      }

      // Try 3: Worker login (Firestore-based)
      try {
        console.debug('[Auth] Firebase Auth failed - Attempting Firestore worker login...');
        await this.workerSignIn(id, password);
        console.debug('[Auth] Worker login successful');
        return;
      } catch (e) {
        console.debug('[Auth] Worker login also failed:', e);
        // If worker login also fails, throw the ACTUAL worker error (not the Firebase error)
        throw e;
      }
    } else {
      // Phone-based login (owner only)
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
      // Wait for auth state to propagate
      await new Promise<void>((resolve) => {
        const unsub = onAuthStateChanged(this.fb.auth, () => {
          unsub();
          resolve();
        });
      });
    }
  }

  /** Optional legacy: ownerLoginAliases/{lowercaseEmail} → email (or authLoginEmail) = Auth login email. */
  private async getAuthEmailForContactLogin(trimmedEmail: string): Promise<string | null> {
    const key = normalizeOwnerLoginEmailKey(trimmedEmail);
    if (!key.includes('@')) return null;
    try {
      const snap = await getDoc(doc(this.fb.db, OWNER_LOGIN_ALIASES_COLLECTION, key));
      if (!(snap as any).exists()) return null;
      return readAliasAuthEmail((snap as any).data() as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  /** `ownerPhoneLoginAliases/{phoneDigits}` → `email` (Firebase Auth email for password sign-in). */
  private async getLoginEmailFromPhoneAliasDoc(phoneDigits: string): Promise<string | null> {
    try {
      const snap = await getDoc(doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION, phoneDigits));
      if (!(snap as any).exists()) return null;
      return readAliasAuthEmail((snap as any).data() as Record<string, unknown>);
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
    const opts = (this.fb.app as any).options;
    console.info('[AuthDebug][PasswordReset][send]', {
      identifier: id,
      resolvedEmail: email,
      firebaseProjectId: opts.projectId,
      firebaseAuthDomain: opts.authDomain,
      firebaseApiKeyTail: typeof opts.apiKey === 'string' ? opts.apiKey.slice(-6) : '',
      sentAtIso: new Date().toISOString(),
    });
    await fbSendPasswordResetEmail(this.fb.auth, email);
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
    // @ts-ignore
    if (phoneAliasSnap.exists()) {
      const err = new Error('Phone already registered');
      (err as { code?: string }).code = 'auth/credential-already-in-use';
      throw err;
    }

    const cred = await createUserWithEmailAndPassword(this.fb.auth, emailNorm, args.password);
    const uid = cred.user.uid;
    try {
      const batch = writeBatch(this.fb.db);

      batch.set(doc(this.fb.db, 'owners', uid), {
        ownerId: uid,
        name: args.name.trim(),
        businessName: args.businessName.trim(),
        email: emailNorm,
        businessType: args.businessType,
        role: 'owner',
        status: 'pending',
        complaintEnabled: false,
        createdAt: serverTimestamp(),
      });

      batch.set(
        doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION, phoneDigits),
        {
          ownerId: uid,
          email: emailNorm,
          authLoginEmail: emailNorm,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(
        doc(this.fb.db, OWNER_LOGIN_ALIASES_COLLECTION, emailNorm),
        {
          ownerId: uid,
          email: emailNorm,
          authLoginEmail: emailNorm,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await batch.commit();
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

  /** Legacy signup entry point used by current login page. */
  async signUp(
    email: string,
    password: string,
    name: string,
    businessName: string,
    businessType: 'gym' | 'pg',
  ): Promise<void> {
    const emailNorm = normalizeOwnerLoginEmailKey(email);
    const cred = await createUserWithEmailAndPassword(this.fb.auth, emailNorm, password);
    const uid = cred.user.uid;
    try {
      const batch = writeBatch(this.fb.db);
      const ownerRef = doc(this.fb.db, 'owners', uid);
      // Core fields + app routing (role/status/business*) — phone stored digits-only per product spec.
      batch.set(ownerRef, {
        ownerId: uid,
        name: name.trim(),
        businessName: businessName.trim(),
        email: emailNorm,
        businessType,
        role: 'owner',
        status: 'pending',
        complaintEnabled: false,
        phoneVerified: false,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(this.fb.db, OWNER_PHONE_LOGIN_ALIASES_COLLECTION), {
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
   * Worker Firestore-based login (no Firebase Auth)
   * Checks workers collection for email/password match
   * Then loads owner features for permission calculation
   */
  async workerSignIn(email: string, password: string): Promise<void> {
    try {
      console.debug('[Auth] Worker login: Querying workers collection for email:', email);
      const worker = await this.workerService.workerLogin(email, password);
      
      if (!worker) {
        console.debug('[Auth] Worker not found or password mismatch');
        const err = new Error('Invalid worker email or password');
        (err as { code?: string }).code = 'auth/invalid-credential';
        throw err;
      }

      console.debug('[Auth] Worker found, loading features from worker document...');
      // Worker found, get features from worker document (no auth needed)
      const ownerFeatures = worker.features || {};

      // Set worker profile and permissions
      this.workerProfile.set(worker);
      this.permissionService.setRole('worker');
      this.permissionService.setOwnerFeatures(ownerFeatures);
      this.permissionService.setWorkerPermissions(worker.permissions as any);
      this.loading.set(false);
      console.debug('[Auth] Worker login complete with permissions:', Object.keys(worker.permissions));
      console.debug('[Auth] Worker features:', ownerFeatures);

    } catch (error: any) {
      this.workerProfile.set(null);
      this.loading.set(false);
      
      const code = error?.code;
      const message = error?.message || String(error);
      
      console.error('[Auth] Worker login error - Code:', code, 'Message:', message);
      
      if (message?.includes('Missing or insufficient permissions') || message?.includes('permission-denied')) {
        console.error('[Auth] FIRESTORE RULES ERROR: Workers collection read denied. Make sure firestore.rules allows worker queries.');
        const permError = new Error('Firestore permissions error. Admin needs to deploy latest firestore.rules.');
        (permError as { code?: string }).code = 'firestore/permission-denied';
        throw permError;
      }
      
      throw error;
    }
  }

  async signOut(): Promise<void> {
    // Clear worker profile if logged in as worker
    if (this.workerProfile()) {
      this.workerProfile.set(null);
      this.permissionService.setRole('owner');
      this.permissionService.setWorkerPermissions(undefined);
      this.loading.set(false);
      return;
    }

    // Clear Firebase auth for owner login
    await signOut(this.fb.auth);
  }

  async refreshProfile(): Promise<Owner | null> {
    const r = await this.loadProfileOnce();
    return r.owner;
  }

  async loadProfileOnce(): Promise<ProfileLoadResult> {
    // Wait for auth state to be initialized
    await new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(this.fb.auth, () => {
        unsub();
        resolve();
      });
    });
    
    const u = this.fb.auth.currentUser;
    if (!u) {
      this.profile.set(null);
      return { owner: null, uid: null, problem: 'no-signed-in-user' };
    }

    const uid = u.uid;

    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', uid));
      // @ts-ignore
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

function normalizeOwnerLoginEmailKey(id: string): string {
  return String(id ?? '')
    .trim()
    .toLowerCase();
}

function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function normalizeOwnerPhone(id: string): string | null {
  let d = digitsOnly(id);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : null;
}
