import { Injectable, inject } from '@angular/core';
import {
  doc,
  FieldValue,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { SUPERVISORS_COLLECTION } from '../utils/supervisor.util';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Single-device login enforcement for supervisors.
 *
 * The model is "newest login wins" (Netflix / WhatsApp Web semantics):
 *   - On successful login the client generates a fresh `sessionId` (UUID),
 *     writes it to `supervisors/{uid}` (rules permit only the supervisor
 *     themselves to mutate `activeSession*` fields), and stores the same
 *     value in `localStorage` as the device's "claim".
 *   - The supervisor shell subscribes to its own doc. Whenever a snapshot
 *     arrives where `activeSessionId !== localSessionId`, the device
 *     detected a newer login elsewhere and signs itself out.
 *   - The localStorage key is namespaced by UID so a different supervisor
 *     signing in on the same browser can't accidentally inherit a stale
 *     claim.
 *
 * Why not Firebase Auth's `revokeRefreshTokens()`?
 *   - That requires the Admin SDK (Cloud Functions). We're staying
 *     functions-free for now. The shell watcher is reliable enough for
 *     non-adversarial use.
 *
 * Caveats / known limits:
 *   - A user without a network connection won't observe the kick-out
 *     until they re-connect. They CAN still read cached data offline,
 *     but any write will fail — Firestore rules still hold.
 *   - Determined attackers who edit the JS could ignore the watcher.
 *     For tamper-proof enforcement, a Cloud Function should validate
 *     `activeSessionId` on every sensitive write — out of scope for v1.
 */

const STORAGE_KEY_PREFIX = 'gympg_supervisor_session_';
const DEVICE_LABEL_MAX = 64;

@Injectable({ providedIn: 'root' })
export class SupervisorSessionService {
  private readonly fb = inject(FirebaseAppService);

  /**
   * Generate a fresh session id, write it to the supervisor doc, and persist
   * it locally so the shell watcher knows whether a future snapshot is
   * "ours" or "someone else's". Returns the new id (mostly for logging /
   * tests; production callers can ignore it).
   */
  async claimSession(supervisorId: string, detectedIp: string | null = null): Promise<string> {
    const sessionId = generateSessionId();
    const deviceLabel = detectDeviceLabel();

    const ref = doc(this.fb.db, SUPERVISORS_COLLECTION, supervisorId);
    const payload: { [k: string]: string | FieldValue } = {
      activeSessionId: sessionId,
      activeSessionDevice: deviceLabel,
      activeSessionLoginAt: serverTimestamp(),
    };
    if (detectedIp) payload['activeSessionIp'] = detectedIp;
    await updateDoc(ref, payload);

    persistLocalSessionId(supervisorId, sessionId);
    return sessionId;
  }

  /**
   * Live-watch the supervisor doc. When the persisted `activeSessionId`
   * disagrees with the local copy, fire `onConflict` exactly once — the
   * caller is expected to sign the user out and route them to /login.
   *
   * `null` for the local session id means "we don't have a claim yet";
   * the watcher will simply call `onConflict` if the doc has any session
   * id at all, but that should never happen in normal flows because we
   * call `claimSession` immediately after login.
   */
  watchOwnSession(
    supervisorId: string,
    onConflict: (reason: 'kicked' | 'no-local') => void,
  ): Unsubscribe {
    const localId = readLocalSessionId(supervisorId);
    let fired = false;

    return onSnapshot(
      doc(this.fb.db, SUPERVISORS_COLLECTION, supervisorId),
      (snap) => {
        if (fired) return;
        const data = snap.data() as { activeSessionId?: unknown } | undefined;
        const remoteId = typeof data?.activeSessionId === 'string'
          ? (data.activeSessionId as string)
          : '';
        if (!remoteId) {
          // Doc was just created or reset — no enforcement yet.
          return;
        }
        if (!localId) {
          fired = true;
          onConflict('no-local');
          return;
        }
        if (remoteId !== localId) {
          fired = true;
          onConflict('kicked');
        }
      },
      () => {
        /* swallow read errors — supervisor doc rules deny outsiders */
      },
    );
  }

  /** Wipe the local claim. Call on explicit sign-out or after a kick-out. */
  clearLocalSession(supervisorId: string): void {
    if (!supervisorId) return;
    try {
      localStorage.removeItem(STORAGE_KEY_PREFIX + supervisorId);
    } catch {
      /* SSR / private mode safety */
    }
  }
}

// --- helpers (module-private) ---

function generateSessionId(): string {
  // crypto.randomUUID is available in evergreen browsers; fall back to a
  // sufficiently-random hex string for older / SSR contexts.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function persistLocalSessionId(supervisorId: string, sessionId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + supervisorId, sessionId);
  } catch {
    /* swallow private-mode storage errors */
  }
}

function readLocalSessionId(supervisorId: string): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY_PREFIX + supervisorId);
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort, single-line device summary for the owner's audit view.
 * Heuristic only — UA strings lie, especially on iOS, so we keep it
 * forgiving. Format: "Chrome on Windows" / "Safari on iPhone" etc.
 */
function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Browser';
  const platform =
    /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
        : /Macintosh/i.test(ua) ? 'Mac'
          : /Windows/i.test(ua) ? 'Windows'
            : /Linux/i.test(ua) ? 'Linux'
              : 'device';
  return `${browser} on ${platform}`.slice(0, DEVICE_LABEL_MAX);
}
