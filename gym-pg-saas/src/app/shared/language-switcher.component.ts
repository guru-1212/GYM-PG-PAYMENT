import { Component, inject } from '@angular/core';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from './pipes/translate.pipe';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div
      class="inline-flex rounded-lg border border-slate-200/90 bg-white/95 p-0.5 text-[11px] font-bold shadow-sm backdrop-blur-sm"
      role="group"
      [attr.aria-label]="'a11y.language' | t"
    >
      <button
        type="button"
        class="rounded-md px-2 py-1 transition-colors"
        [class.bg-indigo-600]="i18n.lang() === 'en'"
        [class.text-white]="i18n.lang() === 'en'"
        [class.text-slate-600]="i18n.lang() !== 'en'"
        (click)="i18n.setLang('en')"
      >
        {{ 'lang.en' | t }}
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 transition-colors"
        [class.bg-indigo-600]="i18n.lang() === 'te'"
        [class.text-white]="i18n.lang() === 'te'"
        [class.text-slate-600]="i18n.lang() !== 'te'"
        (click)="i18n.setLang('te')"
      >
        {{ 'lang.te' | t }}
      </button>
    </div>
  `,
})
export class LanguageSwitcherComponent {
  readonly i18n = inject(TranslationService);
}
