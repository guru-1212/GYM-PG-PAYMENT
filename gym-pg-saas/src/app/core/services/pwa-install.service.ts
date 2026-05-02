import { Injectable, signal } from '@angular/core';

/**
 * Chrome / Edge / Brave fire `beforeinstallprompt` once the page meets the
 * PWA install criteria (HTTPS, valid manifest, registered service worker
 * with a fetch handler, and minimal user engagement). The event must be
 * captured *the moment it fires* and replayed later inside a user-gesture
 * handler — calling `prompt()` outside the original gesture window throws.
 *
 * That's why this service must be instantiated eagerly at app bootstrap
 * (see `AppComponent`) — by the time the user lands on the install button
 * the event has typically already fired and the deferred prompt is ready.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_FLAG_KEY = 'pgt.install.completed';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  /** True when a real `beforeinstallprompt` is queued and `promptInstall()` will work. */
  readonly canInstall = signal(false);
  /** True when the app is already running as an installed PWA (or was previously installed on this device). */
  readonly isInstalled = signal(false);
  /**
   * True for iOS / iPadOS Safari. Safari never fires `beforeinstallprompt`
   * — installation is via "Share → Add to Home Screen". We surface a
   * separate guidance flow for these users.
   */
  readonly isIosSafari = signal(false);
  /** Inline instructions popover visibility (used by iOS users). */
  readonly showIosInstructions = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    this.isInstalled.set(this.detectInstalled());
    this.isIosSafari.set(this.detectIosSafari());

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // Suppress Chrome's mini-infobar; we render our own button instead.
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isInstalled.set(true);
      try {
        localStorage.setItem(INSTALL_FLAG_KEY, '1');
      } catch {
        /* localStorage unavailable — ignore */
      }
    });

    // React to display-mode changes (some Chromium variants fire this on launch).
    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', (e) => {
      if (e.matches) this.isInstalled.set(true);
    });
  }

  /**
   * Trigger the native install dialog. Must be called from a real user
   * gesture (button click). Returns whether the user accepted.
   */
  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (this.isIosSafari() && !this.deferredPrompt) {
      this.showIosInstructions.set(true);
      return 'unavailable';
    }
    if (!this.deferredPrompt) return 'unavailable';
    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.canInstall.set(false);
      return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      return 'unavailable';
    }
  }

  closeIosInstructions(): void {
    this.showIosInstructions.set(false);
  }

  private detectInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem(INSTALL_FLAG_KEY) === '1') return true;
    } catch {
      /* ignore */
    }
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const standaloneNavigator = Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    );
    return Boolean(standaloneMedia || standaloneNavigator);
  }

  private detectIosSafari(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    if (!isIos) return false;
    // Exclude in-app browsers (Chrome, Firefox, Edge on iOS still use WebKit
    // but won't expose the share-sheet "Add to Home Screen" path the same way).
    const isUnsupportedShell = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|FBAN|FBAV|Instagram/.test(ua);
    return !isUnsupportedShell;
  }
}
