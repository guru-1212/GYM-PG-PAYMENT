import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Member } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { ToastService } from '../../core/services/toast.service';
import {
  endOfToday,
  memberDueBucket,
  startOfToday,
  timestampToDate,
} from '../../core/utils/date.utils';

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  /** Optional query params (e.g. {action: 'add'}) handled by the target page. */
  queryParams?: Record<string, string>;
  tone: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
  /** Caller decides if the action is enabled for the current supervisor. */
  enabled: boolean;
  /** Short helper line under the label. */
  hint: string;
}

/**
 * Supervisor home screen.
 *
 * This is intentionally NOT a copy of `OwnerDashboardComponent`. Supervisors
 * have a different job — they care about today's floor, not last month's
 * revenue. This screen surfaces:
 *  - the small set of numbers a supervisor needs to act on RIGHT NOW
 *    (overdue / due-today / today's collections),
 *  - quick-action buttons that respect their per-account permissions,
 *  - a short "recent activity" feed so they can see what was just recorded.
 *
 * Anything financial that an owner-only screen would show (monthly trend,
 * plan expiry, analytics) is intentionally absent here AND blocked by
 * `noSupervisorGuard` in the route config.
 */
@Component({
  selector: 'app-supervisor-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  templateUrl: './supervisor-dashboard.component.html',
})
export class SupervisorDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(DataCacheService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly profile = this.auth.profile;
  readonly permissions = this.auth.supervisorPermissions;
  readonly loading = signal(true);

  readonly canViewMembers = computed(() => !!this.permissions()?.canViewMembers);
  readonly canEditMembers = computed(() => !!this.permissions()?.canEditMembers);
  readonly canViewPayments = computed(() => !!this.permissions()?.canViewPayments);
  readonly canRecordPayments = computed(() => !!this.permissions()?.canRecordPayments);
  readonly canViewRooms = computed(() => !!this.permissions()?.canViewRooms);
  readonly canShareOnboardingLink = computed(
    () => !!this.permissions()?.canShareOnboardingLink,
  );
  readonly isPg = computed(() => this.profile()?.businessType === 'pg');

  /** Live members from the shared cache, scoped to this supervisor's parent owner. */
  readonly members = this.cache.members;
  readonly payments = this.cache.payments;

  // --------------------------- derived stats ---------------------------

  readonly activeMembers = computed(() => this.members().filter((m) => m.status === 'active'));

  /** Members whose due date is strictly before today. */
  readonly overdueMembers = computed(() =>
    this.activeMembers().filter((m) => {
      const due = timestampToDate(m.dueDate);
      return memberDueBucket(due, true) === 'overdue';
    }),
  );

  /** Members whose due date is today. */
  readonly dueTodayMembers = computed(() =>
    this.activeMembers().filter((m) => {
      const due = timestampToDate(m.dueDate);
      return memberDueBucket(due, true) === 'dueToday';
    }),
  );

  /** Members carrying a non-zero balance (partial payments outstanding). */
  readonly partialMembers = computed(() =>
    this.activeMembers().filter((m) => (m.pendingAmount || 0) > 0),
  );

  /**
   * Today's collections — sum of payments whose `date` falls in today's
   * window. Visible only when supervisor has `canViewPayments` (matches the
   * Firestore rule that gates payment reads).
   */
  readonly todayPayments = computed(() => {
    if (!this.canViewPayments()) return [] as Payment[];
    const start = startOfToday().getTime();
    const end = endOfToday().getTime();
    return this.payments().filter((p) => {
      const t = timestampToDate(p.date)?.getTime();
      return t !== undefined && t >= start && t <= end;
    });
  });

  readonly todayCollectionsTotal = computed(() =>
    this.todayPayments().reduce((s, p) => s + (Number(p.amount) || 0), 0),
  );

  readonly recentPayments = computed(() => this.payments().slice(0, 6));

  // --------------------------- quick actions ---------------------------

  readonly quickActions = computed<QuickAction[]>(() => {
    const actions: QuickAction[] = [];

    if (this.canRecordPayments()) {
      actions.push({
        label: 'Collect payment',
        hint: "Mark today's cash received",
        icon: 'attach_money',
        route: '/supervisor/payments',
        queryParams: { action: 'collect' },
        tone: 'emerald',
        enabled: true,
      });
    }
    if (this.canEditMembers()) {
      actions.push({
        label: 'Add member',
        hint: 'Onboard a new member',
        icon: 'person_add',
        route: '/supervisor/members',
        queryParams: { action: 'add' },
        tone: 'indigo',
        enabled: true,
      });
    }
    if (this.canViewMembers()) {
      actions.push({
        label: 'View members',
        hint: 'Browse the member roster',
        icon: 'groups',
        route: '/supervisor/members',
        tone: 'slate',
        enabled: true,
      });
    }
    if (this.canViewPayments()) {
      actions.push({
        label: 'Payments log',
        hint: 'See recent collections',
        icon: 'receipt_long',
        route: '/supervisor/payments',
        tone: 'amber',
        enabled: true,
      });
    }
    if (this.isPg() && this.canViewRooms()) {
      actions.push({
        label: 'Rooms',
        hint: 'Bed availability',
        icon: 'hotel',
        route: '/supervisor/rooms',
        tone: 'slate',
        enabled: true,
      });
    }
    return actions;
  });

  /** Tailwind class lookup for the action-card tones — kept off-template for type safety. */
  toneClasses(tone: QuickAction['tone']): { bg: string; icon: string; ring: string } {
    switch (tone) {
      case 'emerald':
        return {
          bg: 'from-emerald-500 to-teal-600',
          icon: 'text-emerald-600 dark:text-emerald-300',
          ring: 'ring-emerald-100 dark:ring-emerald-900/40',
        };
      case 'indigo':
        return {
          bg: 'from-indigo-500 to-blue-600',
          icon: 'text-indigo-600 dark:text-indigo-300',
          ring: 'ring-indigo-100 dark:ring-indigo-900/40',
        };
      case 'amber':
        return {
          bg: 'from-amber-500 to-orange-500',
          icon: 'text-amber-600 dark:text-amber-300',
          ring: 'ring-amber-100 dark:ring-amber-900/40',
        };
      case 'rose':
        return {
          bg: 'from-rose-500 to-red-600',
          icon: 'text-rose-600 dark:text-rose-300',
          ring: 'ring-rose-100 dark:ring-rose-900/40',
        };
      default:
        return {
          bg: 'from-slate-600 to-slate-700',
          icon: 'text-slate-600 dark:text-slate-300',
          ring: 'ring-slate-200 dark:ring-slate-700/60',
        };
    }
  }

  paymentTime(p: Payment): string {
    const d = timestampToDate(p.date);
    if (!d) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  paymentMemberName(p: Payment): string {
    const found = this.members().find((m) => m.memberId === p.memberId);
    if (!found) return 'Member';
    return [found.firstName, found.lastName].filter(Boolean).join(' ').trim() || 'Member';
  }

  /** Pretty count for the "Recent activity" footer link. */
  readonly canSeeMoreActivity = computed(
    () => this.canViewPayments() && this.payments().length > this.recentPayments().length,
  );

  async ngOnInit(): Promise<void> {
    const ownerId = this.profile()?.ownerId;
    if (!ownerId) {
      this.loading.set(false);
      return;
    }
    try {
      // The cache scopes data to the parent owner via the projected
      // ownerId on the supervisor profile, which IS the parent owner's id
      // (see auth.service.ts ownerFromSupervisorSnapshot).
      await this.cache.loadAllData(ownerId);
    } catch (e) {
      console.error('[SupervisorDashboard] failed to load data', e);
      this.toast.error('Could not load dashboard data');
    } finally {
      this.loading.set(false);
    }
  }
}
