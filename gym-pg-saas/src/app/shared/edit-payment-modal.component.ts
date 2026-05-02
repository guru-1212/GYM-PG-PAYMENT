import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Payment } from '../core/models/payment.model';
import { PaymentService } from '../core/services/payment.service';
import { ToastService } from '../core/services/toast.service';
import { TranslationService } from '../core/services/translation.service';
import { ModalComponent } from './modal.component';
import { TranslatePipe } from './pipes/translate.pipe';

export type EditPaymentKind = 'rent' | 'pending';

@Component({
  selector: 'app-edit-payment-modal',
  standalone: true,
  imports: [ModalComponent, ReactiveFormsModule, DatePipe, DecimalPipe, TranslatePipe],
  template: `
    <app-modal
      [open]="open()"
      [title]="modalTitle()"
      [closable]="!submitting()"
      [backdropClose]="false"
      [elevated]="elevated()"
      (closed)="onClose()"
    >
      @if (payment(); as p) {
        <div class="space-y-4">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            {{ hintText() }}
          </p>

          <div
            class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60"
          >
            <p class="font-medium text-slate-900 dark:text-slate-100">{{ memberName() }}</p>
            <p class="mt-0.5 text-slate-600 dark:text-slate-400">
              {{ p.date.toDate() | date: 'mediumDate' }}
              · {{ (p.method || '').toUpperCase() }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ 'payments.currentAmount' | t }}:
              <span class="font-semibold tabular-nums text-slate-800 dark:text-slate-200"
                >₹{{ p.amount | number: '1.0-0' }}</span
              >
              @if (editKind() === 'pending' || (p.pendingAmount ?? 0) > 0) {
                <span class="ml-2">
                  · {{ 'payments.pendingAmount' | t }}:
                  <span class="font-semibold tabular-nums text-amber-800 dark:text-amber-200"
                    >₹{{ (p.pendingAmount ?? 0) | number: '1.0-0' }}</span
                  >
                </span>
              }
            </p>
          </div>

          @if (editKind() === 'rent') {
            <form [formGroup]="formRent" (ngSubmit)="onSubmit($event)" class="space-y-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {{ 'payments.newAmount' | t }}
                </label>
                <input
                  type="number"
                  formControlName="amount"
                  min="1"
                  step="1"
                  class="w-full rounded-xl border border-slate-200 px-4 py-2 text-base dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                @if (formRent.controls.amount.touched && formRent.controls.amount.invalid) {
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                    {{ 'payments.amountInvalid' | t }}
                  </p>
                }
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  [disabled]="submitting()"
                  (click)="onClose()"
                >
                  {{ 'common.cancel' | t }}
                </button>
                <button
                  type="submit"
                  class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  [disabled]="submitting() || formRent.invalid"
                >
                  @if (submitting()) {
                    <span>{{ 'common.saving' | t }}</span>
                  } @else {
                    <span>{{ 'payments.saveAmount' | t }}</span>
                  }
                </button>
              </div>
            </form>
          } @else {
            <form [formGroup]="formPending" (ngSubmit)="onSubmit($event)" class="space-y-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {{ 'payments.newPending' | t }}
                </label>
                <input
                  type="number"
                  formControlName="pendingAmount"
                  min="0"
                  step="1"
                  class="w-full rounded-xl border border-slate-200 px-4 py-2 text-base dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                @if (
                  formPending.controls.pendingAmount.touched && formPending.controls.pendingAmount.invalid
                ) {
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                    {{ 'payments.pendingInvalid' | t }}
                  </p>
                }
              </div>
              <div class="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  [disabled]="submitting()"
                  (click)="onClose()"
                >
                  {{ 'common.cancel' | t }}
                </button>
                <button
                  type="submit"
                  class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                  [disabled]="submitting() || formPending.invalid"
                >
                  @if (submitting()) {
                    <span>{{ 'common.saving' | t }}</span>
                  } @else {
                    <span>{{ 'payments.savePending' | t }}</span>
                  }
                </button>
              </div>
            </form>
          }
        </div>
      }
    </app-modal>
  `,
})
export class EditPaymentModalComponent {
  private readonly paymentsApi = inject(PaymentService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly fb = inject(FormBuilder);

  readonly open = input(false);
  readonly payment = input<Payment | null>(null);
  readonly memberName = input('');
  readonly elevated = input(false);
  /** `rent` = collected amount on the row; `pending` = partial row pending balance. */
  readonly editKind = input<EditPaymentKind>('rent');
  readonly closed = output<void>();

  readonly submitting = signal(false);

  readonly formRent = this.fb.nonNullable.group({
    amount: [1, [Validators.required, Validators.min(1)]],
  });

  readonly formPending = this.fb.nonNullable.group({
    pendingAmount: [0, [Validators.required, Validators.min(0)]],
  });

  readonly modalTitle = computed(() => {
    this.i18n.lang();
    return this.editKind() === 'pending'
      ? this.i18n.t('payments.editPendingPayment')
      : this.i18n.t('payments.editRentPayment');
  });

  readonly hintText = computed(() => {
    this.i18n.lang();
    return this.editKind() === 'pending'
      ? this.i18n.t('payments.editPendingPaymentHint')
      : this.i18n.t('payments.editRentPaymentHint');
  });

  constructor() {
    effect(() => {
      const p = this.payment();
      const k = this.editKind();
      if (!p) return;
      if (k === 'rent') {
        const a = Math.max(1, Math.round(Number(p.amount)) || 1);
        this.formRent.patchValue({ amount: a }, { emitEvent: false });
        this.formRent.controls.amount.markAsUntouched();
      } else {
        const pen = Math.max(0, Math.round(Number(p.pendingAmount)) || 0);
        this.formPending.patchValue({ pendingAmount: pen }, { emitEvent: false });
        this.formPending.controls.pendingAmount.markAsUntouched();
      }
    });
  }

  onClose(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.editKind() === 'rent') void this.submitRent();
    else void this.submitPending();
  }

