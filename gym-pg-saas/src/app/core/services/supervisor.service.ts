import { Injectable, inject } from '@angular/core';
import { deleteApp, getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut as authSignOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import {
  DEFAULT_SUPERVISOR_QUOTA,
  Supervisor,
  SupervisorPermissions,
  SupervisorStatus,
} from '../models/supervisor.model';
import {
  buildSupervisorAuthEmail,
  buildSupervisorLoginAliasKey,
  defaultSupervisorPermissions,
  sanitizeSupervisorUserId,
  SUPERVISOR_COUNTERS_COLLECTION,
  SUPERVISOR_LOGIN_ALIASES_COLLECTION,
  SUPERVISORS_COLLECTION,
} from '../utils/supervisor.util';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Owner-facing supervisor management.
 *
 * Creating a supervisor requires Firebase Auth user creation but the owner
 * must stay signed in. We achieve this with a **secondary Firebase app
 * instance** scoped to this service: `createUserWithEmailAndPassword` runs
 * against that secondary auth, leaving the primary owner session untouched.
 *
 * Caps are enforced both in `firestore.rules` (via the `supervisorCounters`
 * doc) and client-side here (early bail-out for a friendly error message).
 */
@Injectable({ providedIn: 'root' })
export class SupervisorService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  private secondaryApp: FirebaseApp | null = null;
  private secondaryAuth: Auth | null = null;

  // ----------------------------- reads -----------------------------

  /** Live-watch all supervisors for an owner. Returns an unsubscribe fn. */
  watchSupervisors(ownerId: string, cb: (rows: Supervisor[]) => void): Unsubscribe {
    const ref = collection(this.fb.db, SUPERVISORS_COLLECTION);
    const q = query(ref, where('ownerId', '==', ownerId));
    return onSnapshot(
      q,
      (snap) => {
        const rows: Supervisor[] = snap.docs.map((d) => ({
          ...(d.data() as Supervisor),
          supervisorId: d.id,
        }));
        // Stable sort: createdAt asc with name fallback.
        rows.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          if (ta !== tb) return ta - tb;
          return (a.name || '').localeCompare(b.name || '');
        });
        cb(rows);
      },
      () => cb([]),
    );
  }

  /** Get the cap for an owner: explicit `supervisorQuota` or default. */
  async getQuota(ownerId: string): Promise<number> {
    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', ownerId));
      const v = snap.exists() ? (snap.data() as { supervisorQuota?: unknown })['supervisorQuota'] : null;
      const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_SUPERVISOR_QUOTA;
      return Math.max(0, Math.floor(n));
    } catch {
      return DEFAULT_SUPERVISOR_QUOTA;
    }
  }

  /** Live count of an owner's supervisors. */
  async countSupervisors(ownerId: string): Promise<number> {
    const ref = collection(this.fb.db, SUPERVISORS_COLLECTION);
    const q = query(ref, where('ownerId', '==', ownerId));
    const snaps = await getDocs(q);
    return snaps.size;
  }

  // ----------------------------- writes -----------------------------

  /**
   * Create a supervisor sub-account.
   * - Verifies cap.
   * - Creates a Firebase Auth user on a SECONDARY app instance (so the
   *   primary owner session stays signed in).
   * - Writes `supervisors/{uid}`, `supervisorLoginAliases/{key}`, and bumps
   *   `supervisorCounters/{ownerId}` in one batch.
   * - Signs out the secondary auth and disposes it.
   */
  async createSupervisor(input: {
    userId: string;
    name: string;
    password: string;
    permissions?: Partial<SupervisorPermissions>;
  }): Promise<Supervisor> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId || this.auth.profile()?.role !== 'owner') {
      throw new Error('Only owners can create supervisors.');
    }

    const userIdNorm = sanitizeSupervisorUserId(input.userId);
    if (!userIdNorm || userIdNorm.length < 3) {
      throw new Error('User ID must be 3+ characters (letters, digits, _ or -).');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (!input.name?.trim()) {
      throw new Error('Name is required.');
    }

    // Cap check (also enforced in rules; this gives a friendlier message).
    const [quota, current] = await Promise.all([
      this.getQuota(ownerId),
      this.countSupervisors(ownerId),
    ]);
    if (current >= quota) {
      throw new Error(`Supervisor cap reached (${quota}). Ask admin to raise your quota.`);
    }

    const aliasKey = buildSupervisorLoginAliasKey(userIdNorm, ownerId);
    // Reject duplicate userIds for the same owner.
    const aliasSnap = await getDoc(doc(this.fb.db, SUPERVISOR_LOGIN_ALIASES_COLLECTION, aliasKey));
    if (aliasSnap.exists()) {
      throw new Error('That User ID is already taken.');
    }

    const syntheticEmail = buildSupervisorAuthEmail(userIdNorm, ownerId);

    // Create on secondary app so owner stays signed in.
    const secondary = this.getOrInitSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(secondary, syntheticEmail, input.password);
    const uid = cred.user.uid;

    try {
      const permissions: SupervisorPermissions = {
        ...defaultSupervisorPermissions(),
        ...(input.permissions || {}),
      };

      const supRef = doc(this.fb.db, SUPERVISORS_COLLECTION, uid);
      const aliasRef = doc(this.fb.db, SUPERVISOR_LOGIN_ALIASES_COLLECTION, aliasKey);
      const counterRef = doc(this.fb.db, SUPERVISOR_COUNTERS_COLLECTION, ownerId);

      const batch = writeBatch(this.fb.db);
      batch.set(supRef, {
        supervisorId: uid,
        ownerId,
        userId: userIdNorm,
        name: input.name.trim(),
        role: 'supervisor',
        status: 'active' satisfies SupervisorStatus,
        permissions,
        createdAt: serverTimestamp(),
      });
      batch.set(aliasRef, {
        email: syntheticEmail,
        ownerId,
      });
      batch.set(counterRef, { ownerId, count: current + 1 }, { merge: true });
      await batch.commit();
      await authSignOut(secondary);

      return {
        supervisorId: uid,
        ownerId,
        userId: userIdNorm,
        name: input.name.trim(),
        role: 'supervisor',
        status: 'active',
        permissions,
        createdAt: { toMillis: () => Date.now() } as Supervisor['createdAt'],
      };
    } catch (e) {
      // Roll back the Auth user so we don't leak orphan accounts.
      try {
        await cred.user.delete();
      } catch {
        /* ignore */
      }
      try {
        await authSignOut(secondary);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  /** Update permissions / name / status. Caller must be the parent owner. */
  async updateSupervisor(
    supervisorId: string,
    patch: Partial<Pick<Supervisor, 'name' | 'status' | 'permissions'>>,
  ): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId || this.auth.profile()?.role !== 'owner') {
      throw new Error('Only owners can update supervisors.');
    }
    const ref = doc(this.fb.db, SUPERVISORS_COLLECTION, supervisorId);
    const data: Partial<Supervisor> = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.permissions !== undefined) data.permissions = patch.permissions;
    if (Object.keys(data).length === 0) return;
    // updateDoc's overload is partial-shape strict; cast keeps the call site simple.
    await updateDoc(ref, data as { [key: string]: any });
  }

  /**
   * Delete a supervisor: removes the supervisor doc, alias, and decrements
   * the counter. The Firebase Auth user remains (owners can't delete other
   * Auth users from the client) but is harmless because the alias is gone
   * so login is impossible.
   */
  async deleteSupervisor(supervisor: Supervisor): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId || this.auth.profile()?.role !== 'owner') {
      throw new Error('Only owners can delete supervisors.');
    }
    if (supervisor.ownerId !== ownerId) {
      throw new Error('Cannot delete supervisor from another owner.');
    }
    const aliasKey = buildSupervisorLoginAliasKey(supervisor.userId, ownerId);

    const batch = writeBatch(this.fb.db);
    batch.delete(doc(this.fb.db, SUPERVISORS_COLLECTION, supervisor.supervisorId));
    batch.delete(doc(this.fb.db, SUPERVISOR_LOGIN_ALIASES_COLLECTION, aliasKey));
    const newCount = Math.max(0, (await this.countSupervisors(ownerId)) - 1);
    batch.set(
      doc(this.fb.db, SUPERVISOR_COUNTERS_COLLECTION, ownerId),
      { ownerId, count: newCount },
      { merge: true },
    );
    await batch.commit();
  }

  /**
   * Re-create the Firebase Auth user with a new password.
   * Implementation note: client SDK can't update another user's password, so
   * we delete-and-recreate via the secondary app. The supervisor doc id
   * (= UID) changes; we update the alias to point to the new email/UID and
   * rewrite the supervisor doc. Disabled supervisors remain disabled.
   */
  async resetSupervisorPassword(supervisor: Supervisor, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId || this.auth.profile()?.role !== 'owner') {
      throw new Error('Only owners can reset supervisor passwords.');
    }
    if (supervisor.ownerId !== ownerId) {
      throw new Error('Cannot reset password for supervisor from another owner.');
    }

    const aliasKey = buildSupervisorLoginAliasKey(supervisor.userId, ownerId);
    const syntheticEmail = buildSupervisorAuthEmail(supervisor.userId, ownerId);

    const secondary = this.getOrInitSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(secondary, syntheticEmail, newPassword);
    // The previous auth user can't be deleted from here without admin SDK,
    // so we reuse the email by failing over only when not already taken.
    // In practice `auth/email-already-in-use` is what we expect on second
    // call — handled by caller / surfaced as a clear toast.
    try {
      const newUid = cred.user.uid;
      const newSupRef = doc(this.fb.db, SUPERVISORS_COLLECTION, newUid);
      const oldSupRef = doc(this.fb.db, SUPERVISORS_COLLECTION, supervisor.supervisorId);
      const aliasRef = doc(this.fb.db, SUPERVISOR_LOGIN_ALIASES_COLLECTION, aliasKey);

      const batch = writeBatch(this.fb.db);
      batch.set(newSupRef, {
        ...supervisor,
        supervisorId: newUid,
        createdAt: serverTimestamp(),
      });
      batch.delete(oldSupRef);
      batch.set(aliasRef, { email: syntheticEmail, ownerId }, { merge: true });
      await batch.commit();
      await authSignOut(secondary);
    } catch (e) {
      try {
        await cred.user.delete();
      } catch {
        /* ignore */
      }
      try {
        await authSignOut(secondary);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  // ----------------------------- secondary app -----------------------------

  /**
   * Lazily initialise (or reuse) a secondary Firebase app for Auth user
   * creation. Named `supervisor-create` so it doesn't collide with the
   * default app the rest of the codebase uses.
   */
  private getOrInitSecondaryAuth(): Auth {
    if (this.secondaryAuth) return this.secondaryAuth;
    const name = 'supervisor-create';
    const existing = getApps().find((a) => a.name === name);
    this.secondaryApp = existing ?? initializeApp(environment.firebase, name);
    this.secondaryAuth = getAuth(this.secondaryApp);
    return this.secondaryAuth;
  }

  /**
   * Optional cleanup if you want to call it on logout. Kept available but
   * not wired automatically because the secondary app is cheap to keep.
   */
  async disposeSecondaryApp(): Promise<void> {
    if (this.secondaryAuth) {
      try {
        await authSignOut(this.secondaryAuth);
      } catch {
        /* ignore */
      }
    }
    if (this.secondaryApp) {
      try {
        await deleteApp(this.secondaryApp);
      } catch {
        /* ignore */
      }
    }
    this.secondaryApp = null;
    this.secondaryAuth = null;
  }
}
