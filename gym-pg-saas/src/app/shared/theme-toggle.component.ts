import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';
import { TranslatePipe } from './pipes/translate.pipe';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div
      class="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-3 shadow-sm dark:border-slate-500 dark:bg-slate-800/90"
    >
      <div class="min-w-0">
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-100">{{ 'nav.theme' | t }}</p>
        <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">
          {{ theme.isDark() ? ('nav.themeDark' | t) : ('nav.themeLight' | t) }}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        [attr.aria-checked]="theme.isDark()"
        [attr.aria-label]="'a11y.toggleTheme' | t"
        (click)="theme.toggle()"
        class="relative h-9 w-[3.25rem] shrink-0 rounded-full border-2 border-slate-400 bg-slate-200 shadow-inner transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-500 dark:bg-slate-700"
        [class.border-indigo-500]="theme.isDark()"
        [class.bg-indigo-600]="theme.isDark()"
      >
        <span
          class="pointer-events-none absolute left-0.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition-[left] duration-200 ease-out dark:border-slate-600"
          [style.left]="theme.isDark() ? 'calc(100% - 1.875rem)' : '0.125rem'"
        ></span>
      </button>
    </div>
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}