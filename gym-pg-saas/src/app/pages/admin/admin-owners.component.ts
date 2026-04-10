import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Owner } from '../../core/models/owner.model';
import { OwnerAdminChatMessage } from '../../core/models/owner-admin-chat.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { OwnerAdminChatService } from '../../core/services/owner-admin-chat.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { SubscriptionModalComponent } from '../../shared/subscription-modal.component';

@Component({
  selector: 'app-admin-owners',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SubscriptionModalComponent, ModalComponent],
  templateUrl: './admin-owners.component.html',
})
export class AdminOwnersComponent implements OnInit, OnDestroy {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly chat = inject(OwnerAdminChatService);
  private readonly subscription = inject(SubscriptionService);
  private readonly toast = inject(ToastService);

  readonly owners = signal<Owner[]>([]);
  readonly busyId = signal<string | null>(null);
  readonly showSubscriptionModal = signal(false);
  readonly selectedOwner = signal<Owner | null>(null);
  readonly modalLoading = signal(false);
  readonly chatModalOpen = signal(false);
  readonly chatOwner = signal<Owner | null>(null);
  readonly chatMessages = signal<OwnerAdminChatMessage[]>([]);
  readonly chatText = signal('');
  readonly unreadByOwner = signal<Record<string, number>>({});
  readonly dayAdjustByOwner = signal<Record<string, number>>({});
  readonly calendarDateByOwner = signal<Record<string, string>>({});
  private unsub: (() => void) | null = null;
  private unsubUnread: (() => void) | null = null;
  private unsubThread: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
    this.unsubUnread = this.chat.watchAdminUnreadCounts((counts) => this.unreadByOwner.set(counts));
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.unsubUnread?.();
    this.unsubThread?.();
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

  dayAdjustValue(ownerId: string): number {
    return this.dayAdjustByOwner()[ownerId] ?? 1;
  }

  setDayAdjustValue(ownerId: string, raw: unknown): void {
    const n = Number(raw);
    const value = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
    this.dayAdjustByOwner.update((m) => ({ ...m, [ownerId]: value }));
  }

  calendarValue(owner: Owner): string {
    const fromInput = this.calendarDateByOwner()[owner.ownerId];
    if (fromInput) return fromInput;
    const d = owner.planEndDate?.toDate?.() || null;
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  setCalendarValue(ownerId: string, value: string): void {
    this.calendarDateByOwner.update((m) => ({ ...m, [ownerId]: value }));
  }

  unreadForOwner(ownerId: string): number {
    return this.unreadByOwner()[ownerId] || 0;
  }

  formatChatTime(msg: OwnerAdminChatMessage): string {
    const date = msg.timestamp?.toDate?.();
    if (!date) return '';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async openOwnerChat(owner: Owner): Promise<void> {
    this.chatOwner.set(owner);
    this.chatMessages.set([]);
    this.chatText.set('');
    this.chatModalOpen.set(true);
    this.unsubThread?.();
    this.unsubThread = this.chat.watchThread(owner.ownerId, (messages) => this.chatMessages.set(messages));
    await this.chat.markThreadReadByAdmin(owner.ownerId);
  }

  closeOwnerChat(): void {
    this.chatModalOpen.set(false);
    this.chatOwner.set(null);
    this.chatText.set('');
    this.unsubThread?.();
    this.unsubThread = null;
  }

  async sendAdminMessage(): Promise<void> {
    const owner = this.chatOwner();
    const text = this.chatText().trim();
    if (!owner || !text) return;
    const adminId = this.auth.profile()?.ownerId || this.auth.user()?.uid || 'admin';
    const adminName = this.auth.profile()?.name || 'Admin';
    try {
      await this.chat.sendMessage({
        chatId: owner.ownerId,
        senderRole: 'admin',
        senderId: adminId,
        senderName: adminName,
        text,
      });
      this.chatText.set('');
    } catch {
      this.toast.error('Could not send message');
    }
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

  async adjustPlanByDays(owner: Owner, sign: 1 | -1): Promise<void> {
    const days = this.dayAdjustValue(owner.ownerId);
    const delta = sign * days;
    this.busyId.set(owner.ownerId);
    try {
      await this.subscription.extendPlan(owner.ownerId, delta);
      this.toast.success(delta > 0 ? `Plan extended by ${days} day(s)` : `Plan reduced by ${days} day(s)`);
    } catch {
      this.toast.error('Could not update plan days');
    } finally {
      this.busyId.set(null);
    }
  }

  async setPlanByCalendar(owner: Owner): Promise<void> {
    const dateText = this.calendarValue(owner);
    if (!dateText) {
      this.toast.error('Please choose a valid date');
      return;
    }
    const date = new Date(`${dateText}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      this.toast.error('Please choose a valid date');
      return;
    }
    this.busyId.set(owner.ownerId);
    try {
      await this.subscription.setPlanEndDate(owner.ownerId, date);
      this.toast.success('Plan end date updated');
    } catch {
      this.toast.error('Could not update plan date');
    } finally {
      this.busyId.set(null);
    }
  }

  async setOwnerActive(owner: Owner): Promise<void> {
    this.busyId.set(owner.ownerId);
    try {
      await this.admin.setOwnerStatus(owner.ownerId, 'approved');
      this.toast.success('Owner activated');
    } catch {
      this.toast.error('Could not activate owner');
    } finally {
      this.busyId.set(null);
    }
  }

  async setOwnerInactive(owner: Owner): Promise<void> {
    this.busyId.set(owner.ownerId);
    try {
      await this.admin.setOwnerStatus(owner.ownerId, 'inactive');
      this.toast.success('Owner marked inactive');
    } catch {
      this.toast.error('Could not mark owner inactive');
    } finally {
      this.busyId.set(null);
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
