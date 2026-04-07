import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Owner } from '../../core/models/owner.model';
import { AdminService } from '../../core/services/admin.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { SubscriptionModalComponent } from '../../shared/subscription-modal.component';

@Component({
  selector: 'app-admin-owners',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SubscriptionModalComponent],
  templateUrl: './admin-owners.component.html',
})
export class AdminOwnersComponent implements OnInit, OnDestroy {
  private readonly admin = inject(AdminService);
  private readonly subscription = inject(SubscriptionService);
  private readonly toast = inject(ToastService);

  readonly owners = signal<Owner[]>([]);
  readonly busyId = signal<string | null>(null);
  readonly showSubscriptionModal = signal(false);
  readonly selectedOwner = signal<Owner | null>(null);
  readonly modalLoading = signal(false);
  private unsub: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  ownerRows(): Owner[] {
    return this.owners().filter((o) => o.role === 'owner');
  }

  getDaysRemaining(owner: Owner): number {
    if (!owner.planEndDate) return 0;
    const endDate = owner.planEndDate.toDate?.() || new Date(owner.planEndDate as any);
    const now = new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  }

  getPlanStatus(owner: Owner): 'active' | 'expired' | 'expiring-soon' {
    if (!owner.planEndDate) return 'expired';
    const daysRemaining = this.getDaysRemaining(owner);
    if (daysRemaining === 0) return 'expired';
    if (daysRemaining <= 5) return 'expiring-soon';
    return 'active';
  }

  openApproveModal(owner: Owner): void {
    this.selectedOwner.set(owner);
    this.showSubscriptionModal.set(true);
  }

  openExtendModal(owner: Owner): void {
    this.selectedOwner.set(owner);
    this.showSubscriptionModal.set(true);
  }

  async approve(planDays: number): Promise<void> {
    const owner = this.selectedOwner();
    if (!owner) return;

    this.modalLoading.set(true);
    try {
      await this.subscription.approveOwnerWithPlan(owner.ownerId, planDays);
      this.toast.success('Owner approved with subscription');
      this.showSubscriptionModal.set(false);
      this.selectedOwner.set(null);
    } catch {
      this.toast.error('Could not approve owner');
    } finally {
      this.modalLoading.set(false);
    }
  }

  async extendPlan(additionalDays: number): Promise<void> {
    const owner = this.selectedOwner();
    if (!owner) return;

    this.modalLoading.set(true);
    try {
      await this.subscription.extendPlan(owner.ownerId, additionalDays);
      this.toast.success('Plan extended successfully');
      this.showSubscriptionModal.set(false);
      this.selectedOwner.set(null);
    } catch {
      this.toast.error('Could not extend plan');
    } finally {
      this.modalLoading.set(false);
    }
  }

  async reject(o: Owner): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.rejectOwner(o.ownerId);
      this.toast.success('Owner rejected');
    } catch {
      this.toast.error('Could not reject');
    } finally {
      this.busyId.set(null);
    }
  }

  closeModal(): void {
    this.showSubscriptionModal.set(false);
    this.selectedOwner.set(null);
  }
}
