import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { Member, SubscriptionType } from '../core/models/member.model';
import type { PaymentMethod } from '../core/models/payment.model';
import { AuthService } from '../core/services/auth.service';
import { DataCacheService } from '../core/services/data-cache.service';
import { MarkPaidResult, PaymentService } from '../core/services/payment.service';
import { ToastService } from '../core/services/toast.service';
import { dateToTimestamp, timestampToDate, nextDueAfterPaid, overdueCalendarDays } from '../core/utils/date.utils';
import { positiveAmount } from '../core/utils/validators';
import { ModalComponent } from './modal.component';
import { CycleTransitionModalComponent } from './cycle-transition-modal.component';

/**
 * Shared "Mark as paid" modal used by the Members page and the Payments page.
 *
 * Single source of truth for:
 * - Pay form scaffolding (full / partial payment, amount, method, subscription, etc.)
 * - Double-click protection on submit
 * - The actual `PaymentService.markPaid()` call
 * - Optimistic patch to the in-memory member cache so the UI updates instantly
 *   without waiting for the Firestore real-time listener round-trip.
 *
 * The component is self-contained: parents only pass the target member and an
 * `open` flag, and listen to `closed` / `paid` events.
 */
@Component({
  selector: 'app-pay-member-modal',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, ModalComponent, CycleTransitionModalComponent],
  templateUrl: './pay-member-modal.component.html',
})
export class PayMemberModalComponent implements OnChanges, OnDestroy {
  /** Whether the modal is visible. */
  @Input() open = false;
  /** The member to record payment for. Required when `open` is true. */
  @Input() member: Member | null = null;
  /** When true, the subscription-type selector is shown (gym only). */
  @Input() isGym = false;
  /** Display label for the due-date concept ("Plan expiry" or "Rent due"). */
  @Input() dueLabel = '';

