import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { SupervisorAllowedIp } from '../models/supervisor.model';
import { SUPERVISORS_COLLECTION } from '../utils/supervisor.util';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

/**
 * IP allowlist enforcement for supervisor sub-accounts.
 *
 * Storage layout:
 *   supervisors/{uid}                          ← `ipRestrictionEnabled: bool`
 *   supervisors/{uid}/allowedIps/{autoId}      ← `{ ip, label, addedBy, addedAt }`
 *
 * Why a sub-collection (not an array on the parent doc)?
 *   - Per-row audit (`addedBy`, `addedAt`) is cleaner.
 *   - No 1MB document size cliff if the owner adds many IPs.
 *   - We can listen to `allowedIps` separately from the parent doc, which
 *     means renaming an IP doesn't trigger a full supervisor profile reload.
 *
 * Enforcement model (current):
 *   - Pure CLIENT-SIDE check. The signed-in supervisor calls
 *     `assertCurrentIpAllowed()` after login; if their public IP isn't in
 *     the allowlist, we sign them out and surface a clear error. A
 *     determined attacker editing the JS could bypass this — that is a
 *     known limitation, called out to the owner during setup.
 *   - When we want hardened enforcement, swap `detectPublicIp()` and the
 *     enforcement entrypoint to a Cloud Function (HTTPS callable) that
 *     reads `request.rawRequest.headers['x-forwarded-for']`. That's the
 *     ONLY change required — the storage shape stays the same.
 *
 * IP detection:
 *   - We use ipify (`api64.ipify.org`) because it's free, doesn't require
 *     a key, supports both IPv4 and IPv6, and is widely allow-listed.
 *   - If the request fails (offline, ISP DNS hijack, etc.), we *fail
 *     closed* and refuse access — better to lock out a legit supervisor
 *     than silently let them through.
 */

const IP_DETECT_ENDPOINT = 'https://api64.ipify.org?format=json';
const IP_DETECT_TIMEOUT_MS = 5_000;

const ALLOWED_IPS_SUBCOLLECTION = 'allowedIps';

export interface AllowedIpEntry extends SupervisorAllowedIp {
  /** Firestore doc id; needed for delete operations. */
  id: string;
}

export interface IpAllowlistCheckResult {
  /**
   * - `allowed`     : restriction off OR current IP is in the list.
   * - `blocked`     : restriction on AND current IP is not in the list.
   * - `cant-detect` : we couldn't reach the IP detection service. Treated as
   *                   blocked when restriction is on (fail-closed).
   * - `not-supervisor` : doc isn't a supervisor — restriction doesn't apply.
   */
  status: 'allowed' | 'blocked' | 'cant-detect' | 'not-supervisor';
  detectedIp: string | null;
  matchedEntry: AllowedIpEntry | null;
}

