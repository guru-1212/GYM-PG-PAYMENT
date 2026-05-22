import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { ModalComponent } from './modal.component';

/**
 * Modal shown after a member's pending balance is fully cleared.
 * Owner chooses whether to:
 * - Move member to next billing cycle (June after clearing May)
 * - Keep member in current cycle (clear balance but stay in May)
 */
@Component({
  selector: 'app-cycle-transition-modal',
  standalone: true,
  imports: [DecimalPipe, NgClass, ModalComponent],
  template: `
    <app-modal [open]="open" [title]="'Billing Cycle Update'" (onClose)="onCancel()">
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="space-y-2">
          <h3 class="font-bold text-lg text-slate-900">
            ✓ Pending Amount Cleared
          </h3>
          <p class="text-sm text-slate-600">
            {{ memberName }} has paid the pending amount - Now they have a clean slate!
            <!-- <span class="font-semibold">₹{{ pendingAmount | number : '1.0-0' }}</span>. -->
          </p>
        </div>

        <!-- Breakdown -->
        <!-- <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 class="font-semibold text-sm text-blue-900 mb-3">Payment Breakdown</h4>
          <div class="space-y-2 text-sm text-blue-800">
            <div class="flex justify-between">
              <span>Previous Month ({{ previousMonth }}) Pending:</span>
              <span class="font-semibold">₹{{ pendingAmount | number : '1.0-0' }}</span>
            </div>
            <div class="flex justify-between">
              <span>Current Rent ({{ currentMonth }}):</span>
              <span class="font-semibold">₹{{ currentRent | number : '1.0-0' }}</span>
            </div>
          </div>
        </div> -->

        <!-- Decision Options -->
        <div class="space-y-3">
          <p class="font-semibold text-slate-900 text-sm">What would you like to do?</p>

          <!-- Option 1: Move to next cycle -->
          <label
            class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
            [ngClass]="selectedOption() === 'moveNext' 
              ? 'border-green-500 bg-green-50 dark:bg-green-900/30 dark:border-green-600' 
              : 'border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-600'"
          >
            <input
              type="radio"
              name="cycle-option"
              value="moveNext"
              (change)="selectedOption.set('moveNext')"
              [checked]="selectedOption() === 'moveNext'"
              class="mt-1 mr-3 w-4 h-4"
            />
            <div class="flex-1">
              <div class="font-semibold text-slate-900 dark:text-white">
                Move to Next Billing Cycle
              </div>
              <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {{ memberName }} moves to {{ nextMonth }} cycle.
                <br />
                Balance is cleared and they start fresh.
              </div>
            </div>
          </label>

          <!-- Option 2: Keep in current cycle -->
          <!-- <label
            class="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all"
            [ngClass]="selectedOption() === 'keepCurrent' 
              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-600' 
              : 'border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-600'"
          >
            <input
              type="radio"
              name="cycle-option"
              value="keepCurrent"
              (change)="selectedOption.set('keepCurrent')"
              [checked]="selectedOption() === 'keepCurrent'"
              class="mt-1 mr-3 w-4 h-4"
            />
            <div class="flex-1">
              <div class="font-semibold text-slate-900 dark:text-white">
                Keep in Current Billing Cycle
              </div>
              <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {{ memberName }} stays in {{ currentMonth }}.
                <br />
                Pending balance is cleared but they continue in the same cycle.
              </div>
            </div>
          </label> -->
        </div>

        <!-- Info Box -->
        <!-- <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p class="text-xs text-amber-900">
            <strong>💡 Tip:</strong> Choose "Move to Next Cycle" for clean billing. Choose "Keep" if
            you want them to pay the current month's rent before cycling forward.
          </p>
        </div> -->

        <!-- Action Buttons -->
        <div class="flex gap-3 justify-end pt-4 border-t">
          <button
            (click)="onCancel()"
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium text-sm transition"
          >
            Cancel
          </button>
          <button
            (click)="onConfirm()"
            type="button"
            class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm transition disabled:opacity-50"
            [disabled]="!selectedOption()"
          >
            Confirm
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class CycleTransitionModalComponent {
  @Input() open = false;
  @Input() memberName = '';
  @Input() pendingAmount = 0;
  @Input() currentRent = 0;
  @Input() currentMonth = '';
  @Input() nextMonth = '';
  @Input() previousMonth = '';

  @Output() closed = new EventEmitter<void>();
  @Output() decided = new EventEmitter<'moveNext' | 'keepCurrent'>();

  readonly selectedOption = signal<'moveNext' | 'keepCurrent' | null>(null);

  constructor() {
    // Auto-select move-next as default (better UX for clean billing)
    this.selectedOption.set('moveNext');
  }

  onCancel(): void {
    this.selectedOption.set('moveNext');
    this.closed.emit();
  }

  onConfirm(): void {
    const choice = this.selectedOption();
    if (choice) {
      this.decided.emit(choice);
      this.selectedOption.set('moveNext');
      this.closed.emit();
    }
  }
}
