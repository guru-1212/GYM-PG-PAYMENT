import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        (click)="backdropClose() && closed.emit()"
      >
        <div
          class="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/60 bg-white/90 shadow-xl backdrop-blur-xl"
          [class.max-w-lg]="!wide()"
          [class.max-w-2xl]="wide()"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 class="text-lg font-semibold text-slate-900">{{ title() }}</h2>
            <button
              type="button"
              class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              (click)="closed.emit()"
              aria-label="Close"
            >
              <span class="material-icons-outlined text-xl">close</span>
            </button>
          </div>
          <div class="px-5 py-4">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly backdropClose = input(false);
  /** Wider panel for detail views (e.g. member profile). */
  readonly wide = input(false);
  readonly closed = output<void>();
}