@Injectable({ providedIn: 'root' })
export class IpRestrictionService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  /**
   * Live-watch the allowed IPs for a supervisor. Used in the owner's edit
   * modal so the list updates without a manual refresh after add/delete.
   */
  watchAllowedIps(
    supervisorId: string,
    cb: (rows: AllowedIpEntry[]) => void,
  ): Unsubscribe {
    const ref = collection(
      this.fb.db,
      SUPERVISORS_COLLECTION,
      supervisorId,
      ALLOWED_IPS_SUBCOLLECTION,
    );
    const q = query(ref, orderBy('addedAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        const rows: AllowedIpEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as SupervisorAllowedIp),
        }));
        cb(rows);
      },
      () => cb([]),
    );
  }

  /** One-shot read; preferred over `watch` from background guards. */
  async listAllowedIps(supervisorId: string): Promise<AllowedIpEntry[]> {
    try {
      const ref = collection(
        this.fb.db,
        SUPERVISORS_COLLECTION,
        supervisorId,
        ALLOWED_IPS_SUBCOLLECTION,
      );
      const snaps = await getDocs(ref);
      return snaps.docs.map((d) => ({
        id: d.id,
        ...(d.data() as SupervisorAllowedIp),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Add an IP entry. Caller must be the parent owner (rules enforce this).
   * Both label and IP are normalised before save.
   */
  async addAllowedIp(
    supervisorId: string,
    input: { ip: string; label: string },
  ): Promise<void> {
    const ownerProfile = this.auth.profile();
    if (!ownerProfile || ownerProfile.role !== 'owner') {
      throw new Error('Only the parent owner can add IPs.');
    }
    const ip = normalizeIp(input.ip);
    const label = (input.label || '').trim().slice(0, 40);
    if (!ip) throw new Error('Enter a valid IP address (IPv4 or IPv6).');
    if (!label) throw new Error('Give this IP a name (e.g. PG WiFi, Home).');

    const ref = collection(
      this.fb.db,
      SUPERVISORS_COLLECTION,
      supervisorId,
      ALLOWED_IPS_SUBCOLLECTION,
    );
    await addDoc(ref, {
      ip,
      label,
      addedBy: ownerProfile.ownerId,
      addedAt: serverTimestamp(),
    });
  }

  async deleteAllowedIp(supervisorId: string, allowedIpId: string): Promise<void> {
    const ownerProfile = this.auth.profile();
    if (!ownerProfile || ownerProfile.role !== 'owner') {
      throw new Error('Only the parent owner can remove IPs.');
    }
    await deleteDoc(
      doc(
        this.fb.db,
        SUPERVISORS_COLLECTION,
        supervisorId,
        ALLOWED_IPS_SUBCOLLECTION,
        allowedIpId,
      ),
    );
  }

  /**
   * Detect the caller's public IP via ipify. Returns `null` on any failure
   * (network error, timeout, malformed response). Callers must treat
   * `null` as a **block** when IP restriction is enabled (fail-closed).
   */
  async detectPublicIp(): Promise<string | null> {
    if (typeof fetch !== 'function') return null;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => ctrl.abort(), IP_DETECT_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch(IP_DETECT_ENDPOINT, {
        signal: ctrl?.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { ip?: unknown };
      const ip = typeof json.ip === 'string' ? json.ip : '';
      return normalizeIp(ip) || null;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Run the full allowlist check for a given supervisor: detect current IP,
   * read the allowlist, return a structured result. Used by the post-login
   * enforcement step and the supervisor shell guard.
   */
  async evaluate(supervisorId: string): Promise<IpAllowlistCheckResult> {
    const supSnap = await getDoc(
      doc(this.fb.db, SUPERVISORS_COLLECTION, supervisorId),
    );
    if (!supSnap.exists()) {
      return { status: 'not-supervisor', detectedIp: null, matchedEntry: null };
    }
    const data = supSnap.data() as { ipRestrictionEnabled?: boolean } | undefined;
    if (!data?.ipRestrictionEnabled) {
      return { status: 'allowed', detectedIp: null, matchedEntry: null };
    }
    const [detectedIp, allowed] = await Promise.all([
      this.detectPublicIp(),
      this.listAllowedIps(supervisorId),
    ]);
    if (!detectedIp) {
      return { status: 'cant-detect', detectedIp: null, matchedEntry: null };
    }
    const match = allowed.find((row) => normalizeIp(row.ip) === detectedIp) ?? null;
    return {
      status: match ? 'allowed' : 'blocked',
      detectedIp,
      matchedEntry: match,
    };
  }
}

/**
 * Light normalisation: trim + lowercase. We deliberately do NOT validate
 * with a strict regex because IPv6 has many representations; ipify and
 * Firefox/Chrome both return canonical forms, and a label/ip mismatch is
 * harmless (won't match → owner removes and re-adds).
 *
 * Returned empty string means "not a usable IP".
 */
export function normalizeIp(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  // Reject obvious junk: must contain at least one digit, no whitespace.
  if (/\s/.test(s)) return '';
  if (!/[0-9a-f]/.test(s)) return '';
  // Soft length sanity guard (IPv6 max ~ 39 chars; allow some slack for ::ffff:1.2.3.4).
  if (s.length > 64) return '';
  return s;
}
