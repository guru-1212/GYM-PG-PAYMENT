import { Component, inject } from '@angular/core';
import {
  BRAND_THEMES,
  BrandTheme,
  SidebarStyle,
  ThemeService,
} from '../core/services/theme.service';
import { TranslatePipe } from './pipes/translate.pipe';

interface BrandSwatch {
  readonly id: BrandTheme;
  readonly labelKey: string;
  /** CSS gradient used for the round swatch preview. */
  readonly preview: string;
}

interface SidebarOption {
  readonly id: SidebarStyle;
  readonly labelKey: string;
  readonly icon: string;
}

const SWATCHES: ReadonlyArray<BrandSwatch> = [
  {
    id: 'indigo',
    labelKey: 'nav.themeIndigo',
    preview: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
  },
  {
    id: 'emerald',
    labelKey: 'nav.themeEmerald',
    preview: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  },
  {
    id: 'sunset',
    labelKey: 'nav.themeSunset',
    preview: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)',
  },
];

const SIDEBAR_OPTIONS: ReadonlyArray<SidebarOption> = [
  { id: 'classic', labelKey: 'nav.sidebarClassic', icon: 'view_sidebar' },
  { id: 'pro', labelKey: 'nav.sidebarPro', icon: 'auto_awesome' },
];

@Component({
  selector: 'app-theme-picker',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div
      class="rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-3 shadow-sm dark:border-slate-500 dark:bg-slate-800/90"
    >
      <p class="text-xs font-semibold text-slate-800 dark:text-slate-100">
        {{ 'nav.themeAccent' | t }}
      </p>
      <p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {{ 'nav.themeAccentHint' | t }}
      </p>
      <div class="mt-2.5 flex items-center gap-2">
        @for (s of swatches; track s.id) {
          <button
            type="button"
            (click)="select(s.id)"
            [attr.aria-pressed]="theme.brand() === s.id"
            [attr.aria-label]="s.labelKey | t"
            [title]="s.labelKey | t"
            class="group relative flex h-9 w-9 items-center justify-center rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            [class.ring-2]="theme.brand() === s.id"
            [class.ring-offset-2]="theme.brand() === s.id"
            [class.ring-slate-900]="theme.brand() === s.id"
            [class.ring-offset-slate-100]="theme.brand() === s.id"
            [class.dark:ring-white]="theme.brand() === s.id"
            [class.dark:ring-offset-slate-800]="theme.brand() === s.id"
          >
            <span
              class="block h-7 w-7 rounded-full shadow-md transition-transform group-hover:scale-105"
              [style.background]="s.preview"
            ></span>
            @if (theme.brand() === s.id) {
              <span
                class="material-icons-outlined pointer-events-none absolute text-base text-white drop-shadow"
                aria-hidden="true"
              >
                check
              </span>
            }
          </button>
        }
      </div>

      <div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-100">
          {{ 'nav.sidebarStyle' | t }}
        </p>
        <p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {{ 'nav.sidebarStyleHint' | t }}
        </p>
        <div
          role="radiogroup"
          [attr.aria-label]="'nav.sidebarStyle' | t"
          class="mt-2 inline-flex w-full rounded-lg border border-slate-300 bg-white p-0.5 shadow-inner dark:border-slate-600 dark:bg-slate-900"
        >
          @for (o of sidebarOptions; track o.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="theme.sidebarStyle() === o.id"
              (click)="selectSidebar(o.id)"
              [title]="o.labelKey | t"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              [class.bg-indigo-600]="theme.sidebarStyle() === o.id"
              [class.text-white]="theme.sidebarStyle() === o.id"
              [class.shadow]="theme.sidebarStyle() === o.id"
              [class.text-slate-700]="theme.sidebarStyle() !== o.id"
              [class.dark:text-slate-200]="theme.sidebarStyle() !== o.id"
              [class.hover:bg-slate-100]="theme.sidebarStyle() !== o.id"
              [class.dark:hover:bg-slate-800]="theme.sidebarStyle() !== o.id"
            >
              <span class="material-icons-outlined text-[14px] leading-none">{{ o.icon }}</span>
              {{ o.labelKey | t }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ThemePickerComponent {
  readonly theme = inject(ThemeService);
  readonly swatches = SWATCHES;
  readonly sidebarOptions = SIDEBAR_OPTIONS;

  /** All non-default themes (used by the standalone picker on guest pages). */
  protected readonly all = BRAND_THEMES;

  select(value: BrandTheme): void {
    this.theme.setBrand(value);
  }

  selectSidebar(value: SidebarStyle): void {
    this.theme.setSidebarStyle(value);
  }
}
