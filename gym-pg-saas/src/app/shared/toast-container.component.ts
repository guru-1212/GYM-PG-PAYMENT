import { Component, inject } from '@angular/core';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-toast flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      @for (t of toast.toasts(); track t.id) {
        @if (t.kind === 'success') {
          <div
            class="pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100 dark:shadow-black/30"
          >
            <div class="flex items-start justify-between gap-3">
              <span>{{ t.message }}</span>
              <button
                type="button"
                class="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                (click)="toast.dismiss(t.id)"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        } @else {
          <div
            class="pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg dark:border-red-800 dark:bg-red-950/90 dark:text-red-100 dark:shadow-black/30"
          >
            <div class="flex items-start justify-between gap-3">
              <span>{{ t.message }}</span>
              <button
                type="button"
                class="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                (click)="toast.dismiss(t.id)"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);
}
