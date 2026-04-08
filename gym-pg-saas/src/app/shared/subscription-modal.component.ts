import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from './pipes/translate.pipe';

@Component({
  selector: 'app-subscription-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        role="dialog"
        aria-modal="true"
        (click)="!loading() && cancel.emit()"
      >
        <div
          class="w-full max-w-sm overflow-y-auto rounded-2xl border border-white/60 bg-white/90 shadow-xl backdrop-blur-xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 class="text-lg font-semibold text-slate-900">{{ 'admin.setPlan' | t }}</h2>
            @if (!loading()) {
              <button
                type="button"
                class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                (click)="cancel.emit()"
                aria-label="Close"
              >
                <span class="material-icons-outlined text-xl">close</span>
              </button>
            }
          </div>
          <div class="px-5 py-4">
            <div class="space-y-4">
              <div>
                <p class="text-sm text-slate-600 mb-4">{{ 'admin.selectPlanDuration' | t }}</p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-slate-700">{{ 'admin.planDuration' | t }}</label>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    (click)="selectPlan(15)"
                    [class.ring-2]="planDays() === 15"
                    [class.ring-indigo-500]="planDays() === 15"
                    class="rounded-lg border-2 border-slate-200 px-3 py-3 text-sm font-medium transition-all hover:border-indigo-300"
                    [disabled]="loading()"
                  >
                    15 {{ 'admin.days' | t }}
                  </button>
                  <button
                    type="button"
                    (click)="selectPlan(30)"
                    [class.ring-2]="planDays() === 30"
                    [class.ring-indigo-500]="planDays() === 30"
                    class="rounded-lg border-2 border-slate-200 px-3 py-3 text-sm font-medium transition-all hover:border-indigo-300"
                    [disabled]="loading()"
                  >
                    1 {{ 'admin.month' | t }}
                  </button>
                  <button
                    type="button"
                    (click)="selectPlan(60)"
                    [class.ring-2]="planDays() === 60"
                    [class.ring-indigo-500]="planDays() === 60"
                    class="rounded-lg border-2 border-slate-200 px-3 py-3 text-sm font-medium transition-all hover:border-indigo-300"
                    [disabled]="loading()"
                  >
                    2 {{ 'admin.months' | t }}
                  </button>
                  <button
                    type="button"
                    (click)="selectPlan(90)"
                    [class.ring-2]="planDays() === 90"
                    [class.ring-indigo-500]="planDays() === 90"
                    class="rounded-lg border-2 border-slate-200 px-3 py-3 text-sm font-medium transition-all hover:border-indigo-300"
                    [disabled]="loading()"
                  >
                    3 {{ 'admin.months' | t }}
                  </button>
                </div>
              </div>

              <div class="rounded-lg bg-blue-50 p-3 border border-blue-200">
                @if (planDays() > 0) {
                  <p class="text-sm text-blue-900">
                    Plan expires: <strong>{{ getExpiryDate() | date: 'mediumDate' }}</strong>
                  </p>
                } @else {
                  <p class="text-sm text-blue-700">{{ 'admin.selectPlanMessage' | t }}</p>
                }
              </div>

              <div class="flex gap-2 pt-2">
                <button
                  type="button"
                  (click)="cancel.emit()"
                  class="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60"
                  [disabled]="loading()"
                >
                  {{ 'admin.cancel' | t }}
                </button>
                <button
                  type="button"
                  (click)="approve.emit(planDays())"
                  class="saas-btn-primary flex-1 py-2.5 text-sm disabled:opacity-60"
                  [disabled]="loading() || planDays() === 0"
                >
                  @if (loading()) {
                    <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent inline-block mr-2"></span>
                  }
                  {{ 'admin.approvePlan' | t }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class SubscriptionModalComponent {
  readonly open = input(false);
  readonly loading = input(false);

  readonly planDays = signal(0);

  readonly approve = output<number>();
  readonly cancel = output<void>();

  selectPlan(days: number): void {
    this.planDays.set(days);
  }

  getExpiryDate(): Date {
    const days = this.planDays();
    if (days === 0) return new Date();
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
