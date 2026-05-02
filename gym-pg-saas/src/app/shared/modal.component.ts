import { NgClass } from '@angular/common';
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [NgClass],
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
        [ngClass]="elevated() ? 'z-[100]' : 'z-50'"
        role="dialog"
        aria-modal="true"
        (click)="backdropClose() && closed.emit()"
      >
        <div
          class="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/60 bg-white/90 shadow-xl dark:border-slate-600/80 dark:bg-slate-900/95 dark:shadow-black/40"
          [class.max-w-lg]="!wide() && !extraWide()"
          [class.max-w-2xl]="wide() && !extraWide()"
          [class.max-w-6xl]="extraWide()"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <h2 class="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ title() }}</h2>
            <button
              type="button"
              class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
              [disabled]="!closable()"
              (click)="closable() && closed.emit()"
              aria-label="Close"
            >
              <span class="material-icons-outlined text-xl">close</span>
            </button>
          </div>
          <div class="px-5 py-4" [class.sm:px-6]="extraWide()" [class.sm:py-5]="extraWide()">
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
  /** When false, the header close control is disabled (e.g. during long-running work). */
  readonly closable = input(true);
  readonly backdropClose = input(false);
  /** Wider panel for detail views (e.g. member profile). */
  readonly wide = input(false);
  /** Full-width map-style content (e.g. bed map). Ignored if `wide` is also true — prefer one or the other. */
  readonly extraWide = input(false);
  /**
   * Use inside another modal/dialog. Higher z-index + no backdrop-filter on the panel so nested
   * `position:fixed` overlays anchor to the viewport instead of the parent scroll box.
   */
  readonly elevated = input(false);
  readonly closed = output<void>();
}
