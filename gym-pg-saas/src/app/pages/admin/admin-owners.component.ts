import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BusinessType, Owner, OwnerStatus } from '../../core/models/owner.model';
import { OwnerAdminChatMessage } from '../../core/models/owner-admin-chat.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { OwnerAdminChatService } from '../../core/services/owner-admin-chat.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
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
  private readonly i18n = inject(TranslationService);

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
  readonly memberCountsByOwner = signal<Record<string, number>>({});
  readonly dayAdjustByOwner = signal<Record<string, number>>({});
  readonly calendarDateByOwner = signal<Record<string, string>>({});
  /** Owners list filters (admin). */
  readonly filterSearch = signal('');
  readonly filterStatus = signal<'all' | OwnerStatus>('all');
  readonly filterPlan = signal<'all' | 'active' | 'expired' | 'expiring-soon'>('all');
  readonly filterBusinessType = signal<'all' | BusinessType>('all');
  /** Mark inactive: confirm + admin password. */
  readonly inactiveConfirmOwner = signal<Owner | null>(null);
  readonly inactiveConfirmPassword = signal('');
  readonly inactiveConfirmBusy = signal(false);
  /** Reactivate: confirm only. */
  readonly activeConfirmOwner = signal<Owner | null>(null);
  readonly activeConfirmBusy = signal(false);
  private unsub: (() => void) | null = null;
  private unsubUnread: (() => void) | null = null;
  private unsubMemberCounts: (() => void) | null = null;
  private unsubThread: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
    this.unsubUnread = this.chat.watchAdminUnreadCounts((counts) => this.unreadByOwner.set(counts));
    this.unsubMemberCounts = this.admin.watchOwnerMemberCounts((counts) => this.memberCountsByOwner.set(counts));
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.unsubUnread?.();
    this.unsubMemberCounts?.();
    this.unsubThread?.();
  }

  readonly ownerRows = computed(() => this.owners().filter((o) => o.role === 'owner'));

  readonly filteredOwnerRows = computed(() => {
    let list = this.ownerRows();
    const q = this.filterSearch().trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const name = (o.name || '').toLowerCase();
        const email = (o.email || '').toLowerCase();
        const bn = (o.businessName || '').toLowerCase();
        const phone = (o.phone || '').toLowerCase();
        return name.includes(q) || email.includes(q) || bn.includes(q) || phone.includes(q);
      });
    }
    const st = this.filterStatus();
    if (st !== 'all') {
      list = list.filter((o) => o.status === st);
    }
    const pl = this.filterPlan();
    if (pl !== 'all') {
      list = list.filter((o) => this.getPlanStatus(o) === pl);
    }
    const bt = this.filterBusinessType();
    if (bt !== 'all') {
      list = list.filter((o) => o.businessType === bt);
    }
    return list;
  });

  readonly hasActiveOwnerFilters = computed(() => {
    return (
      this.filterSearch().trim() !== '' ||
      this.filterStatus() !== 'all' ||
      this.filterPlan() !== 'all' ||
      this.filterBusinessType() !== 'all'
    );
  });

  setFilterStatus(raw: string): void {
    if (raw === 'all' || raw === 'pending' || raw === 'approved' || raw === 'rejected' || raw === 'inactive') {
      this.filterStatus.set(raw);
    }
  }

  setFilterPlan(raw: string): void {
    if (raw === 'all' || raw === 'active' || raw === 'expired' || raw === 'expiring-soon') {
      this.filterPlan.set(raw);
    }
  }

  setFilterBusinessType(raw: string): void {
    if (raw === 'all' || raw === 'gym' || raw === 'pg') {
      this.filterBusinessType.set(raw);
    }
  }

  clearOwnerFilters(): void {
    this.filterSearch.set('');
    this.filterStatus.set('all');
    this.filterPlan.set('all');
    this.filterBusinessType.set('all');
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

  memberCount(ownerId: string): number {
    return this.memberCountsByOwner()[ownerId] || 0;
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

  openActiveConfirm(owner: Owner): void {
    this.activeConfirmOwner.set(owner);
  }

  closeActiveConfirm(): void {
    if (this.activeConfirmBusy()) return;
    this.activeConfirmOwner.set(null);
  }

  async confirmActivateOwner(): Promise<void> {
    const owner = this.activeConfirmOwner();
    if (!owner) return;
    this.activeConfirmBusy.set(true);
    this.busyId.set(owner.ownerId);
    try {
      await this.admin.setOwnerStatus(owner.ownerId, 'approved');
      this.toast.success('Owner activated');
      this.activeConfirmOwner.set(null);
    } catch {
      this.toast.error('Could not activate owner');
    } finally {
      this.busyId.set(null);
      this.activeConfirmBusy.set(false);
    }
  }

  openInactiveConfirm(owner: Owner): void {
    this.inactiveConfirmPassword.set('');
    this.inactiveConfirmOwner.set(owner);
  }

  closeInactiveConfirm(): void {
    if (this.inactiveConfirmBusy()) return;
    this.inactiveConfirmOwner.set(null);
    this.inactiveConfirmPassword.set('');
  }

  async confirmInactiveOwner(): Promise<void> {
    const owner = this.inactiveConfirmOwner();
    const password = this.inactiveConfirmPassword().trim();
    if (!owner) return;
    if (!password) {
      this.toast.error(this.i18n.t('login.passwordRequired'));
      return;
    }
    this.inactiveConfirmBusy.set(true);
    try {
      try {
        await this.auth.reauthenticateWithPassword(password);
      } catch (e: unknown) {
        const err = e as { message?: string };
        if (err?.message === 'no-email-for-reauth') {
          this.toast.error(this.i18n.t('admin.reauthNoEmail'));
        } else {
          this.toast.error(this.i18n.t('admin.reauthWrongPassword'));
        }
        return;
      }
      this.busyId.set(owner.ownerId);
      try {
        await this.admin.setOwnerStatus(owner.ownerId, 'inactive');
      } catch {
        this.toast.error('Could not mark owner inactive');
        return;
      }
      this.toast.success('Owner marked inactive');
      this.inactiveConfirmOwner.set(null);
      this.inactiveConfirmPassword.set('');
    } finally {
      this.busyId.set(null);
      this.inactiveConfirmBusy.set(false);
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

  // ------------------------- feature flags -------------------------

  isSupervisorEnabled(o: Owner): boolean {
    return o.featureFlags?.supervisorEnabled === true;
  }

  isWhatsappEnabled(o: Owner): boolean {
    return o.featureFlags?.whatsappEnabled === true;
  }

  isAuditLogEnabled(o: Owner): boolean {
    return o.featureFlags?.auditLogEnabled === true;
  }

  /** Tenant PWA (QR install, complaints, owner broadcasts) — off only when admin sets false. */
  isTenantMemberAppEnabled(o: Owner): boolean {
    return o.featureFlags?.tenantMemberAppEnabled !== false;
  }

  async toggleSupervisorEnabled(o: Owner, checked: boolean): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.setOwnerFeatureFlag(o.ownerId, 'supervisorEnabled', checked);
      this.toast.success(
        checked ? 'Supervisor accounts enabled' : 'Supervisor accounts disabled',
      );
    } catch {
      this.toast.error('Could not update feature flag');
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleWhatsappEnabled(o: Owner, checked: boolean): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.setOwnerFeatureFlag(o.ownerId, 'whatsappEnabled', checked);
      this.toast.success(
        checked ? 'WhatsApp integration enabled' : 'WhatsApp integration disabled',
      );
    } catch {
      this.toast.error('Could not update feature flag');
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleAuditLogEnabled(o: Owner, checked: boolean): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.setOwnerFeatureFlag(o.ownerId, 'auditLogEnabled', checked);
      this.toast.success(checked ? 'Audit log enabled' : 'Audit log hidden');
    } catch {
      this.toast.error('Could not update feature flag');
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleTenantMemberAppEnabled(o: Owner, checked: boolean): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.setOwnerFeatureFlag(o.ownerId, 'tenantMemberAppEnabled', checked);
      this.toast.success(
        checked
          ? 'Tenant member app (QR, complaints, messages) enabled'
          : 'Tenant member app disabled for this owner',
      );
    } catch {
      this.toast.error('Could not update feature flag');
    } finally {
      this.busyId.set(null);
    }
  }

  /** Default = 2; admin can override per owner. */
  supervisorQuotaValue(o: Owner): number {
    return typeof o.supervisorQuota === 'number' ? o.supervisorQuota : 2;
  }

  async setSupervisorQuota(o: Owner, raw: unknown): Promise<void> {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const value = Math.max(0, Math.floor(n));
    this.busyId.set(o.ownerId);
    try {
      await this.admin.setOwnerSupervisorQuota(o.ownerId, value);
      this.toast.success(`Supervisor cap set to ${value}`);
    } catch {
      this.toast.error('Could not update cap');
    } finally {
      this.busyId.set(null);
    }
  }

  closeModal(): void {
    this.showSubscriptionModal.set(false);
    this.selectedOwner.set(null);
  }
}
