import { Component, HostListener, computed, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OwnerAdminChatMessage } from '../core/models/owner-admin-chat.model';
import { AuthService } from '../core/services/auth.service';
import { InAppNotificationService } from '../core/services/in-app-notification.service';
import { NotificationService } from '../core/services/notification.service';
import { OwnerAdminChatService } from '../core/services/owner-admin-chat.service';
// Complaints disabled — restore when feature fixed
// import { ComplaintService } from '../core/services/complaint.service';
import { TranslationService } from '../core/services/translation.service';
import { ModalComponent } from '../shared/modal.component';
import { TranslatePipe } from '../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { ThemeToggleComponent } from '../shared/theme-toggle.component';
import { ThemePickerComponent } from '../shared/theme-picker.component';
import { NotificationBellComponent } from '../shared/notification-bell/notification-bell.component';

type DayGreetingSegment = 'morning' | 'afternoon' | 'evening' | 'night';

function ownerDayGreetingSegment(now: Date): DayGreetingSegment {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function ownerDayGreetingIcon(segment: DayGreetingSegment): string {
  switch (segment) {
    case 'morning':
      return 'waving_hand';
    case 'afternoon':
      return 'wb_twilight';
    case 'evening':
      return 'nights_stay';
    case 'night':
      return 'bedtime';
    default:
      return 'waving_hand';
  }
}

@Component({
  selector: 'app-owner-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    BrandLogoComponent,
    ModalComponent,
    ThemeToggleComponent,
    ThemePickerComponent,
    NotificationBellComponent,
  ],
  templateUrl: './owner-shell.component.html',
})
export class OwnerShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly chat = inject(OwnerAdminChatService);
  private readonly inApp = inject(InAppNotificationService);
  private readonly notifications = inject(NotificationService);
  // private readonly complaintApi = inject(ComplaintService);
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);

  readonly profile = this.auth.profile;
  readonly isPgOwner = computed(() => this.profile()?.businessType === 'pg');
  readonly ownerInitial = computed(() => {
    const n = this.profile()?.name?.trim();
    if (!n) return '?';
    return n.charAt(0).toUpperCase();
  });

  /** Role helpers exposed to the template. */
  readonly isSupervisor = computed(() => this.profile()?.role === 'supervisor');
  readonly canViewMembers = computed(() => this.auth.hasPermission('canViewMembers'));
  readonly canViewInactiveMembers = computed(() => this.auth.hasPermission('canViewInactiveMembers'));
  readonly canViewPayments = computed(() => this.auth.hasPermission('canViewPayments'));
  readonly canViewRooms = computed(() => this.auth.hasPermission('canViewRooms'));
  /** Owner-only nav: shown when admin has enabled the supervisor feature flag for this owner. */
  readonly canSeeSupervisorsLink = computed(
    () =>
      this.profile()?.role === 'owner' &&
      this.profile()?.featureFlags?.supervisorEnabled === true,
  );
  /** Monthly earnings is hard-blocked for supervisors regardless of perms. */
  readonly canViewMonthlyEarnings = computed(() => !this.isSupervisor());
  /** Analytics dashboard — owner-only (financial + member data). */
  readonly canViewAnalytics = computed(() => !this.isSupervisor());

  /** Unread in-app alerts for the signed-in owner scope (sidebar badge). */
  readonly ownerInAppUnread = signal(0);

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly nowMs = signal(Date.now());
  readonly notificationsOpen = signal(false);
  readonly chatMessages = signal<OwnerAdminChatMessage[]>([]);
  readonly chatText = signal('');
  readonly unreadCount = signal(0);
  // readonly complaintToggleBusy = signal(false);
  /** Mobile top bar: time-of-day greeting (follows `nowMs` tick). */
  readonly ownerHeaderGreeting = computed(() => {
    this.nowMs();
    this.i18n.lang();
    const seg = ownerDayGreetingSegment(new Date());
    const key =
      seg === 'morning'
        ? 'shell.greetingMorning'
        : seg === 'afternoon'
          ? 'shell.greetingAfternoon'
          : seg === 'evening'
            ? 'shell.greetingEvening'
            : 'shell.greetingNight';
    return { text: this.i18n.t(key), icon: ownerDayGreetingIcon(seg) };
  });

  readonly planCountdown = computed(() => {
    this.nowMs();
    const end = this.profile()?.planEndDate?.toDate?.();
    if (!end) return null;
    const diffMs = end.getTime() - Date.now();
    if (diffMs <= 0) {
      return {
        expired: true,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        display: 'Expired',
      };
    }
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (v: number) => v.toString().padStart(2, '0');
    return {
      expired: false,
      days,
      hours,
      minutes,
      seconds,
      display: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    };
  });
  private unsubThread: (() => void) | null = null;
  private unsubUnread: (() => void) | null = null;
  private unsubOwnerInApp: (() => void) | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const ownerId = this.profile()?.ownerId;
      this.unsubThread?.();
      this.unsubUnread?.();
      this.unsubOwnerInApp?.();
      this.chatMessages.set([]);
      this.unreadCount.set(0);
      this.ownerInAppUnread.set(0);
      if (!ownerId) return;
      this.unsubThread = this.chat.watchThread(ownerId, (messages) => this.chatMessages.set(messages));
      this.unsubUnread = this.chat.watchOwnerUnreadCount(ownerId, (count) => this.unreadCount.set(count));
      this.unsubOwnerInApp = this.inApp.watchOwnerNotifications(ownerId, (rows) => {
        this.ownerInAppUnread.set(rows.filter((r) => !r.read).length);
      });
      /* Complaints disabled — restore when feature fixed
      const p = this.profile();
      if (p?.role === 'owner') {
        void this.complaintApi.publishPublicComplaintSettings(ownerId, Boolean(p.complaintEnabled));
      }
      void this.complaintApi.syncMemberMobileLookupsForOwner(ownerId);
      */
    });
  }

  openMobileMenu(): void {
    this.closeUserMenu();
    this.mobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  async openNotifications(): Promise<void> {
    this.notificationsOpen.set(true);
    const ownerId = this.profile()?.ownerId;
    if (!ownerId) return;
    await this.chat.markThreadReadByOwner(ownerId);
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
    this.chatText.set('');
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

  async sendMessageToAdmin(): Promise<void> {
    const owner = this.profile();
    const text = this.chatText().trim();
    if (!owner?.ownerId || !text) return;
    try {
      await this.chat.sendMessage({
        chatId: owner.ownerId,
        senderRole: 'owner',
        senderId: owner.ownerId,
        senderName: owner.name,
        text,
      });
      this.chatText.set('');
    } catch {
      // Keep shell resilient; avoid breaking navigation for transient chat errors.
    }
  }

  ngOnInit(): void {
    this.notifications.requestPermissionOnce();
    this.countdownTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    this.unsubThread?.();
    this.unsubUnread?.();
    this.unsubOwnerInApp?.();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (el?.closest('[data-user-menu-root]')) return;
    this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.closeMobileMenu();
    }
    if (this.userMenuOpen()) {
      this.closeUserMenu();
    }
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    this.closeUserMenu();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  /* Complaints disabled — restore when feature fixed
  async setComplaintEnabled(enabled: boolean): Promise<void> {
    const ownerId = this.profile()?.ownerId;
    if (!ownerId || this.complaintToggleBusy()) return;
    const profile = this.profile();
    if (!profile) return;
    this.complaintToggleBusy.set(true);
    this.auth.profile.set({ ...profile, complaintEnabled: enabled });
    try {
      await this.complaintApi.setComplaintEnabled(ownerId, enabled);
    } catch {
      this.auth.profile.set({ ...profile, complaintEnabled: Boolean(profile.complaintEnabled) });
    } finally {
      this.complaintToggleBusy.set(false);
    }
  }
  */
}
