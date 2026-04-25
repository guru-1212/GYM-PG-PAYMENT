import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

const DARK_KEY = 'paybook.theme';
const BRAND_KEY_GLOBAL = 'paybook.brand-theme';
const BRAND_KEY_PREFIX = 'paybook.brand-theme.';
const SIDEBAR_KEY_GLOBAL = 'paybook.sidebar-style';
const SIDEBAR_KEY_PREFIX = 'paybook.sidebar-style.';

/**
 * Brand color palettes for the SaaS UI.
 * - `indigo` is the default (matches the original palette).
 * - Themes only re-skin **light** mode; dark mode is intentionally unchanged.
 */
export type BrandTheme = 'indigo' | 'emerald' | 'sunset';

export const BRAND_THEMES: ReadonlyArray<BrandTheme> = ['indigo', 'emerald', 'sunset'];

const DEFAULT_BRAND: BrandTheme = 'indigo';

function isBrandTheme(v: unknown): v is BrandTheme {
  return v === 'indigo' || v === 'emerald' || v === 'sunset';
}

/**
 * Sidebar look-and-feel.
 * - `classic` is the original sidebar (default — preserved exactly).
 * - `pro` adds a richer glassmorphism + theme-coloured active state.
 */
export type SidebarStyle = 'classic' | 'pro';

export const SIDEBAR_STYLES: ReadonlyArray<SidebarStyle> = ['classic', 'pro'];

const DEFAULT_SIDEBAR: SidebarStyle = 'classic';

function isSidebarStyle(v: unknown): v is SidebarStyle {
  return v === 'classic' || v === 'pro';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly auth = inject(AuthService);

  /** When true, `dark` class is applied on `<html>` (Tailwind class strategy). */
  readonly isDark = signal(this.readInitialDark());

  /** Active brand theme (light-mode accent). Persisted globally and per-owner. */
  readonly brand = signal<BrandTheme>(this.readInitialBrand());

  /** Active sidebar style. Default is `classic` (original UI preserved). */
  readonly sidebarStyle = signal<SidebarStyle>(this.readInitialSidebar());

  constructor() {
    this.flushDark();
    this.flushBrand();
    this.flushSidebar();

    // When the signed-in owner changes, prefer their per-owner saved brand
    // theme. Falls back to the global preference for guests / login screen.
    effect(() => {
      const ownerId = this.auth.profile()?.ownerId ?? null;
      const nextBrand = this.readBrandFor(ownerId);
      if (nextBrand !== this.brand()) {
        this.brand.set(nextBrand);
        this.applyBrandToDom(nextBrand);
      }
      const nextSidebar = this.readSidebarFor(ownerId);
      if (nextSidebar !== this.sidebarStyle()) {
        this.sidebarStyle.set(nextSidebar);
        this.applySidebarToDom(nextSidebar);
      }
    });
  }

  // ----------------------------- dark mode -----------------------------

  toggle(): void {
    this.isDark.update((v) => !v);
    this.flushDark();
  }

  setDark(value: boolean): void {
    this.isDark.set(value);
    this.flushDark();
  }

  private readInitialDark(): boolean {
    try {
      const v = localStorage.getItem(DARK_KEY);
      if (v === 'dark') return true;
      if (v === 'light') return false;
    } catch {
      /* private mode */
    }
    return false;
  }

  private flushDark(): void {
    const dark = this.isDark();
    this.doc.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(DARK_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  // ----------------------------- brand themes -----------------------------

  /** Switch the active brand theme. Persisted per-owner if signed in. */
  setBrand(value: BrandTheme): void {
    if (!isBrandTheme(value)) return;
    this.brand.set(value);
    this.flushBrand();
  }

  private readInitialBrand(): BrandTheme {
    // At construction time the owner profile may not be loaded yet – the
    // effect() above will re-apply once the profile resolves.
    return this.readBrandFor(null);
  }

  private readBrandFor(ownerId: string | null): BrandTheme {
    try {
      if (ownerId) {
        const perOwner = localStorage.getItem(BRAND_KEY_PREFIX + ownerId);
        if (isBrandTheme(perOwner)) return perOwner;
      }
      const global = localStorage.getItem(BRAND_KEY_GLOBAL);
      if (isBrandTheme(global)) return global;
    } catch {
      /* private mode */
    }
    return DEFAULT_BRAND;
  }

  private flushBrand(): void {
    const value = this.brand();
    this.applyBrandToDom(value);
    try {
      localStorage.setItem(BRAND_KEY_GLOBAL, value);
      const ownerId = this.auth.profile()?.ownerId ?? null;
      if (ownerId) {
        localStorage.setItem(BRAND_KEY_PREFIX + ownerId, value);
      }
    } catch {
      /* ignore */
    }
  }

  private applyBrandToDom(value: BrandTheme): void {
    const root = this.doc.documentElement;
    if (value === DEFAULT_BRAND) {
      root.removeAttribute('data-brand-theme');
    } else {
      root.setAttribute('data-brand-theme', value);
    }
  }

  // ----------------------------- sidebar style -----------------------------

  /** Switch the sidebar style. Persisted per-owner if signed in. */
  setSidebarStyle(value: SidebarStyle): void {
    if (!isSidebarStyle(value)) return;
    this.sidebarStyle.set(value);
    this.flushSidebar();
  }

  private readInitialSidebar(): SidebarStyle {
    return this.readSidebarFor(null);
  }

  private readSidebarFor(ownerId: string | null): SidebarStyle {
    try {
      if (ownerId) {
        const perOwner = localStorage.getItem(SIDEBAR_KEY_PREFIX + ownerId);
        if (isSidebarStyle(perOwner)) return perOwner;
      }
      const global = localStorage.getItem(SIDEBAR_KEY_GLOBAL);
      if (isSidebarStyle(global)) return global;
    } catch {
      /* private mode */
    }
    return DEFAULT_SIDEBAR;
  }

  private flushSidebar(): void {
    const value = this.sidebarStyle();
    this.applySidebarToDom(value);
    try {
      localStorage.setItem(SIDEBAR_KEY_GLOBAL, value);
      const ownerId = this.auth.profile()?.ownerId ?? null;
      if (ownerId) {
        localStorage.setItem(SIDEBAR_KEY_PREFIX + ownerId, value);
      }
    } catch {
      /* ignore */
    }
  }

  private applySidebarToDom(value: SidebarStyle): void {
    const root = this.doc.documentElement;
    if (value === DEFAULT_SIDEBAR) {
      root.removeAttribute('data-sidebar-style');
    } else {
      root.setAttribute('data-sidebar-style', value);
    }
  }
}
