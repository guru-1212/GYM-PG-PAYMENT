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
        <div
          class="pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg"
          [class.border-emerald-200]="t.kind === 'success'"
          [class.bg-emerald-50]="t.kind === 'success'"
          [class.text-emerald-900]="t.kind === 'success'"
          [class.border-red-200]="t.kind === 'error'"
          [class.bg-red-50]="t.kind === 'error'"
          [class.text-red-900]="t.kind === 'error'"
        >
          <div class="flex items-start justify-between gap-3">
            <span>{{ t.message }}</span>
            <button
              type="button"
              class="text-slate-500 hover:text-slate-800"
              (click)="toast.dismiss(t.id)"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);
}