  private async submitRent(): Promise<void> {
    this.formRent.markAllAsTouched();
    if (this.formRent.invalid || this.submitting()) return;

    const p = this.payment();
    if (!p?.paymentId) {
      this.toast.error(this.i18n.t('payments.editPaymentError'));
      return;
    }

    const raw = this.formRent.getRawValue().amount;
    const amount = Math.round(Number(raw));
    if (!Number.isFinite(amount) || amount < 1) {
      this.toast.error(this.i18n.t('payments.amountInvalid'));
      return;
    }

    if (amount === Math.round(Number(p.amount))) {
      this.toast.success(this.i18n.t('payments.editPaymentNoChange'));
      return;
    }

    this.submitting.set(true);
    try {
      await this.paymentsApi.updatePaymentAmount(p.paymentId, amount);
      this.toast.success(this.i18n.t('payments.editPaymentSuccess'));
      this.closed.emit();
    } catch (e) {
      this.handleError(e);
    } finally {
      this.submitting.set(false);
    }
  }

  private async submitPending(): Promise<void> {
    this.formPending.markAllAsTouched();
    if (this.formPending.invalid || this.submitting()) return;

    const p = this.payment();
    if (!p?.paymentId) {
      this.toast.error(this.i18n.t('payments.editPendingPaymentError'));
      return;
    }

    const raw = this.formPending.getRawValue().pendingAmount;
    const pending = Math.max(0, Math.round(Number(raw)));
    if (!Number.isFinite(pending)) {
      this.toast.error(this.i18n.t('payments.pendingInvalid'));
      return;
    }

    if (pending === Math.round(Number(p.pendingAmount) || 0)) {
      this.toast.success(this.i18n.t('payments.editPendingNoChange'));
      return;
    }

    this.submitting.set(true);
    try {
      await this.paymentsApi.updatePaymentPendingAmount(p.paymentId, pending);
      this.toast.success(this.i18n.t('payments.editPendingSuccess'));
      this.closed.emit();
    } catch (e) {
      this.handleError(e, 'pending');
    } finally {
      this.submitting.set(false);
    }
  }

  private handleError(e: unknown, branch: 'rent' | 'pending' = 'rent'): void {
    const err = e as { code?: string; message?: string };
    const code = err?.code ?? '';
    const msg = typeof err?.message === 'string' ? err.message : '';
    if (code === 'permission-denied' || /permission/i.test(msg)) {
      this.toast.error(this.i18n.t('payments.editPaymentDenied'));
      return;
    }
    this.toast.error(
      branch === 'pending'
        ? this.i18n.t('payments.editPendingPaymentError')
        : this.i18n.t('payments.editPaymentError'),
    );
  }
}
