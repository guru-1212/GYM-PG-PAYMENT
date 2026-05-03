import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal, effect, untracked } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { Payment, PaymentMethod } from '../../core/models/payment.model';
import { PgFloorLayout, PgLayout } from '../../core/models/pg-layout.model';
import { Timestamp } from 'firebase/firestore';
import type { MemberJoinIntake } from '../../core/models/member-join-intake.model';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { MemberJoinIntakeService } from '../../core/services/member-join-intake.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { NotificationService } from '../../core/services/notification.service';
import { InAppNotificationService } from '../../core/services/in-app-notification.service';
import { MemberReceiptService } from '../../core/services/member-receipt.service';
import { SupervisorService } from '../../core/services/supervisor.service';
import { Supervisor } from '../../core/models/supervisor.model';
// Complaints disabled — restore when feature fixed
// import { ComplaintService } from '../../core/services/complaint.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { BedMapSeatGridComponent } from '../../shared/bed-map-seat-grid/bed-map-seat-grid.component';
import { ModalComponent } from '../../shared/modal.component';
import { MonthlyEarningsDetailedComponent } from '../../shared/monthly-earnings-detailed.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import {
  coerceFirestoreDate,
  calendarDaysBetween,
  dueRemainingOrOverdueLabel,
  dueUiStatus,
  endOfToday,
  isDateInCalendarMonth,
  memberDueBucket,
  overdueCalendarDays,
  startOfDay,
  startOfToday,
  timestampToDate,
} from '../../core/utils/date.utils';
import { formatPgRoomLabel } from '../../core/utils/pg-layout-display.utils';
import { sharingLabelForBeds } from '../../core/utils/pg-layout-display.utils';
import { memberImportSampleAoA, memberImportSampleCsv } from '../../core/utils/member-import-sample.util';
import { MEMBER_IMPORT_PROGRESS_MESSAGES } from '../../core/utils/member-import-progress.messages';
import { parsePgImportSeat, pgSheetSubscriptionError } from '../../core/utils/pg-sheet-import.utils';

// ── Sparkline (30-day earnings) dimensions ────────────────────────────────────
const SP_W = 320;
const SP_H = 64;
const SP_PAD = 6;

// ── Donut (collection health) helpers ─────────────────────────────────────────
const DONUT_CX = 60;
const DONUT_CY = 60;
const DONUT_OUTER = 52;
const DONUT_INNER = 36;

function ptOnCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(
  cx: number, cy: number, outerR: number, innerR: number,
  startDeg: number, endDeg: number,
): string {
  const gap = 1.6;
  const s = startDeg + gap, e = endDeg - gap;
  if (e - s <= 0) return '';
  const large = e - s > 180 ? 1 : 0;
  const o1 = ptOnCircle(cx, cy, outerR, s), o2 = ptOnCircle(cx, cy, outerR, e);
  const i1 = ptOnCircle(cx, cy, innerR, e), i2 = ptOnCircle(cx, cy, innerR, s);
  return `M${o1.x} ${o1.y} A${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}` +
    ` L${i1.x} ${i1.y} A${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}Z`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Date used to bucket a member's advance for monthly reports (newest field wins). */
function advanceAttributionDate(m: Member): Date | null {
  const a = m.advanceCollectedAt;
  if (a && typeof (a as Timestamp).toDate === 'function') {
    const d = (a as Timestamp).toDate();
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  const j = timestampToDate(m.joinDate);
  if (j) return j;
  return timestampToDate(m.createdAt) ?? coerceFirestoreDate(m.createdAt as unknown);
}

function compactRupee(v: number): string {
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + Math.round(v);
}

type DashboardDayGreetingSegment = 'morning' | 'afternoon' | 'evening' | 'night';

function dashboardDayGreetingSegment(now: Date): DashboardDayGreetingSegment {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function dashboardDayGreetingIcon(segment: DashboardDayGreetingSegment): string {
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

// ── Public types used by template ─────────────────────────────────────────────
export type ActionTab = 'overdue' | 'dueToday' | 'dueSoon' | 'partial';

export interface SparkPoint { x: number; y: number; total: number; date: Date; label: string; }
export interface DonutSegment {
  d: string;
  color: string;
  label: string;
  count: number;
  pct: number;
  /** Router target when clicked. */
  link: { path: string; query: Record<string, string> };
}
export interface PulseChip {
  id: string;
  tone: 'red' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate';
  icon: string;
  label: string;
  link?: { path: string; query?: Record<string, string> };
  action?: () => void;
}
export interface MiniBedRoom { roomNumber: number | string; occ: number; beds: number; }
export interface MiniBedFloor { label: string; floorNumber: number; rooms: MiniBedRoom[]; }
export interface QueueRow {
  m: Member;
  tag: ActionTab;
  /** Color tone token consumed by the template. */
  tone: 'red' | 'amber' | 'sky' | 'indigo';
  /** Right-side status line (e.g. "Overdue by 4 days"). */
  status: string;
  /** Optional secondary line (e.g. "Pending ₹1,200"). */
  secondary?: string;
}

/** One supervisor-collected payment, decorated for the modal table. */
export interface SupervisorCollectionRow {
  paymentId: string;
  supervisorId: string;
  supervisorName: string;
  memberId: string;
  memberName: string;
  amount: number;
  /** Bucket the row falls into. */
  kind: 'rent' | 'pending' | 'partial';
  kindLabel: string;
  method: 'cash' | 'upi' | 'card';
  methodLabel: string;
  pendingAfter: number;
  time: Date;
  timeLabel: string;
}

/** Day-wise group of supervisor collections for the modal. */
export interface SupervisorCollectionDay {
  dayKey: string;
  label: string;
  total: number;
  count: number;
  rows: SupervisorCollectionRow[];
}

/** One payment in today's collection detail modal (all sources: owner + supervisors). */
export interface TodayCollectionDetailRow {
  paymentId: string;
  memberId: string;
  memberName: string;
  amount: number;
  kind: 'rent' | 'pending' | 'partial';
  kindLabel: string;
  method: 'cash' | 'upi' | 'card';
  methodLabel: string;
  pendingAfter: number;
  time: Date;
  timeLabel: string;
  /** Who recorded the payment (owner sees "You" for self-recorded). */
  collectorLabel: string;
}

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, NgClass, RouterLink, ReactiveFormsModule, ModalComponent,  MonthlyEarningsDetailedComponent, BedMapSeatGridComponent, TranslatePipe],
  templateUrl: './owner-dashboard.component.html',
  styles: [`
    input[type='number']::-webkit-outer-spin-button,
    input[type='number']::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    input[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
    }
  `],
})
export class OwnerDashboardComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly cache = inject(DataCacheService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly receiptService = inject(MemberReceiptService);
  private readonly supervisorApi = inject(SupervisorService);
  private readonly notifications = inject(NotificationService);
  private readonly inAppNotifications = inject(InAppNotificationService);
  // private readonly complaintApi = inject(ComplaintService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly joinIntakeApi = inject(MemberJoinIntakeService);

  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly supervisors = signal<Supervisor[]>([]);
  /** Pre–add-member join forms awaiting owner completion (same source as Members page). */
  readonly pendingJoinRequests = signal<MemberJoinIntake[]>([]);
  private joinIntakeListUnsub: (() => void) | null = null;
  readonly supervisorCollectionsModalOpen = signal(false);
  /** Breakdown of every payment captured today (member, method, rent vs pending, recorded by). */
  readonly todayCollectionDetailModalOpen = signal(false);
  readonly loading = signal(true);
  readonly setupModalOpen = signal(false);
  readonly validationError = signal<string | null>(null);
  readonly bedMapModalOpen = signal(false);
  readonly importModalOpen = signal(false);
  readonly importRows = signal<ImportPreviewRow[]>([]);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importProgressPercent = signal(0);
  readonly importProgressMessage = signal('');
  private importProgressRotator: ReturnType<typeof setInterval> | null = null;
  readonly importDueDateForAll = this.fb.nonNullable.control(false);
  readonly importDueDate = this.fb.nonNullable.control('');
  readonly pgLayout = signal<PgLayout | null>(null);
  readonly showMonthEarnings = signal(false);
  readonly showMonthlyEarningsModal = signal(false);
  /** Advance (security deposit) — monthly breakdown modal. */
  readonly advanceCollectionModalOpen = signal(false);
  /** `YYYY-MM` when drilling into one month; null = month list. */
  readonly advanceCollectionMonthKey = signal<string | null>(null);
  readonly recentJoinersExpanded = signal(false);
  readonly memberDetailTarget = signal<Member | null>(null);
  readonly showScrollTopButton = signal(false);
  // readonly complaintToggleBusy = signal(false);
  readonly nowMs = signal(Date.now());
  private subscriptionCountdownTimer: ReturnType<typeof setInterval> | null = null;

  // Pagination signals
  readonly dueTodayPage = signal(1);
  readonly dueSoonPage = signal(1);
  readonly overduePage = signal(1);
  readonly itemsPerPage = 10;

  // ── Command-deck state ────────────────────────────────────────────────────
  /** Active tab in the unified Action Queue (Command Deck left panel). */
  readonly activeActionTab = signal<ActionTab>('overdue');
  /** Set true once user (or auto-init effect) has explicitly chosen a tab. */
  private actionTabPicked = false;
  /** Pagination for the unified action queue. */
  readonly actionQueuePage = signal(1);
  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');
  readonly isGym = computed(() => this.auth.profile()?.businessType === 'gym');
  /** Used to hide monthly-earnings (and other owner-only widgets) from supervisors. */
  readonly isSupervisor = computed(() => this.auth.profile()?.role === 'supervisor');
  /** True only when admin enabled WhatsApp for this owner; supervisors never see it. */
  readonly whatsappEnabled = computed(() => {
    const p = this.auth.profile();
    return !!p && p.role !== 'supervisor' && p.featureFlags?.whatsappEnabled === true;
  });
  readonly hasPgLayout = computed(() => {
    if ((this.pgLayout()?.floors?.length ?? 0) > 0) return true;
    return this.formToLayoutFloors().some((f) => f.rooms.length > 0);
  });
  /* Complaints disabled — restore when feature fixed
  readonly complaintEnabled = computed(() => Boolean(this.auth.profile()?.complaintEnabled));
  readonly complaintUrl = computed(() => {
    const ownerId = this.auth.profile()?.ownerId || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!ownerId || !origin) return '';
    return `${origin}/complaint/${ownerId}`;
  });
  readonly complaintQrUrl = computed(() => {
    const link = this.complaintUrl();
    if (!link) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
  });
  */

  readonly dueLabel = computed(() => {
    this.i18n.lang();
    return this.auth.profile()?.businessType === 'pg'
      ? this.i18n.t('fees.rentDue')
      : this.i18n.t('fees.planExpiry');
  });

  /**
   * Dashboard heading: prepends the owner's business / PG / gym name.
   * Example: "Aurora Mens PG Dashboard" (or "Dashboard" if no name set).
   */
  readonly dashboardTitle = computed(() => {
    this.i18n.lang();
    const base = this.i18n.t('dashboard.title');
    const name = this.auth.profile()?.businessName?.trim();
    return name ? `${name} ${base}` : base;
  });

  /** Web / tablet: greeting beside title (hidden below sm to avoid duplicating the shell mobile bar). */
  readonly dashboardHeaderGreeting = computed(() => {
    this.nowMs();
    this.i18n.lang();
    const seg = dashboardDayGreetingSegment(new Date());
    const key =
      seg === 'morning'
        ? 'shell.greetingMorning'
        : seg === 'afternoon'
          ? 'shell.greetingAfternoon'
          : seg === 'evening'
            ? 'shell.greetingEvening'
            : 'shell.greetingNight';
    const p = this.auth.profile();
    const displayName =
      p?.name?.trim() || p?.businessName?.trim() || p?.email?.split('@')[0]?.trim() || '';
    return { text: this.i18n.t(key), icon: dashboardDayGreetingIcon(seg), displayName };
  });

  readonly subscriptionDaysRemaining = computed(() => {
    const profile = this.auth.profile();
    if (!profile?.planEndDate) return null;
    const planEndDate = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    const daysRemaining = calendarDaysBetween(startOfToday(), planEndDate);
    return Math.max(0, daysRemaining);
  });
  readonly subscriptionCountdown = computed(() => {
    this.nowMs();
    const profile = this.auth.profile();
    if (!profile?.planEndDate) return null;
    const end = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    const diffMs = end.getTime() - Date.now();
    if (diffMs <= 0) {
      return { expired: true, text: 'Expired', days: 0 };
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
      text: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    };
  });

  readonly totalMembers = computed(() => this.members().filter((m) => m.status === 'active').length);

  /**
   * Today's collection: sum of all payments stamped with today's date for the
   * signed-in owner. Lightweight version of `monthEarnings` scoped to a single
   * day. Returns 0 while data is still loading.
   */
  readonly todayCollection = computed(() => {
    if (this.loading()) return 0;
    const oid = this.auth.profile()?.ownerId;
    const today = new Date();
    let sum = 0;
    for (const p of this.payments()) {
      if (oid && p.ownerId !== oid) continue;
      const pd = this.convertTimestampToDate(p.date);
      if (!pd) continue;
      if (isSameDay(pd, today)) {
        sum += Number(p.amount) || 0;
      }
    }
    return sum;
  });

  /** Number of payment transactions captured today (used for the card's helper line). */
  readonly todayCollectionCount = computed(() => {
    if (this.loading()) return 0;
    const oid = this.auth.profile()?.ownerId;
    const today = new Date();
    let count = 0;
    for (const p of this.payments()) {
      if (oid && p.ownerId !== oid) continue;
      const pd = this.convertTimestampToDate(p.date);
      if (!pd) continue;
      if (isSameDay(pd, today)) count += 1;
    }
    return count;
  });

  /**
   * Today's payments as rows for the detail modal — same scope as `todayCollection` /
   * `todayCollectionCount`, ordered newest first.
   */
  readonly todayCollectionDetailRows = computed<TodayCollectionDetailRow[]>(() => {
    if (this.loading()) return [];
    const oid = this.auth.profile()?.ownerId;
    const today = new Date();
    const memberById = new Map<string, Member>();
    for (const m of this.members()) memberById.set(m.memberId, m);
    const supById = new Map<string, Supervisor>();
    for (const s of this.supervisors()) supById.set(s.supervisorId, s);

    const rows: TodayCollectionDetailRow[] = [];

    for (const p of this.payments()) {
      if (oid && p.ownerId !== oid) continue;
      const pd = this.convertTimestampToDate(p.date);
      if (!pd || !isSameDay(pd, today)) continue;

      const member = memberById.get(p.memberId);
      const memberName = member
        ? `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown member'
        : 'Unknown member';

      const isPartial = Boolean(p.isPartialPayment);
      const pendingAfter = Math.max(0, Number(p.pendingAmount) || 0);
      const kind: TodayCollectionDetailRow['kind'] = isPartial
        ? 'partial'
        : pendingAfter > 0
          ? 'pending'
          : 'rent';
      const kindLabel = isPartial
        ? 'Partial payment'
        : pendingAfter > 0
          ? 'Pending balance'
          : 'Rent / Plan';

      const method = (p.method || 'cash') as TodayCollectionDetailRow['method'];
      const methodLabel = method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Cash';

      let collectorLabel: string;
      const role = p.recordedByRole;
      if (role === 'supervisor') {
        const sup = p.recordedBy ? supById.get(p.recordedBy) : undefined;
        collectorLabel = p.recordedByName?.trim() || sup?.name || 'Supervisor';
      } else if (role === 'owner') {
        collectorLabel = 'You';
      } else if (role === 'admin') {
        collectorLabel = p.recordedByName?.trim() || 'Admin';
      } else if (p.recordedBy && supById.has(p.recordedBy)) {
        const sup = supById.get(p.recordedBy)!;
        collectorLabel = p.recordedByName?.trim() || sup.name || 'Supervisor';
      } else {
        collectorLabel = 'You';
      }

      rows.push({
        paymentId: p.paymentId,
        memberId: p.memberId,
        memberName,
        amount: Number(p.amount) || 0,
        kind,
        kindLabel,
        method,
        methodLabel,
        pendingAfter,
        time: pd,
        timeLabel: pd.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        collectorLabel,
      });
    }

    rows.sort((a, b) => b.time.getTime() - a.time.getTime());
    return rows;
  });

  trackTodayCollectionRow(_idx: number, row: TodayCollectionDetailRow): string {
    return row.paymentId;
  }

  openTodayCollectionDetail(): void {
    this.todayCollectionDetailModalOpen.set(true);
  }

  closeTodayCollectionDetail(): void {
    this.todayCollectionDetailModalOpen.set(false);
  }

  // ── Supervisor collections (only when owner has supervisors) ───────────────

  /** True when the signed-in owner has at least one supervisor account. */
  readonly hasSupervisors = computed(() => this.supervisors().length > 0);

  /** True when the supervisor-collections card should render. */
  readonly canSeeSupervisorCollections = computed(
    () => !this.isSupervisor() && this.hasSupervisors(),
  );

  /** All payments stamped as recorded by a supervisor for the current owner. */
  private readonly supervisorPayments = computed(() => {
    const oid = this.auth.profile()?.ownerId;
    if (!oid) return [];
    return this.payments().filter(
      (p) => p.ownerId === oid && p.recordedByRole === 'supervisor',
    );
  });

  /** Today's total amount collected by all supervisors combined. */
  readonly supervisorTodayTotal = computed(() => {
    if (this.loading()) return 0;
    const today = new Date();
    let sum = 0;
    for (const p of this.supervisorPayments()) {
      const pd = this.convertTimestampToDate(p.date);
      if (!pd) continue;
      if (isSameDay(pd, today)) sum += Number(p.amount) || 0;
    }
    return sum;
  });

  /** Number of supervisor-collected transactions today. */
  readonly supervisorTodayCount = computed(() => {
    if (this.loading()) return 0;
    const today = new Date();
    let count = 0;
    for (const p of this.supervisorPayments()) {
      const pd = this.convertTimestampToDate(p.date);
      if (!pd) continue;
      if (isSameDay(pd, today)) count += 1;
    }
    return count;
  });

  /**
   * Day-grouped supervisor collections for the detail modal.
   * Newest day first; rows within a day ordered newest first by time of payment.
   */
  readonly supervisorCollectionGroups = computed<SupervisorCollectionDay[]>(() => {
    const memberById = new Map<string, Member>();
    for (const m of this.members()) memberById.set(m.memberId, m);
    const supById = new Map<string, Supervisor>();
    for (const s of this.supervisors()) supById.set(s.supervisorId, s);

    const groups = new Map<string, SupervisorCollectionDay>();
    for (const p of this.supervisorPayments()) {
      const date = this.convertTimestampToDate(p.date);
      if (!date) continue;
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      let group = groups.get(dayKey);
      if (!group) {
        group = {
          dayKey,
          label: this.supervisorDayLabel(date),
          total: 0,
          count: 0,
          rows: [],
        };
        groups.set(dayKey, group);
      }

      const member = memberById.get(p.memberId);
      const memberName = member
        ? `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown member'
        : 'Unknown member';
      const sup = p.recordedBy ? supById.get(p.recordedBy) : undefined;
      const supervisorName =
        p.recordedByName?.trim() || sup?.name || 'Supervisor';
      const isPartial = Boolean(p.isPartialPayment);
      const pendingAfter = Math.max(0, Number(p.pendingAmount) || 0);
      const kind: SupervisorCollectionRow['kind'] = isPartial
        ? 'partial'
        : pendingAfter > 0
          ? 'pending'
          : 'rent';
      const kindLabel = isPartial
        ? 'Partial payment'
        : pendingAfter > 0
          ? 'Pending balance'
          : 'Rent / Plan';
      const method = (p.method || 'cash') as SupervisorCollectionRow['method'];
      const methodLabel = method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Cash';
      const amount = Number(p.amount) || 0;

      group.rows.push({
        paymentId: p.paymentId,
        supervisorId: p.recordedBy || '',
        supervisorName,
        memberId: p.memberId,
        memberName,
        amount,
        kind,
        kindLabel,
        method,
        methodLabel,
        pendingAfter,
        time: date,
        timeLabel: date.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      });
      group.total += amount;
      group.count += 1;
    }

    const list = [...groups.values()];
    list.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    for (const g of list) {
      g.rows.sort((a, b) => b.time.getTime() - a.time.getTime());
    }
    return list;
  });

  /** Lifetime total collected by supervisors — shown in the modal header. */
  readonly supervisorAllTimeTotal = computed(() => {
    let sum = 0;
    for (const p of this.supervisorPayments()) sum += Number(p.amount) || 0;
    return sum;
  });

  /** Per-supervisor today summary used in the modal header. */
  readonly supervisorTodayBreakdown = computed(() => {
    const today = new Date();
    const by = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const p of this.supervisorPayments()) {
      const pd = this.convertTimestampToDate(p.date);
      if (!pd || !isSameDay(pd, today)) continue;
      const id = p.recordedBy || 'unknown';
      const name = p.recordedByName?.trim() || this.supervisors().find((s) => s.supervisorId === id)?.name || 'Supervisor';
      const cur = by.get(id) ?? { id, name, total: 0, count: 0 };
      cur.total += Number(p.amount) || 0;
      cur.count += 1;
      by.set(id, cur);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  });

  private supervisorDayLabel(d: Date): string {
    const today = startOfToday();
    const day = startOfDay(d);
    const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  trackSupervisorDay(_idx: number, group: SupervisorCollectionDay): string {
    return group.dayKey;
  }

  trackSupervisorRow(_idx: number, row: SupervisorCollectionRow): string {
    return row.paymentId;
  }

  /** Color tone classes for the payment-kind badge in the modal. */
  collectionKindClasses(kind: SupervisorCollectionRow['kind']): string {
    switch (kind) {
      case 'rent':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50';
      case 'partial':
        return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50';
      case 'pending':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/50';
      default:
        return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
    }
  }

  /** Color tone classes for the payment-method badge in the modal. */
  methodChipClasses(method: SupervisorCollectionRow['method']): string {
    switch (method) {
      case 'cash':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50';
      case 'upi':
        return 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/50';
      case 'card':
        return 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/50';
      default:
        return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
    }
  }

  /** Material icon name per payment method. */
  methodIcon(method: SupervisorCollectionRow['method']): string {
    switch (method) {
      case 'cash':
        return 'payments';
      case 'upi':
        return 'qr_code_2';
      case 'card':
        return 'credit_card';
      default:
        return 'payments';
    }
  }

  openSupervisorCollections(): void {
    this.supervisorCollectionsModalOpen.set(true);
  }

  closeSupervisorCollections(): void {
    this.supervisorCollectionsModalOpen.set(false);
  }

  /**
   * Monthly earnings: Sum of all payments in the current calendar month
   * 1. Waits for data to be loaded
   * 2. Converts Firestore Timestamps to JS Date using toDate()
   * 3. Filters by current month AND year
   * 4. Matches ownerId with logged-in user
   * 5. Includes debug logging
   */
  readonly monthEarnings = computed(() => {
    if (this.loading()) return 0; // Wait for data to load

    const now = new Date();
    const currentMonth = now.getMonth();      // 0-11
    const currentYear = now.getFullYear();
    const loggedInOwnerId = this.auth.profile()?.ownerId;
    const payments = this.payments();

    const monthlySum = payments.reduce((sum, payment) => {
      // 1. Match ownerId with logged-in user
      if (payment.ownerId !== loggedInOwnerId) {
        return sum;
      }

      // 2. Convert Firestore Timestamp to JS Date using toDate()
      const paymentDate = this.convertTimestampToDate(payment.date);

      if (!paymentDate) return sum;

      // 3. Filter by current month AND year
      const paymentMonth = paymentDate.getMonth();
      const paymentYear = paymentDate.getFullYear();

      if (paymentMonth !== currentMonth || paymentYear !== currentYear) {
        return sum;
      }

      const amount = Number(payment.amount) || 0;
      return sum + amount;
    }, 0);
    return monthlySum;
  });

  /** Sum of advance currently marked held (not returned). */
  readonly totalAdvanceHeld = computed(() =>
    this.members().reduce((sum, m) => {
      if ((m.advanceStatus ?? 'held') === 'returned') return sum;
      return sum + Math.max(0, Number(m.advancePaid) || 0);
    }, 0),
  );

  /** Advance amounts attributed to the current calendar month (member + date). */
  readonly advanceAttributedThisMonth = computed(() => {
    if (this.loading()) return 0;
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    let sum = 0;
    for (const m of this.members()) {
      const amt = Math.max(0, Number(m.advancePaid) || 0);
      if (amt <= 0) continue;
      const d = advanceAttributionDate(m);
      if (!d || d.getFullYear() !== y || d.getMonth() !== mo) continue;
      sum += amt;
    }
    return sum;
  });

  /** Month keys (desc) with totals for the advance modal landing view. */
  readonly advanceCollectionByMonth = computed(() => {
    this.i18n.lang();
    const map = new Map<string, { total: number; count: number }>();
    for (const m of this.members()) {
      const amt = Math.max(0, Number(m.advancePaid) || 0);
      if (amt <= 0) continue;
      const d = advanceAttributionDate(m);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += amt;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, total: v.total, count: v.count }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  });

  readonly advanceRowsForSelectedMonth = computed(() => {
    const key = this.advanceCollectionMonthKey();
    if (!key) return [];
    return this.members()
      .filter((m) => {
        const amt = Math.max(0, Number(m.advancePaid) || 0);
        if (amt <= 0) return false;
        const d = advanceAttributionDate(m);
        if (!d) return false;
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return k === key;
      })
      .map((m) => ({
        memberId: m.memberId,
        memberName: `${m.firstName || ''} ${m.lastName || ''}`.trim() || '—',
        mobile: (m.mobile || '').trim(),
        amount: Math.max(0, Number(m.advancePaid) || 0),
        attributedDate: advanceAttributionDate(m)!,
        held: (m.advanceStatus ?? 'held') !== 'returned',
      }))
      .sort((a, b) => b.attributedDate.getTime() - a.attributedDate.getTime());
  });

  advanceMonthLabel(key: string): string {
    const [y, mo] = key.split('-').map(Number);
    if (!y || !mo) return key;
    const lang = this.i18n.lang() === 'te' ? 'te-IN' : 'en-IN';
    return new Date(y, mo - 1, 1).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
  }

  openAdvanceCollectionModal(): void {
    this.advanceCollectionMonthKey.set(null);
    this.advanceCollectionModalOpen.set(true);
  }

  closeAdvanceCollectionModal(): void {
    this.advanceCollectionModalOpen.set(false);
    this.advanceCollectionMonthKey.set(null);
  }

  readonly pendingCount = computed(() => {
    const end = endOfToday();
    return this.members().filter(
      (m) => m.status === 'active' && timestampToDate(m.dueDate) && timestampToDate(m.dueDate)! <= end,
    ).length;
  });

  readonly dueTodayList = computed(() => {
    const today = new Date();
    return this.members().filter((m) => {
      const d = timestampToDate(m.dueDate);
      if (!d || m.status !== 'active') return false;
      return dueUiStatus(d) === 'dueToday';
    });
  });

  readonly overdueList = computed(() => {
    return this.members().filter((m) => {
      const d = timestampToDate(m.dueDate);
      if (!d || m.status !== 'active') return false;
      return dueUiStatus(d) === 'overdue';
    });
  });

  readonly dueSoonList = computed(() => {
    const today = startOfToday();
    return this.members().filter((m) => {
      if (m.status !== 'active') return false;
      const due = timestampToDate(m.dueDate);
      if (!due) return false;
      const daysLeft = calendarDaysBetween(today, startOfDay(due));
      return daysLeft >= 0 && daysLeft <= 5;
    });
  });

  // Paginated lists
  readonly dueTodayPagedList = computed(() => {
    const list = this.dueTodayList();
    const page = this.dueTodayPage();
    const start = (page - 1) * this.itemsPerPage;
    return list.slice(start, start + this.itemsPerPage);
  });

  readonly dueTodayPages = computed(() => Math.ceil(this.dueTodayList().length / this.itemsPerPage));

  readonly dueSoonPagedList = computed(() => {
    const list = this.dueSoonList();
    const page = this.dueSoonPage();
    const start = (page - 1) * this.itemsPerPage;
    return list.slice(start, start + this.itemsPerPage);
  });

  readonly dueSoonPages = computed(() => Math.ceil(this.dueSoonList().length / this.itemsPerPage));

  readonly overduePagedList = computed(() => {
    const list = this.overdueList();
    const page = this.overduePage();
    const start = (page - 1) * this.itemsPerPage;
    return list.slice(start, start + this.itemsPerPage);
  });

  readonly overduePages = computed(() => Math.ceil(this.overdueList().length / this.itemsPerPage));

  readonly partialPendingList = computed(() =>
    this.members().filter((m) => m.status === 'active' && (Number(m.pendingAmount) || 0) > 0),
  );

  /** Active members with a submitted self-onboarding profile awaiting owner approval. */
  readonly reviewPendingCount = computed(
    () => this.members().filter((m) => m.status === 'active' && Boolean(m.pendingSelfOnboarding)).length,
  );

  readonly joinIntakeDashboardVisible = computed(
    () => this.auth.hasPermission('canAddMembers') && this.pendingJoinRequests().length > 0,
  );

  readonly joinIntakePendingCount = computed(() => this.pendingJoinRequests().length);

  goMembersWithJoinToken(token: string): void {
    void this.router.navigate(['/members'], { queryParams: { joinToken: token } });
  }

  dueStatusLabel(m: Member): string {
    const due = timestampToDate(m.dueDate);
    return dueRemainingOrOverdueLabel(due, m.status === 'active');
  }

  /** Members who joined from (today − 10 days) through end of today — gym and PG. */
  readonly recentJoiners = computed(() => {
    const today = new Date();
    const windowStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10));
    const windowEnd = endOfToday();
    return [...this.members()]
      .filter((m) => {
        const jd = coerceFirestoreDate(m.joinDate as unknown) ?? timestampToDate(m.joinDate);
        return jd != null && jd >= windowStart && jd <= windowEnd;
      })
      .sort((a, b) => {
        const ta =
          coerceFirestoreDate(a.joinDate as unknown)?.getTime() ?? timestampToDate(a.joinDate)?.getTime() ?? 0;
        const tb =
          coerceFirestoreDate(b.joinDate as unknown)?.getTime() ?? timestampToDate(b.joinDate)?.getTime() ?? 0;
        return tb - ta;
      });
  });

  readonly memberDetailPayments = computed(() => {
    const m = this.memberDetailTarget();
    if (!m) return [];
    return this.payments().filter((p) => p.memberId === m.memberId);
  });

  readonly totalBeds = computed(() =>
    (this.pgLayout()?.floors ?? []).reduce(
      (sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + (Number(room.beds) || 0), 0),
      0,
    ),
  );

  readonly totalRooms = computed(() =>
    (this.pgLayout()?.floors ?? []).reduce((sum, floor) => sum + floor.rooms.length, 0),
  );

  readonly emptyBeds = computed(() => Math.max(0, this.totalBeds() - this.occupiedBedKeys().size));
  readonly occupiedBedKeys = computed(() => {
    const set = new Set<string>();
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const key = this.bedKey(m.floorNumber, m.roomNumber, m.bedNumber);
      if (key) set.add(key);
    }
    return set;
  });
  readonly importValidCount = computed(() => this.importRows().filter((r) => r.valid).length);
  readonly importInvalidCount = computed(() => this.importRows().filter((r) => !r.valid).length);

  readonly setupForm = this.fb.nonNullable.group({
    floorCount: [1, [Validators.required, Validators.min(1)]],
    floors: this.fb.array([]),
  });

  private currentOwnerId: string | null = null;
  private dueAlertDebounce: ReturnType<typeof setTimeout> | null = null;
  private supervisorsUnsub: (() => void) | null = null;

  // ── Command Deck: unified action queue (Tabs: Overdue / Due today / Due soon / Partial)
  readonly actionQueueCounts = computed(() => ({
    overdue: this.overdueList().length,
    dueToday: this.dueTodayList().length,
    dueSoon: this.dueSoonList().length,
    partial: this.partialPendingList().length,
  }));

  readonly actionQueueAll = computed<QueueRow[]>(() => {
    const tab = this.activeActionTab();
    switch (tab) {
      case 'overdue':
        return this.overdueList().map((m) => ({
          m,
          tag: 'overdue' as ActionTab,
          tone: 'red' as const,
          status: this.overdueByLine(m),
          secondary: this.memberDueDate(m)
            ? `Due ${this.memberDueDate(m)!.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
            : undefined,
        }));
      case 'dueToday':
        return this.dueTodayList().map((m) => ({
          m,
          tag: 'dueToday' as ActionTab,
          tone: 'amber' as const,
          status: 'Due today',
          secondary: m.amount ? `₹${Number(m.amount).toLocaleString('en-IN')}` : undefined,
        }));
      case 'dueSoon':
        return this.dueSoonList().map((m) => ({
          m,
          tag: 'dueSoon' as ActionTab,
          tone: 'sky' as const,
          status: this.dueStatusLabel(m),
          secondary: m.amount ? `₹${Number(m.amount).toLocaleString('en-IN')}` : undefined,
        }));
      case 'partial':
        return this.partialPendingList().map((m) => ({
          m,
          tag: 'partial' as ActionTab,
          tone: 'indigo' as const,
          status: `Pending ₹${(Number(m.pendingAmount) || 0).toLocaleString('en-IN')}`,
          secondary: this.memberDueDate(m)
            ? `Due ${this.memberDueDate(m)!.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
            : undefined,
        }));
    }
  });

  readonly actionQueuePages = computed(() =>
    Math.max(1, Math.ceil(this.actionQueueAll().length / this.itemsPerPage)),
  );

  readonly actionQueuePaged = computed(() => {
    const list = this.actionQueueAll();
    const page = Math.min(this.actionQueuePage(), this.actionQueuePages());
    const start = (page - 1) * this.itemsPerPage;
    return list.slice(start, start + this.itemsPerPage);
  });

  // ── Sparkline: last 30-day daily collections ───────────────────────────────
  readonly dailyEarnings30 = computed(() => {
    const today = startOfToday();
    const days: { date: Date; total: number }[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12);
      days.push({ date: d, total: 0 });
    }
    const oid = this.auth.profile()?.ownerId;
    for (const p of this.payments()) {
      if (oid && p.ownerId !== oid) continue;
      const pd = this.convertTimestampToDate(p.date);
      if (!pd) continue;
      for (let i = 0; i < days.length; i += 1) {
        if (isSameDay(days[i].date, pd)) {
          days[i].total += Number(p.amount) || 0;
          break;
        }
      }
    }
    return days;
  });

  readonly sparkline = computed(() => {
    const data = this.dailyEarnings30();
    const max = Math.max(1, ...data.map((d) => d.total));
    const dx = data.length > 1 ? (SP_W - 2 * SP_PAD) / (data.length - 1) : 0;
    const points: SparkPoint[] = data.map((d, i) => ({
      x: SP_PAD + i * dx,
      y: SP_PAD + (SP_H - 2 * SP_PAD) * (1 - d.total / max),
      total: d.total,
      date: d.date,
      label: d.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    }));
    const line = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`)).join('');
    const area =
      points.length === 0
        ? ''
        : `${line} L${points[points.length - 1].x},${SP_H - SP_PAD} L${points[0].x},${SP_H - SP_PAD}Z`;
    const totalSum = data.reduce((s, d) => s + d.total, 0);
    const todayTotal = data[data.length - 1]?.total ?? 0;
    const prevTotal = data[data.length - 2]?.total ?? 0;
    const trendPct = prevTotal > 0 ? ((todayTotal - prevTotal) / prevTotal) * 100 : 0;
    return { width: SP_W, height: SP_H, points, line, area, max, totalSum, todayTotal, trendPct };
  });

  // ── Donut: collection health ───────────────────────────────────────────────
  readonly collectionDonut = computed<DonutSegment[]>(() => {
    const active = this.members().filter((m) => m.status === 'active');
    const total = active.length;
    if (total === 0) return [];
    const overdueIds = new Set(this.overdueList().map((m) => m.memberId));
    const dueTodayIds = new Set(this.dueTodayList().map((m) => m.memberId));
    const partialIds = new Set(this.partialPendingList().map((m) => m.memberId));
    const onTrackCount = active.filter(
      (m) => !overdueIds.has(m.memberId) && !dueTodayIds.has(m.memberId) && !partialIds.has(m.memberId),
    ).length;
    type DonutDatum = { label: string; count: number; color: string; link: { path: string; query: Record<string, string> } };
    const data: DonutDatum[] = [
      {
        label: 'On track',
        count: onTrackCount,
        color: '#10b981',
        link: { path: '/members', query: { pay: 'paid' } as Record<string, string> },
      },
      {
        label: 'Partial',
        count: partialIds.size,
        color: '#6366f1',
        link: { path: '/members', query: { pay: 'partial' } as Record<string, string> },
      },
      {
        label: 'Due today',
        count: dueTodayIds.size,
        color: '#f59e0b',
        link: { path: '/members', query: { due: 'dueToday' } as Record<string, string> },
      },
      {
        label: 'Overdue',
        count: overdueIds.size,
        color: '#ef4444',
        link: { path: '/members', query: { pay: 'pending', due: 'overdue' } as Record<string, string> },
      },
    ].filter((d) => d.count > 0);
    let start = -90;
    return data.map((d) => {
      const sweep = (d.count / total) * 360;
      const seg: DonutSegment = {
        ...d,
        pct: d.count / total,
        d: donutArcPath(DONUT_CX, DONUT_CY, DONUT_OUTER, DONUT_INNER, start, start + sweep),
      };
      start += sweep;
      return seg;
    });
  });

  readonly donutCenterValue = computed(() => this.totalMembers());

  // ── Mini bed heatmap (PG only) ─────────────────────────────────────────────
  readonly miniBedFloors = computed<MiniBedFloor[]>(() => {
    const layout = this.pgLayout();
    if (!layout?.floors?.length) return [];
    const occupied = this.occupiedBedKeys();
    return layout.floors.map((f) => ({
      label: f.floorNumber === 0 ? 'GF' : `F${f.floorNumber}`,
      floorNumber: f.floorNumber,
      rooms: f.rooms.map((r) => {
        let occ = 0;
        const beds = Math.max(0, Number(r.beds) || 0);
        for (let b = 1; b <= beds; b += 1) {
          if (occupied.has(`${f.floorNumber}-${r.roomNumber}-${b}`)) occ += 1;
        }
        return { roomNumber: r.roomNumber, occ, beds };
      }),
    }));
  });

  bedCellTone(occ: number, beds: number): 'free' | 'partial' | 'full' | 'empty' {
    if (beds <= 0) return 'empty';
    if (occ <= 0) return 'free';
    if (occ >= beds) return 'full';
    return 'partial';
  }

  // ── Pulse strip chips (clickable, drill-down) ──────────────────────────────
  readonly pulseChips = computed<PulseChip[]>(() => {
    const overdueN = this.overdueList().length;
    const dueTodayN = this.dueTodayList().length;
    const reviewN = this.reviewPendingCount();
    const todayEarn = this.dailyEarnings30()[29]?.total ?? 0;
    const chips: PulseChip[] = [];

    chips.push({
      id: 'overdue',
      tone: overdueN > 0 ? 'red' : 'emerald',
      icon: overdueN > 0 ? 'warning' : 'check_circle',
      label: overdueN > 0 ? `${overdueN} overdue` : 'No overdue',
      link: overdueN > 0 ? { path: '/members', query: { pay: 'pending', due: 'overdue' } } : undefined,
      action: overdueN > 0 ? () => this.setActionTab('overdue') : undefined,
    });

    chips.push({
      id: 'dueToday',
      tone: dueTodayN > 0 ? 'amber' : 'slate',
      icon: 'today',
      label: dueTodayN > 0 ? `${dueTodayN} due today` : 'Nothing today',
      link: dueTodayN > 0 ? { path: '/members', query: { due: 'dueToday' } } : undefined,
      action: dueTodayN > 0 ? () => this.setActionTab('dueToday') : undefined,
    });

    if (!this.isSupervisor()) {
      chips.push({
        id: 'today-earn',
        tone: 'emerald',
        icon: 'payments',
        label: `${compactRupee(todayEarn)} today`,
        action: () => this.showMonthlyEarningsModal.set(true),
      });
    }

    if (this.isPg() && this.hasPgLayout()) {
      const empty = this.emptyBeds();
      chips.push({
        id: 'beds',
        tone: empty > 0 ? 'sky' : 'red',
        icon: 'bed',
        label: empty > 0 ? `${empty} beds free` : 'No beds free',
        action: () => this.openBedMap(),
      });
    }

    if (reviewN > 0) {
      chips.push({
        id: 'review',
        tone: 'violet',
        icon: 'how_to_reg',
        label: `${reviewN} to review`,
        link: { path: '/members', query: { onboarding: 'review' } },
      });
    }

    const joinN = this.pendingJoinRequests().length;
    this.i18n.lang();
    if (joinN > 0 && this.auth.hasPermission('canAddMembers')) {
      chips.push({
        id: 'join-intake',
        tone: 'emerald',
        icon: 'qr_code_2',
        label: this.i18n.t('dashboard.joinIntakePulse', { count: joinN }),
        link: { path: '/members' },
      });
    }

    return chips;
  });

  // ── Inline row & toolbar actions ──────────────────────────────────────────
  setActionTab(tab: ActionTab): void {
    this.actionTabPicked = true;
    this.activeActionTab.set(tab);
    this.actionQueuePage.set(1);
  }

  setActionQueuePage(page: number): void {
    if (page >= 1 && page <= this.actionQueuePages()) {
      this.actionQueuePage.set(page);
    }
  }

  getActionQueuePageNumbers(): number[] {
    return Array.from({ length: this.actionQueuePages() }, (_, i) => i + 1);
  }

  callMember(m: Member): void {
    const num = (m.mobile || '').replace(/\D/g, '');
    if (num.length !== 10) {
      this.toast.error('No valid mobile number on file');
      return;
    }
    window.location.href = `tel:+91${num}`;
  }

  whatsappReminder(m: Member): void {
    const num = (m.mobile || '').replace(/\D/g, '');
    if (num.length !== 10) {
      this.toast.error('Valid 10-digit mobile required');
      return;
    }
    const owner = this.auth.profile()?.businessName?.trim() || this.auth.profile()?.name || 'PayBook';
    const due = this.memberDueDate(m);
    const dueStr = due ? due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const amt = Number(m.amount) || 0;
    const pending = Number(m.pendingAmount) || 0;
    const lines = [
      `Hi ${m.firstName}${m.lastName ? ' ' + m.lastName : ''},`,
      '',
      `This is a friendly reminder from ${owner}.`,
    ];
    if (pending > 0) {
      lines.push(`You have a pending balance of ₹${pending.toLocaleString('en-IN')}.`);
    } else if (dueStr) {
      lines.push(`Your payment of ₹${amt.toLocaleString('en-IN')} is due on ${dueStr}.`);
    } else {
      lines.push('Your payment is due. Please clear it at the earliest.');
    }
    lines.push('', 'Thanks,', owner);
    const text = encodeURIComponent(lines.join('\n'));
    const opened = window.open(`https://wa.me/91${num}?text=${text}`, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(`https://wa.me/91${num}?text=${text}`);
    }
  }

  remindAllOverdue(): void {
    const list = this.overdueList().filter((m) => (m.mobile || '').replace(/\D/g, '').length === 10);
    if (list.length === 0) {
      this.toast.error('No overdue members with a valid mobile number');
      return;
    }
    this.whatsappReminder(list[0]);
    if (list.length > 1) {
      this.toast.success(
        `Opened reminder 1 of ${list.length}. Use the Action Queue to send the rest one by one.`,
      );
    }
  }

  goToActionTab(tab: ActionTab): void {
    this.setActionTab(tab);
    setTimeout(() => {
      document.getElementById('action-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  goToPulseChip(chip: PulseChip): void {
    if (chip.action) chip.action();
    if (chip.link) {
      this.router.navigate([chip.link.path], { queryParams: chip.link.query });
    }
  }

  goToDonutSegment(seg: DonutSegment): void {
    this.router.navigate([seg.link.path], { queryParams: seg.link.query });
  }

  goToSparkline(): void {
    if (this.isSupervisor()) return;
    this.showMonthlyEarningsModal.set(true);
  }

  formatCompactRupee(value: number): string {
    return compactRupee(value);
  }

  /** First name initials for avatar bubble. */
  memberInitials(m: Member): string {
    const f = (m.firstName || '').trim();
    const l = (m.lastName || '').trim();
    const a = f ? f[0] : '';
    const b = l ? l[0] : f.length > 1 ? f[1] : '';
    return (a + b).toUpperCase() || '?';
  }

  trackByMemberId(_: number, row: { m: Member }): string {
    return row.m.memberId;
  }

  trackByChipId(_: number, chip: PulseChip): string {
    return chip.id;
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  trackByFloorLabel(_: number, item: MiniBedFloor): string {
    return item.label;
  }

  trackByRoomNumber(_: number, item: MiniBedRoom): string {
    return String(item.roomNumber);
  }

  constructor() {
    // Sync cache signals to component signals
    effect(() => {
      this.members.set(this.cache.members());
    });

    effect(() => {
      this.payments.set(this.cache.payments());
    });

    effect(() => {
      this.pgLayout.set(this.cache.layout());
    });

    effect(() => {
      // Stop loading when all data is loaded
      const anyLoading = Object.values(this.cache.isLoading()).some((v) => v);
      if (!anyLoading) {
        this.loading.set(false);
      }
    });

    effect(() => {
      const oid = this.auth.profile()?.ownerId;
      const list = this.members();
      const busy = this.loading();
      if (!oid || busy || list.length === 0) return;
      if (this.dueAlertDebounce) clearTimeout(this.dueAlertDebounce);
      this.dueAlertDebounce = setTimeout(() => {
        void this.inAppNotifications.syncDueAlertsFromMembers(oid, list);
      }, 2000);
    });

    // Pick the most "actionable" tab automatically the first time data loads.
    effect(() => {
      const busy = this.loading();
      if (busy) return;
      if (this.actionTabPicked) return;
      const counts = untracked(() => this.actionQueueCounts());
      let pick: ActionTab = 'overdue';
      if (counts.overdue > 0) pick = 'overdue';
      else if (counts.dueToday > 0) pick = 'dueToday';
      else if (counts.dueSoon > 0) pick = 'dueSoon';
      else if (counts.partial > 0) pick = 'partial';
      this.activeActionTab.set(pick);
      this.actionTabPicked = true;
    });

    // Reset paging when tab changes.
    effect(() => {
      this.activeActionTab();
      untracked(() => this.actionQueuePage.set(1));
    });

    /** Live submitted join-intake rows for dashboard card + pulse chip. */
    effect(() => {
      const uid = this.auth.effectiveOwnerId();
      untracked(() => {
        this.joinIntakeListUnsub?.();
        this.joinIntakeListUnsub = null;
        if (!uid || !this.auth.hasPermission('canAddMembers')) {
          this.pendingJoinRequests.set([]);
          return;
        }
        this.joinIntakeListUnsub = this.joinIntakeApi.watchSubmittedIntakes(uid, (rows) => {
          this.pendingJoinRequests.set(rows);
        });
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.notifications.requestPermissionOnce();
    this.subscriptionCountdownTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);
    this.loading.set(true);
    await this.auth.refreshProfile();
    const uid = this.auth.profile()?.ownerId;
    if (!uid) {
      this.loading.set(false);
      console.error('❌ No owner ID found');
      return;
    }

    this.currentOwnerId = uid;

    if (!this.isSupervisor()) {
      this.supervisorsUnsub?.();
      this.supervisorsUnsub = this.supervisorApi.watchSupervisors(uid, (rows) => {
        this.supervisors.set(rows.filter((s) => s.status !== 'disabled'));
      });
    }

    try {
      await this.cache.loadAllData(uid);
      // Low-cost check using already loaded members (no extra listener/polling here).
      this.notifications.checkDueMembers(this.members());
    } catch (error) {
      console.error('❌ Error loading dashboard data:', error);
      this.toast.error('Failed to load data');
    } finally {
      // Always flip loading off after the load attempt completes. Without this,
      // a "cache-hot" revisit (e.g. mobile PWA navigating back to /dashboard)
      // leaves `loading=true` forever — DataCacheService short-circuits when
      // data is already cached and never re-emits the `isLoading` signal, so
      // the constructor effect that flips loading off never re-runs.
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.subscriptionCountdownTimer) {
      clearInterval(this.subscriptionCountdownTimer);
      this.subscriptionCountdownTimer = null;
    }
    this.joinIntakeListUnsub?.();
    this.joinIntakeListUnsub = null;
    this.supervisorsUnsub?.();
    this.supervisorsUnsub = null;
    this.clearImportProgressUi();
    // Cache service handles listener cleanup
  }

  /* Complaints disabled — restore when feature fixed
  async setComplaintEnabled(enabled: boolean): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    const profile = this.auth.profile();
    if (!ownerId || !profile || this.complaintToggleBusy()) return;
    this.complaintToggleBusy.set(true);
    this.auth.profile.set({ ...profile, complaintEnabled: enabled });
    try {
      await this.complaintApi.setComplaintEnabled(ownerId, enabled);
      this.toast.success(`Complaints ${enabled ? 'enabled' : 'disabled'}`);
    } catch {
      this.auth.profile.set({ ...profile, complaintEnabled: Boolean(profile.complaintEnabled) });
      this.toast.error('Could not update complaint setting');
    } finally {
      this.complaintToggleBusy.set(false);
    }
  }
  */

  /**
   * Manual refresh button - forces re-fetch from Firestore
   */
  async refreshData(): Promise<void> {
    if (!this.currentOwnerId) return;
    this.loading.set(true);
    try {
      await this.cache.refresh(this.currentOwnerId);
      this.toast.success('Data refreshed');
    } catch (error) {
      console.error('❌ Error refreshing data:', error);
      this.toast.error('Failed to refresh data');
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const scrollPosition = window.scrollY;
    this.showScrollTopButton.set(scrollPosition > 300);
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  overdueByLine(m: Member): string {
    const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    if (!d) return 'Overdue';
    const n = overdueCalendarDays(d);
    return n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`;
  }

  toggleRecentJoinersExpanded(): void {
    this.recentJoinersExpanded.update((v) => !v);
  }

  rowTone(m: Member): 'blue' | 'red' | 'orange' | 'green' | 'neutral' {
    if (m.status === 'active' && (Number(m.pendingAmount) || 0) > 0) return 'blue';
    const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    const b = memberDueBucket(d, m.status === 'active');
    if (b === 'inactive' || b === 'unknown') return 'neutral';
    if (b === 'overdue') return 'red';
    if (b === 'dueToday' || b === 'oneDayLeft' || b === 'twoDaysLeft') return 'orange';
    return 'green';
  }

  canSendReceipt(m: Member): boolean {
    if (this.rowTone(m) !== 'green') return false;
    const digits = (m.mobile || '').replace(/\D/g, '');
    return digits.length === 10;
  }

  async sendReceipt(m: Member): Promise<void> {
    if (!this.canSendReceipt(m)) {
      this.toast.error('Valid mobile number is required');
      return;
    }
    try {
      const paymentDate = new Date();
      const pendingBeforeAmount = Math.max(0, Number(m.pendingAmount) || 0);
      const pendingAfterAmount = 0;
      const estimatedPaidAmount =
        Math.max(0, Number(m.amount || 0) - pendingAfterAmount) || Number(m.amount || 0);
      const ownerProfile = this.auth.profile();
      const businessName = ownerProfile?.businessName?.trim() || ownerProfile?.name || 'PayBook';
      const monthText = paymentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const mobile = (m.mobile || '').replace(/\D/g, '');
      const receiptNo = `RCPT-${paymentDate.getFullYear()}${String(paymentDate.getMonth() + 1).padStart(2, '0')}${String(
        paymentDate.getDate(),
      ).padStart(2, '0')}-${m.memberId.slice(0, 6).toUpperCase()}`;

      const receiptMember = {
        memberId: m.memberId,
        ownerId: m.ownerId,
        firstName: m.firstName,
        lastName: m.lastName,
        mobile: m.mobile,
        amount: m.amount,
        pendingAmount: pendingBeforeAmount,
        dueDate: m.dueDate,
        pendingBeforeAmount,
        pendingAfterAmount,
      };
      const latestPayment = await this.paymentsApi.getLatestPaymentForMember(m.memberId).catch(() => null);
      const resolvedMethod: PaymentMethod =
        latestPayment?.method === 'cash' ||
        latestPayment?.method === 'upi' ||
        latestPayment?.method === 'card'
          ? latestPayment.method
          : 'cash';
      const paymentIdForReceipt =
        latestPayment?.paymentId && String(latestPayment.paymentId).length > 0
          ? latestPayment.paymentId
          : `payment-${Date.now()}`;
      const payment: Payment = {
        paymentId: paymentIdForReceipt,
        memberId: m.memberId,
        ownerId: this.auth.profile()?.ownerId || '',
        amount: estimatedPaidAmount,
        date: Timestamp.fromDate(paymentDate),
        method: resolvedMethod,
        createdAt: Timestamp.fromDate(paymentDate),
      };
      const { url, expiresAt } = await this.receiptService.generateReceiptLink(
        receiptMember,
        payment,
        receiptNo,
      );

      const msg = `Hi ${m.firstName} ${m.lastName || ''}

This message from ${businessName}

Your payment receipt for ${monthText} is ready!

Amount: ₹${estimatedPaidAmount.toLocaleString('en-IN')}
Receipt No: ${receiptNo}

Click the link below to view and download your receipt:
${url}

This link will expire on ${expiresAt.toLocaleDateString('en-IN')}

Thanks regards,
${businessName}`;

      const wa = `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
      const opened = window.open(wa, '_blank', 'noopener,noreferrer');
      if (opened) {
        this.toast.success('Opening WhatsApp with receipt message...');
      } else {
        window.location.assign(wa);
        this.toast.success('Opening WhatsApp in this tab...');
      }
    } catch (error) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message || '')
          : '';
      if (/permission/i.test(msg)) {
        this.toast.error('Could not generate receipt link (permission denied). Deploy/update firestore.rules.');
      } else {
        this.toast.error(msg || 'Could not generate receipt link');
      }
    }
  }

  openMemberDetail(m: Member): void {
    this.memberDetailTarget.set(m);
  }

  closeMemberDetail(): void {
    this.memberDetailTarget.set(null);
  }

  memberDetailTitle(): string {
    const m = this.memberDetailTarget();
    return m ? `${m.firstName} ${m.lastName || ''}`.trim() : 'Member details';
  }

  memberJoinDate(m: Member): Date | null {
    return coerceFirestoreDate(m.joinDate as unknown) ?? timestampToDate(m.joinDate);
  }

  memberCreatedAt(m: Member): Date | null {
    return coerceFirestoreDate(m.createdAt as unknown) ?? timestampToDate(m.createdAt);
  }

  // Pagination helpers
  getDueTodayPageNumbers(): number[] {
    return Array.from({ length: this.dueTodayPages() }, (_, i) => i + 1);
  }

  getDueSoonPageNumbers(): number[] {
    return Array.from({ length: this.dueSoonPages() }, (_, i) => i + 1);
  }

  getOverduePageNumbers(): number[] {
    return Array.from({ length: this.overduePages() }, (_, i) => i + 1);
  }

  setDueTodayPage(page: number): void {
    if (page >= 1 && page <= this.dueTodayPages()) {
      this.dueTodayPage.set(page);
    }
  }

  setDueSoonPage(page: number): void {
    if (page >= 1 && page <= this.dueSoonPages()) {
      this.dueSoonPage.set(page);
    }
  }

  setOverduePage(page: number): void {
    if (page >= 1 && page <= this.overduePages()) {
      this.overduePage.set(page);
    }
  }

  memberDueDate(m: Member): Date | null {
    return coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
  }

  get floorGroups(): FormArray {
    return this.setupForm.controls.floors as FormArray;
  }

  roomGroupsAt(floorIndex: number): FormArray {
    return this.floorGroups.at(floorIndex).get('rooms') as FormArray;
  }

  openSetupModal(): void {
    const existing = this.pgLayout();
    if (existing?.floors?.length) {
      this.loadLayoutIntoForm(existing);
    } else {
      this.rebuildFloors(1);
    }
    this.validationError.set(null);
    this.setupModalOpen.set(true);
  }

  closeSetupModal(): void {
    this.validationError.set(null);
    this.setupModalOpen.set(false);
  }

  openBedMap(): void {
    if (!this.hasPgLayout()) return;
    this.bedMapModalOpen.set(true);
  }

  closeBedMap(): void {
    this.bedMapModalOpen.set(false);
  }

  openImportModal(): void {
    this.importRows.set([]);
    this.importFileName.set('');
    this.importDueDateForAll.setValue(false);
    this.importDueDate.setValue('');
    this.clearImportProgressUi();
    this.importModalOpen.set(true);
  }

  closeImportModal(): void {
    this.importModalOpen.set(false);
  }

  viewSampleExcel(): void {
    this.importFileName.set('Sample template (in-app preview)');
    this.parseImportCsv(memberImportSampleCsv(this.isPg()));
  }

  async downloadSampleExcel(): Promise<void> {
    const rows = memberImportSampleAoA(this.isPg());
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Members');
      XLSX.writeFile(wb, 'members-import-sample.xlsx');
    } catch {
      this.toast.error('Could not create sample Excel. Try again.');
    }
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          this.importRows.set([]);
          this.toast.error('Excel file has no sheets');
          return;
        }
        const sheet = wb.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
          header: 1,
          raw: false,
          blankrows: false,
          defval: '',
        });
        const csvText = rows
          .map((r) =>
            r
              .map((cell) => {
                const s = String(cell ?? '').trim();
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(','),
          )
          .join('\n');
        this.parseImportCsv(csvText);
      } else {
        const text = await file.text();
        this.parseImportCsv(text);
      }
    } catch {
      this.toast.error('Could not read file. Upload CSV or Excel.');
    } finally {
      input.value = '';
    }
  }

  private parseImportCsv(text: string): void {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      this.importRows.set([]);
      this.toast.error('CSV is empty');
      return;
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = {
      name: headers.indexOf('name'),
      mobile: headers.indexOf('mobile'),
      plan: headers.indexOf('plan'),
      dueDate: headers.indexOf('duedate'),
      subscriptionType: headers.indexOf('subscriptiontype'),
      floor: headers.indexOf('floor'),
      room: headers.indexOf('room'),
      bed: headers.indexOf('bed'),
    };
    if (idx.name < 0 || idx.plan < 0 || idx.dueDate < 0 || idx.subscriptionType < 0) {
      this.importRows.set([]);
      this.toast.error('CSV headers missing. Use sample format.');
      return;
    }

    const existingKeys = new Set<string>();
    for (const m of this.members()) {
      const loc = this.identityLocationParts(m.floorNumber || '', m.roomNumber || '', m.bedNumber || '');
      existingKeys.add(this.memberIdentityKey(m.firstName, m.lastName || '', m.mobile || '', loc.floorNumber, loc.roomNumber, loc.bedNumber));
    }
    const fileKeys = new Set<string>();
    const rows: ImportPreviewRow[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cols = this.parseCsvLine(lines[i]);
      const rawName = this.readCol(cols, idx.name);
      const [firstName, ...lastParts] = rawName.trim().split(/\s+/);
      const lastName = lastParts.join(' ');
      const mobile = this.readCol(cols, idx.mobile).replace(/\D/g, '');
      const planText = this.readCol(cols, idx.plan);
      const dueDateText = this.readCol(cols, idx.dueDate);
      const subRaw = this.readCol(cols, idx.subscriptionType);
      const subText = subRaw.toLowerCase();
      const floor = this.readCol(cols, idx.floor);
      const room = this.readCol(cols, idx.room);
      const bed = this.readCol(cols, idx.bed);

      const errors: string[] = [];
      if (!firstName) errors.push('Name is required');
      const amount = Number(planText);
      if (!Number.isFinite(amount) || amount <= 0) errors.push('Plan should be a positive number');
      const subErr = pgSheetSubscriptionError(this.isPg(), subRaw);
      if (subErr) errors.push(subErr);
      let subscriptionType: SubscriptionType = 'monthly';
      if (this.isGym()) {
        const st = (subText || 'monthly').trim();
        subscriptionType = (st === 'quarterly' || st === 'yearly' ? st : 'monthly') as SubscriptionType;
      }
      const dueDate = this.parseDateInput(dueDateText);
      if (!dueDate) errors.push('dueDate should be YYYY-MM-DD');
      if (mobile && mobile.length !== 10) errors.push('Mobile should be 10 digits');

      const assignedBed = this.isPg()
        ? parsePgImportSeat(floor, room, bed)
        : { floorNumber: '', roomNumber: '', bedNumber: '', errors: [] as string[] };
      if (this.isPg()) errors.push(...assignedBed.errors);

      const identityLoc = this.identityLocationParts(assignedBed.floorNumber, assignedBed.roomNumber, assignedBed.bedNumber);
      const key = this.memberIdentityKey(firstName, lastName, mobile, identityLoc.floorNumber, identityLoc.roomNumber, identityLoc.bedNumber);
      if (existingKeys.has(key)) errors.push('Member details already exist');
      if (fileKeys.has(key)) errors.push('Duplicate row in file (same name/mobile/seat as another row)');
      fileKeys.add(key);

      if (this.isPg() && assignedBed.errors.length === 0 && assignedBed.floorNumber) {
        const f = Number(assignedBed.floorNumber);
        const r = Number(assignedBed.roomNumber);
        const b = Number(assignedBed.bedNumber);
        if (Number.isFinite(f) && Number.isFinite(r) && Number.isFinite(b) && this.isBedOccupied(f, r, b)) {
          const label = formatPgRoomLabel(f, r) || `${f}-${r}`;
          errors.push(`Seat ${label} · bed ${b} is already assigned to an active member.`);
        }
      }

      rows.push({
        rowNo: i + 1,
        valid: errors.length === 0,
        errors,
        firstName,
        lastName,
        mobile,
        amount: Number.isFinite(amount) ? amount : 0,
        dueDate: dueDateText,
        subscriptionType,
        floorNumber: assignedBed.floorNumber,
        roomNumber: assignedBed.roomNumber,
        bedNumber: assignedBed.bedNumber,
      });
    }

    this.importRows.set(rows);
  }

  async importValidMembers(): Promise<void> {
    const owner = this.auth.profile();
    if (!owner?.ownerId) return;
    const rows = this.importRows();
    const dueForAll = this.importDueDateForAll.value ? this.parseDateInput(this.importDueDate.value) : null;
    if (this.importDueDateForAll.value && !dueForAll) {
      this.toast.error('Please select a valid due date for all');
      return;
    }
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) {
      this.toast.error('No valid rows to import');
      return;
    }

    const seatNeeds = this.isPg() && owner.ownerId ? this.collectImportSeatNeeds(validRows) : [];
    const willSyncLayout = Boolean(this.isPg() && owner.ownerId && seatNeeds.length > 0);
    const layoutWeight = willSyncLayout ? 14 : 0;
    const n = validRows.length;
    const memberWeight = 100 - layoutWeight;

    this.importBusy.set(true);
    this.startImportProgressUi();

    let imported = 0;
    try {
      if (willSyncLayout) {
        try {
          await this.pgLayoutApi.ensureLayoutSeatsForImport(owner.ownerId, seatNeeds);
          this.setImportProgressPercent(layoutWeight);
        } catch {
          this.toast.error('Could not update the room map for this import. Try again or set up floors in Rooms first.');
          return;
        }
      } else {
        this.setImportProgressPercent(4);
      }

      for (let i = 0; i < validRows.length; i += 1) {
        const row = validRows[i];
        const due = dueForAll || this.parseDateInput(row.dueDate);
        if (!due) {
          this.setImportProgressPercent(layoutWeight + ((i + 1) / n) * memberWeight);
          continue;
        }
        const join = new Date(due);
        join.setMonth(join.getMonth() - 1);
        try {
          await this.membersApi.addMember({
            firstName: row.firstName,
            lastName: row.lastName || undefined,
            mobile: row.mobile || undefined,
            floorNumber: row.floorNumber || '',
            roomNumber: row.roomNumber || '',
            bedNumber: row.bedNumber || '',
            joinDate: join,
            dueDate: due,
            amount: row.amount,
            paymentMethod: 'cash',
            status: 'active',
            subscriptionType: owner.businessType === 'gym' ? row.subscriptionType : 'monthly',
          });
          imported += 1;
        } catch {
          // Skip failed row, continue import.
        }
        this.setImportProgressPercent(layoutWeight + ((i + 1) / n) * memberWeight);
      }

      this.setImportProgressPercent(100);
      this.importProgressMessage.set('All set! Putting the finishing touches on your import.');
      await new Promise<void>((resolve) => setTimeout(resolve, 480));
      this.toast.success(`Imported ${imported} members. Skipped ${validRows.length - imported}.`);
      this.importModalOpen.set(false);
    } finally {
      this.clearImportProgressUi();
      this.importBusy.set(false);
    }
  }

  private startImportProgressUi(): void {
    this.clearImportProgressUi();
    this.importProgressPercent.set(2);
    this.importProgressMessage.set(MEMBER_IMPORT_PROGRESS_MESSAGES[0] ?? 'Importing members, please wait.');
    let idx = 0;
    this.importProgressRotator = setInterval(() => {
      idx = (idx + 1) % MEMBER_IMPORT_PROGRESS_MESSAGES.length;
      this.importProgressMessage.set(MEMBER_IMPORT_PROGRESS_MESSAGES[idx] ?? '');
    }, 2600);
  }

  private setImportProgressPercent(p: number): void {
    this.importProgressPercent.set(Math.min(100, Math.max(0, Math.round(p))));
  }

  private clearImportProgressUi(): void {
    if (this.importProgressRotator) {
      clearInterval(this.importProgressRotator);
      this.importProgressRotator = null;
    }
    this.importProgressPercent.set(0);
    this.importProgressMessage.set('');
  }

  onFloorCountChange(raw: unknown): void {
    const current = this.floorGroups.length || 1;
    const count = this.coerceCount(raw, 1, 500);
    if (count < current) {
      const floors = this.formToLayoutFloors();
      const firstRemoved = Number(floors[count]?.floorNumber);
      if (Number.isFinite(firstRemoved) && this.hasAssignedOnOrAboveFloor(firstRemoved)) {
        this.setupForm.controls.floorCount.setValue(current, { emitEvent: false });
        this.validationError.set('Cannot reduce floors: assigned seats exist on removed floor(s).');
        return;
      }
    }
    this.setupForm.controls.floorCount.setValue(count, { emitEvent: false });
    this.rebuildFloors(count);
    this.validationError.set(null);
  }

  onRoomCountChange(floorIndex: number, raw: unknown): void {
    const rooms = this.roomGroupsAt(floorIndex);
    const count = this.coerceCount(raw, 0, 500);
    const floorNumber = this.floorNumberAtFormIndex(floorIndex);
    if (count < rooms.length && this.hasAssignedOnOrAboveRoom(floorNumber, count + 1)) {
      const floorGroup = this.floorGroups.at(floorIndex);
      floorGroup.get('roomCount')?.setValue(rooms.length, { emitEvent: false });
      this.validationError.set(`Cannot reduce rooms on floor ${floorNumber}: assigned seats exist in removed room(s).`);
      return;
    }
    const floorGroup = this.floorGroups.at(floorIndex);
    floorGroup.get('roomCount')?.setValue(count, { emitEvent: false });
    while (rooms.length < count) {
      rooms.push(
        this.fb.nonNullable.group({
          roomNumber: rooms.length + 1,
          beds: [1, [Validators.required, Validators.min(1)]],
          rent: [null as number | null, [Validators.min(1)]],
        }),
      );
    }
    while (rooms.length > count) {
      rooms.removeAt(rooms.length - 1);
    }
    this.renumberRooms(floorIndex);
    this.validationError.set(null);
  }

  onBedsCountChange(floorIndex: number, roomIndex: number, raw: unknown): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const currentBeds = Math.max(1, Number(room.get('beds')?.value) || 1);
    const nextBeds = this.coerceCount(raw, 1, 500);
    const floorNumber = this.floorNumberAtFormIndex(floorIndex);
    const roomNumber = roomIndex + 1;
    if (nextBeds < currentBeds && this.hasAssignedOnOrAboveBed(floorNumber, roomNumber, nextBeds + 1)) {
      room.get('beds')?.setValue(currentBeds, { emitEvent: false });
      this.validationError.set(
        `Cannot reduce beds in room ${this.formatRoomNumber(floorNumber, roomNumber)}: assigned seats exist in removed bed(s).`,
      );
      return;
    }
    room.get('beds')?.setValue(nextBeds, { emitEvent: false });
    this.validationError.set(null);
  }

  async saveDraft(stayOpen = true): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) return;
    const floors = this.formToLayoutFloors();
    try {
      await this.pgLayoutApi.saveLayout(ownerId, floors);
      // Optimistic local update so dashboard actions enable immediately.
      this.pgLayout.set({ ownerId, floors });
      this.toast.success('Layout draft saved');
      if (!stayOpen) this.closeSetupModal();
    } catch {
      this.toast.error('Could not save layout draft');
    }
  }

  private loadLayoutIntoForm(layout: PgLayout): void {
    const floorCount = Math.max(1, layout.floors.length || 1);
    this.setupForm.controls.floorCount.setValue(floorCount);
    this.floorGroups.clear();
    for (let i = 0; i < floorCount; i += 1) {
      const floor = layout.floors[i] ?? { floorNumber: i + 1, rooms: [] };
      const stored = Math.trunc(Number(floor.floorNumber));
      const floorNumber = Number.isFinite(stored) ? stored : i + 1;
      const rooms = this.fb.array(
        (floor.rooms ?? []).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
            rent: [Number(room.rent) > 0 ? Math.round(Number(room.rent)) : null, [Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber,
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private defaultFloorNumberForIndex(i: number, current: PgFloorLayout[]): number {
    if (i < current.length) {
      const n = Math.trunc(Number(current[i].floorNumber));
      return Number.isFinite(n) ? n : i;
    }
    let maxF = -Infinity;
    for (const fl of current) {
      const n = Math.trunc(Number(fl.floorNumber));
      if (Number.isFinite(n) && n > maxF) maxF = n;
    }
    if (!Number.isFinite(maxF)) return i;
    return maxF + 1 + (i - current.length);
  }

  private rebuildFloors(targetCount: number): void {
    const current = this.formToLayoutFloors();
    this.floorGroups.clear();
    for (let i = 0; i < targetCount; i += 1) {
      const floor: PgFloorLayout =
        current[i] ??
        ({
          floorNumber: this.defaultFloorNumberForIndex(i, current),
          rooms: [],
        } as PgFloorLayout);
      const rooms = this.fb.array(
        (floor.rooms ?? []).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
            rent: [Number(room.rent) > 0 ? Math.round(Number(room.rent)) : null, [Validators.min(1)]],
          }),
        ),
      );
      const fn = Math.trunc(Number(floor.floorNumber));
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: Number.isFinite(fn) ? fn : this.defaultFloorNumberForIndex(i, current),
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private renumberRooms(floorIndex: number): void {
    const rooms = this.roomGroupsAt(floorIndex);
    for (let i = 0; i < rooms.length; i += 1) {
      rooms.at(i).get('roomNumber')?.setValue(i + 1);
    }
  }

  private formToLayoutFloors(): PgFloorLayout[] {
    return this.floorGroups.controls.map((floorCtrl, floorIdx) => {
      const rooms = (floorCtrl.get('rooms') as FormArray).controls.map((roomCtrl, roomIdx) => ({
        roomNumber: roomIdx + 1,
        beds: Math.max(1, Number(roomCtrl.get('beds')?.value) || 1),
        rent: Number(roomCtrl.get('rent')?.value) > 0 ? Math.round(Number(roomCtrl.get('rent')?.value)) : undefined,
      }));
      const fromCtrl = Math.trunc(Number(floorCtrl.get('floorNumber')?.value));
      const floorNumber = Number.isFinite(fromCtrl) ? fromCtrl : floorIdx;
      return {
        floorNumber,
        rooms,
      };
    });
  }

  floorNumberAtFormIndex(floorIndex: number): number {
    const raw = this.floorGroups.at(floorIndex)?.get('floorNumber')?.value;
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : floorIndex;
  }

  private coerceCount(v: unknown, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  incrementFloorCount(): void {
    this.onFloorCountChange((this.floorGroups.length || 1) + 1);
  }

  decrementFloorCount(): void {
    this.onFloorCountChange((this.floorGroups.length || 1) - 1);
  }

  incrementRoomCount(floorIndex: number): void {
    this.onRoomCountChange(floorIndex, this.roomGroupsAt(floorIndex).length + 1);
  }

  decrementRoomCount(floorIndex: number): void {
    this.onRoomCountChange(floorIndex, this.roomGroupsAt(floorIndex).length - 1);
  }

  incrementBedsCount(floorIndex: number, roomIndex: number): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const current = Math.max(1, Number(room.get('beds')?.value) || 1);
    this.onBedsCountChange(floorIndex, roomIndex, current + 1);
  }

  decrementBedsCount(floorIndex: number, roomIndex: number): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const current = Math.max(1, Number(room.get('beds')?.value) || 1);
    this.onBedsCountChange(floorIndex, roomIndex, current - 1);
  }

  private hasAssignedOnOrAboveFloor(startFloorNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      if (!Number.isFinite(floor)) continue;
      if (floor >= startFloorNumber) return true;
    }
    return false;
  }

  private hasAssignedOnOrAboveRoom(floorNumber: number, startRoomNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      const room = Number(m.roomNumber);
      if (!Number.isFinite(floor) || !Number.isFinite(room)) continue;
      if (floor === floorNumber && room >= startRoomNumber) return true;
    }
    return false;
  }

  private hasAssignedOnOrAboveBed(floorNumber: number, roomNumber: number, startBedNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      const room = Number(m.roomNumber);
      const bed = Number(m.bedNumber);
      if (!Number.isFinite(floor) || !Number.isFinite(room) || !Number.isFinite(bed)) continue;
      if (floor === floorNumber && room === roomNumber && bed >= startBedNumber) return true;
    }
    return false;
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  formatRoomNumber(floorNumber: number, roomNumber: number): string {
    return formatPgRoomLabel(floorNumber, roomNumber);
  }

  sharingLabel(beds: unknown): string {
    return sharingLabelForBeds(beds);
  }

  roomRentText(rent: unknown): string {
    const n = Number(rent);
    if (!Number.isFinite(n) || n <= 0) return 'Price not mentioned';
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
  }

  importSeatSummary(row: ImportPreviewRow): string {
    if (!this.isPg()) return '—';
    if (!row.floorNumber || !row.roomNumber || !row.bedNumber) return 'No seat';
    const f = Number(row.floorNumber);
    const r = Number(row.roomNumber);
    const label = formatPgRoomLabel(f, r);
    return label ? `${label} · bed ${row.bedNumber}` : `Floor ${row.floorNumber} · room ${row.roomNumber} · bed ${row.bedNumber}`;
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f < 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }

  /**
   * Convert Firestore Timestamp to JavaScript Date
   * Handles multiple formats: Firestore Timestamp with toDate(), fallback utils, etc.
   */
  private convertTimestampToDate(timestamp: unknown): Date | null {
    try {
      // Try Firestore Timestamp.toDate() method first
      if (timestamp && typeof timestamp === 'object') {
        const obj = timestamp as any;
        if (typeof obj.toDate === 'function') {
          return obj.toDate();
        }
      }

      // Try coercion utilities
      const coerced = coerceFirestoreDate(timestamp);
      if (coerced) {
        return coerced;
      }

      // Try timestampToDate utility
      const converted = timestampToDate(timestamp as any);
      if (converted) {
        return converted;
      }

      // If it's already a Date
      if (timestamp instanceof Date) {
        return timestamp;
      }

      return null;
    } catch (error) {
      console.error('Error converting timestamp:', timestamp, error);
      return null;
    }
  }

  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  private readCol(cols: string[], index: number): string {
    if (index < 0 || index >= cols.length) return '';
    return String(cols[index] || '').trim();
  }

  private parseDateInput(v: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return dt;
  }

  private memberIdentityKey(
    firstName: string,
    lastName: string,
    mobile: string,
    floorNumber: string,
    roomNumber: string,
    bedNumber: string,
  ): string {
    return [
      firstName.trim().toLowerCase(),
      lastName.trim().toLowerCase(),
      (mobile || '').replace(/\D/g, ''),
      (floorNumber || '').trim().toLowerCase(),
      (roomNumber || '').trim().toLowerCase(),
      (bedNumber || '').trim().toLowerCase(),
    ].join('|');
  }

  private collectImportSeatNeeds(rows: ImportPreviewRow[]): { floorNumber: number; roomNumber: number; minBeds: number }[] {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.floorNumber || !row.roomNumber || !row.bedNumber) continue;
      const f = Number(row.floorNumber);
      const r = Number(row.roomNumber);
      const b = Number(row.bedNumber);
      if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) continue;
      const k = `${Math.trunc(f)}-${Math.trunc(r)}`;
      map.set(k, Math.max(map.get(k) || 0, Math.trunc(b)));
    }
    return [...map.entries()].map(([k, minBeds]) => {
      const [a, b] = k.split('-');
      return { floorNumber: Number(a), roomNumber: Number(b), minBeds };
    });
  }

  private identityLocationParts(
    floorNumber: string,
    roomNumber: string,
    bedNumber: string,
  ): { floorNumber: string; roomNumber: string; bedNumber: string } {
    if (!this.isPg()) return { floorNumber: '', roomNumber: '', bedNumber: '' };
    return {
      floorNumber: String(floorNumber || '').trim().toLowerCase(),
      roomNumber: String(roomNumber || '').trim().toLowerCase(),
      bedNumber: String(bedNumber || '').trim().toLowerCase(),
    };
  }




}

type ImportPreviewRow = {
  rowNo: number;
  valid: boolean;
  errors: string[];
  firstName: string;
  lastName: string;
  mobile: string;
  amount: number;
  dueDate: string;
  subscriptionType: SubscriptionType;
  floorNumber: string;
  roomNumber: string;
  bedNumber: string;
};