  /** Emitted when the user closes the modal (cancel / backdrop / X). */
  @Output() closed = new EventEmitter<void>();
  /**
   * Emitted after a successful payment. Receives the same `MarkPaidResult` the
   * server applied so the parent can do additional bookkeeping if needed.
   */
  @Output() paid = new EventEmitter<MarkPaidResult>();

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(DataCacheService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly toast = inject(ToastService);

  /** True while a payment is being recorded — guards against double-clicks. */
  readonly paySubmitting = signal<boolean>(false);

  readonly payForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, positiveAmount()]],
    currentPayingAmount: [0, [Validators.min(0)]],
    method: this.fb.nonNullable.control<PaymentMethod>('cash', Validators.required),
    subscriptionType: this.fb.nonNullable.control<SubscriptionType>('monthly', Validators.required),
    isPartialPayment: this.fb.nonNullable.control(false),
    moveDueToNextCycle: this.fb.nonNullable.control(false),
    pendingAmount: [0],
  });

  private readonly formSubs: Subscription[] = [];

  // Cycle transition modal state shown after a payment that clears prior pending
  // but does not automatically advance the billing cycle.
  readonly showCycleModal = signal<boolean>(false);
  lastMarkPaidResult: MarkPaidResult | null = null;
  lastPaymentMember: Member | null = null;

  constructor() {
    // Toggle currentPayingAmount validators based on partial-payment toggle,
    // and keep `pendingAmount` field in sync as the user types.
    const partialSub = this.payForm.get('isPartialPayment')?.valueChanges.subscribe((isPartial) => {
      const pendingCtrl = this.payForm.get('pendingAmount');
      const currentPayingCtrl = this.payForm.get('currentPayingAmount');
      if (!pendingCtrl || !currentPayingCtrl) return;

      if (isPartial) {
        currentPayingCtrl.setValidators([Validators.required, Validators.min(1)]);
      } else {
        currentPayingCtrl.setValidators([Validators.min(0)]);
      }
      this.syncPayFormPending();
      pendingCtrl.setValidators([]);
      pendingCtrl.updateValueAndValidity();
      currentPayingCtrl.updateValueAndValidity();
    });
    if (partialSub) this.formSubs.push(partialSub);

    const payingSub = this.payForm
      .get('currentPayingAmount')
      ?.valueChanges.subscribe(() => this.syncPayFormPending());
    if (payingSub) this.formSubs.push(payingSub);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset the form whenever the modal is opened with a (possibly new) member.
    const becameOpen = changes['open']?.currentValue === true && changes['open']?.previousValue !== true;
    const memberChangedWhileOpen = !!changes['member'] && this.open;
    if ((becameOpen || memberChangedWhileOpen) && this.member) {
      this.resetForm(this.member);
    }
  }

  ngOnDestroy(): void {
    for (const s of this.formSubs) s.unsubscribe();
  }

  /** Safely converts the member's Firestore due-date Timestamp to a JS Date. */
  getMemberDueDate(): Date | null {
    if (!this.member) return null;
    return timestampToDate(this.member.dueDate);
  }

  /** Computed pending = total - currentPaying (used by the readonly UI input). */
  pendingFromPayForm(): number {
    const total = Math.max(0, Number(this.member?.amount) || 0);
    const paying = Math.max(0, Number(this.payForm.controls.currentPayingAmount.value) || 0);
    return Math.max(0, total - paying);
  }

  onCancel(): void {
    if (this.paySubmitting()) return;
    this.closed.emit();
  }

  /** Called from <app-modal> when the user dismisses via X or backdrop. */
  onModalClose(): void {
    if (this.paySubmitting()) return;
    this.closed.emit();
  }

  async onSubmit(): Promise<void> {
    // Double-click guard: ignore subsequent clicks while in flight.
    if (this.paySubmitting()) return;

    if (this.payForm.invalid) {
      this.payForm.markAllAsTouched();
      return;
    }

    const m = this.member;
    const owner = this.auth.profile();
    if (!m || !owner) return;

    const due = timestampToDate(m.dueDate);
    if (!due) {
      this.toast.error('Invalid due date');
      return;
    }

    const v = this.payForm.getRawValue();
    if (v.isPartialPayment) {
      if (!Number.isFinite(Number(v.currentPayingAmount)) || Number(v.currentPayingAmount) <= 0) {
        this.toast.error('Enter current paying amount for partial payment');
        return;
      }
    }

    const priorPending = Math.max(0, Number(m.pendingAmount) || 0);
    const planAmount = Math.max(0, Number(m.amount) || 0);
    const totalRentAmount = Math.max(0, Number(m.amount) || 0);
    const currentPayingAmount = Math.max(0, Number(v.currentPayingAmount) || 0);
    const computedPending = Math.max(0, totalRentAmount - currentPayingAmount);
    const paymentAmount = v.isPartialPayment ? currentPayingAmount : totalRentAmount;

    this.paySubmitting.set(true);
    try {
      const result = await this.paymentsApi.markPaid({
        memberId: m.memberId,
        ownerId: owner.ownerId,
        amount: paymentAmount,
        method: v.method,
        currentDueDate: due,
        subscriptionType: this.isGym ? v.subscriptionType : undefined,
        isPartialPayment: v.isPartialPayment,
        moveDueOnPartial: v.isPartialPayment ? v.moveDueToNextCycle : false,
        pendingAmount: v.isPartialPayment ? computedPending : 0,
        priorPendingAmount: priorPending,
        memberPlanAmount: planAmount,
      });

      // Optimistic update: patch the cached member instantly so the UI reflects
      // the new state without waiting for the Firestore listener. The listener
      // will overwrite this with identical server-authoritative values shortly.
      const patch: Partial<Member> = { pendingAmount: result.pendingAmount };
      const planAmt = Math.max(0, Number(m.amount) || 0);
      const pendAmt = Math.max(0, Number(result.pendingAmount) || 0);
      patch.paidRent = Math.max(0, Math.min(planAmt, planAmt - pendAmt));
      if (result.dueDate) patch.dueDate = dateToTimestamp(result.dueDate);
      if (result.subscriptionType) patch.subscriptionType = result.subscriptionType;
      this.cache.patchMemberLocal(m.memberId, patch);

      this.toast.success(v.isPartialPayment ? 'Partial payment recorded' : 'Payment recorded');

      // If a prior pending balance was cleared but the server did NOT advance
      // the billing cycle automatically (no excess to renew), prompt the
      // owner with a choice: move to next cycle or keep in current cycle.
      if (result.pendingClearedButNotAdvanced && priorPending > 0) {
        const overdueDays = overdueCalendarDays(due);
        if (overdueDays > 0) {
          // Store context for the modal flow and open the decision modal.
          this.lastMarkPaidResult = result;
          this.lastPaymentMember = m;
          // We keep the modal open to allow the owner to choose; do NOT emit
          // `paid` or close the parent modal yet — wait for the owner's decision.
          // Attach modal data into the cache patch so the modal can read current
          // values from the component instance directly in the template.
          // Expose computed strings via signals by setting simple fields on the
          // component instance (template reads them directly).
          this.showCycleModal.set(true);
          return;
        }
      }

      // Normal success path: emit and close.
      this.paid.emit(result);
      this.closed.emit();
    } catch (error) {
      console.error('Record payment failed:', error);
      this.toast.error('Could not record payment');
    } finally {
      this.paySubmitting.set(false);
    }
  }

  private resetForm(m: Member): void {
    const plan = Math.max(0, Number(m.amount) || 0);
    this.payForm.reset({
      amount: plan,
      currentPayingAmount: plan,
      method: 'cash',
      subscriptionType: m.subscriptionType ?? 'monthly',
      isPartialPayment: false,
      moveDueToNextCycle: false,
      pendingAmount: 0,
    });
    this.syncPayFormPending();
  }

  private syncPayFormPending(): void {
    const next = this.pendingFromPayForm();
    this.payForm.controls.pendingAmount.setValue(next, { emitEvent: false });
  }

  /** Handle the owner decision from the cycle-transition modal. */
  async onCycleDecision(choice: 'moveNext' | 'keepCurrent'): Promise<void> {
    const m = this.lastPaymentMember;
    const result = this.lastMarkPaidResult;
    const owner = this.auth.profile();
    if (!m || !result || !owner) {
      this.showCycleModal.set(false);
      // Fallback: emit whatever we have and close.
      if (result) this.paid.emit(result);
      this.closed.emit();
      return;
    }

    this.showCycleModal.set(false);

    if (choice === 'keepCurrent') {
      // Owner chose to keep in current cycle — nothing more to do.
      this.paid.emit(result);
      this.closed.emit();
      this.lastMarkPaidResult = null;
      this.lastPaymentMember = null;
      return;
    }

    // Owner chose to advance the billing cycle. Compute next due and apply.
    const currentDue = timestampToDate(m.dueDate);
    const nextDue = currentDue ? nextDueAfterPaid(currentDue, result.subscriptionType) : null;
    if (!nextDue) {
      // Unexpected — just emit and close.
      this.paid.emit(result);
      this.closed.emit();
      this.lastMarkPaidResult = null;
      this.lastPaymentMember = null;
      return;
    }

    try {
      await this.paymentsApi.applyCycleMove({
        memberId: m.memberId,
        ownerId: owner.ownerId,
        newDueDate: nextDue,
        subscriptionType: result.subscriptionType ?? undefined,
      });

      // Patch cache to reflect the advanced due date immediately.
      const patch: Partial<Member> = { pendingAmount: 0, dueDate: dateToTimestamp(nextDue) };
      if (result.subscriptionType) patch.subscriptionType = result.subscriptionType;
      this.cache.patchMemberLocal(m.memberId, patch);

      // Emit updated result including the new due date so parents can react.
      const updated: MarkPaidResult = { ...result, dueDate: nextDue };
      this.paid.emit(updated);
      this.closed.emit();
    } catch (err) {
      console.error('Could not advance cycle after owner decision:', err);
      // Emit original result so UI stays consistent.
      this.paid.emit(result);
      this.closed.emit();
    } finally {
      this.lastMarkPaidResult = null;
      this.lastPaymentMember = null;
    }
  }

  getCurrentMonthLabel(): string {
    const d = this.getMemberDueDate();
    if (!d) return '';
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }

  getNextMonthLabel(): string {
    const m = this.lastPaymentMember;
    const result = this.lastMarkPaidResult;
    if (!m) return '';
    const d = timestampToDate(m.dueDate);
    if (!d) return '';
    const next = nextDueAfterPaid(d, result?.subscriptionType);
    if (!next) return '';
    return next.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }
}
