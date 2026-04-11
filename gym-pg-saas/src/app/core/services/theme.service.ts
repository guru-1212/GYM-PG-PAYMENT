import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

const STORAGE_KEY = 'paybook.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  /** When true, `dark` class is applied on `<html>` (Tailwind class strategy). */
  readonly isDark = signal(this.readInitial());

  constructor() {
    this.flush();
  }

  toggle(): void {
    this.isDark.update((v) => !v);
    this.flush();
  }

  setDark(value: boolean): void {
    this.isDark.set(value);
    this.flush();
  }

  private readInitial(): boolean {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'dark') return true;
      if (v === 'light') return false;
    } catch {
      /* private mode */
    }
    return false;
  }

  private flush(): void {
    const dark = this.isDark();
    const root = this.doc.documentElement;
    root.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }
}