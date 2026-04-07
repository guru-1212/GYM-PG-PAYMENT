import { Injectable, signal } from '@angular/core';
import { EN } from '../i18n/en';
import { TE } from '../i18n/te';

export type AppLanguage = 'en' | 'te';

const STORAGE_KEY = 'paybook.lang';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly lang = signal<AppLanguage>(this.readStored());

  setLang(lang: AppLanguage): void {
    this.lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore quota / private mode */
    }
  }

  /** Reactive: reading lang() in templates updates when language changes. */
  t(key: string, params?: Record<string, string | number>): string {
    this.lang();
    const dict = this.lang() === 'te' ? TE : EN;
    let s = this.lookup(dict, key) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  }

  private readStored(): AppLanguage {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'te' ? 'te' : 'en';
    } catch {
      return 'en';
    }
  }

  private lookup(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return undefined;
      }
    }
    return typeof cur === 'string' ? cur : undefined;
  }
}
