import { APP_VERSION } from './app-version';

/**
 * Storage key holding the app version that the *currently cached* client
 * was built against. If it differs from {@link APP_VERSION} we run a
 * one-time reset so the user picks up the freshly deployed UI.
 */
const VERSION_KEY = 'app.version';

/**
 * Per-tab guard so we never reload more than once for the same version.
 * Belt-and-suspenders against an infinite reload loop in case storage
 * writes get blocked (private mode, quota errors, etc.).
 */
const RELOAD_GUARD_KEY = 'app.version.reloaded';

/**
 * Theme preference is preserved across the reset so users don't see a
 * jarring light/dark flash after a deploy.
 */
const PRESERVED_KEYS: readonly string[] = ['paybook.theme'];

export interface CacheResetResult {
  /** True when a hard reload has been requested and Angular should NOT bootstrap. */
  reloading: boolean;
}

/**
 * Runs as the very first thing on app startup (called from `main.ts`).
 *
 * If the locally stored version differs from {@link APP_VERSION}, we:
 *   1. Unregister every service worker (so the next request hits the network).
 *   2. Drop all entries in the Cache Storage API.
 *   3. Clear localStorage / sessionStorage (preserving theme only).
 *   4. Persist the new version + a session guard, then hard-reload.
 *
 * If the versions match, this is a cheap no-op and the app boots normally.
 * Errors are swallowed — under no circumstance should this break startup.
 */
export async function runCacheResetIfNeeded(): Promise<CacheResetResult> {
  if (typeof window === 'undefined') return { reloading: false };

  try {
    const stored = safeGet(VERSION_KEY);
    if (stored === APP_VERSION) {
      return { reloading: false };
    }

    const guard = safeGet(RELOAD_GUARD_KEY, sessionStorage);
    if (guard === APP_VERSION) {
      safeSet(VERSION_KEY, APP_VERSION);
      return { reloading: false };
    }

    const preserved: Record<string, string | null> = {};
    for (const key of PRESERVED_KEYS) {
      preserved[key] = safeGet(key);
    }

    await unregisterServiceWorkers();
    await clearCacheStorage();

    safeClear(sessionStorage);
    safeClear(localStorage);

    for (const key of PRESERVED_KEYS) {
      const value = preserved[key];
      if (value != null) safeSet(key, value);
    }

    safeSet(VERSION_KEY, APP_VERSION);
    safeSet(RELOAD_GUARD_KEY, APP_VERSION, sessionStorage);

    window.location.reload();
    return { reloading: true };
  } catch {
    return { reloading: false };
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    /* no-op */
  }
}

async function clearCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
  } catch {
    /* no-op */
  }
}

function safeGet(key: string, store: Storage = localStorage): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string, store: Storage = localStorage): void {
  try {
    store.setItem(key, value);
  } catch {
    /* private mode / quota — ignore */
  }
}

function safeClear(store: Storage): void {
  try {
    store.clear();
  } catch {
    /* private mode — ignore */
  }
}
