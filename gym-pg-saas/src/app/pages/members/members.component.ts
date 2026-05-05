import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  effect,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { jsPDF } from 'jspdf';
import { Subscription } from 'rxjs';
import { Timestamp } from 'firebase/firestore';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { PgFloorLayout, PgLayout, PgRoomLayout } from '../../core/models/pg-layout.model';
import { Payment, PaymentMethod } from '../../core/models/payment.model';
import { AuditLogService } from '../../core/services/audit-log.service';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { TranslationService } from '../../core/services/translation.service';
import { MemberService } from '../../core/services/member.service';
import {
  MemberOnboardingService,
  type OnboardingPhotoKind,
} from '../../core/services/member-onboarding.service';
import { MemberJoinIntakeService } from '../../core/services/member-join-intake.service';
import type { MemberJoinIntake } from '../../core/models/member-join-intake.model';
import QRCode from 'qrcode';
import { NotificationService } from '../../core/services/notification.service';
import { PaymentService } from '../../core/services/payment.service';
import { MemberReceiptService } from '../../core/services/member-receipt.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import {
  addDays,
  calendarDaysBetween,
  coerceFirestoreDate,
  dueUiStatus,
  DueBucket,
  dueRemainingOrOverdueLabel,
  endOfToday,
  formatYyyyMmDdAsDdMmYyyy,
  memberDueBucket,
  parseYyyyMmDdLocal,
  startOfDay,
  startOfToday,
  timestampToDate,
  dateToTimestamp,
} from '../../core/utils/date.utils';
import { formatPgRoomLabel, sharingLabelForBeds } from '../../core/utils/pg-layout-display.utils';
import { memberImportSampleAoA, memberImportSampleCsv } from '../../core/utils/member-import-sample.util';
import { MEMBER_IMPORT_PROGRESS_MESSAGES } from '../../core/utils/member-import-progress.messages';
import { parsePgImportSeat, pgSheetSubscriptionError } from '../../core/utils/pg-sheet-import.utils';
import {
  applyDigitsOnlyFromInput,
  applyIndianMemberMobileFromInput,
  dueDateAfterJoinDate,
  formatIndianMemberMobileDisplay,
  indianMemberMobileValidator,
  joinDateNotInPast,
  normalizeIndianMemberMobileDigits,
  optionalDigitsLen,
  positiveAmount,
} from '../../core/utils/validators';
import { EditPaymentModalComponent, type EditPaymentKind } from '@app/shared/edit-payment-modal.component';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

const MEMBER_MODAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const MEMBER_MODAL_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    ModalComponent,
    EditPaymentModalComponent,
    TranslatePipe,
  ],
  templateUrl: './members.component.html',
  styles: [`
    select.pg-seat-select option:disabled {
      color: rgb(185 28 28);
    }

    .seat-assign-highlight {
      position: relative;
      border-color: #facc15 !important;
      color: #0f172a !important;
      background: linear-gradient(120deg, #fef08a, #facc15, #fef08a);
      background-size: 220% 220%;
      animation: seatAssignCrazyPulse 0.8s ease-in-out infinite, seatAssignCrazyShift 1.4s linear infinite;
      transform-origin: center;
      box-shadow:
        0 0 0 2px rgba(250, 204, 21, 0.9),
        0 0 14px rgba(250, 204, 21, 0.8),
        0 0 28px rgba(250, 204, 21, 0.55);
    }

    @keyframes seatAssignCrazyPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }

    @keyframes seatAssignCrazyShift {
      0% { background-position: 0% 50%; }
      100% { background-position: 100% 50%; }
    }

    .pay-collect-total-highlight {
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      background: linear-gradient(120deg, #d1fae5, #a7f3d0, #6ee7b7, #34d399, #6ee7b7, #a7f3d0, #d1fae5);
      background-size: 300% 300%;
      animation: payCollectPulse 2s ease-in-out infinite, payCollectShift 3.5s linear infinite;
      box-shadow:
        0 0 0 2px rgba(16, 185, 129, 0.45),
        0 0 18px rgba(5, 150, 105, 0.25);
    }

    @keyframes payCollectPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    @keyframes payCollectShift {
      0% { background-position: 0% 50%; }
      100% { background-position: 100% 50%; }
    }

  `],
})
export class MembersComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly auditLog = inject(AuditLogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cache = inject(DataCacheService);
  private readonly membersApi = inject(MemberService);
  private readonly onboardingApi = inject(MemberOnboardingService);
  private readonly joinIntakeApi = inject(MemberJoinIntakeService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly notifications = inject(NotificationService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly receiptService = inject(MemberReceiptService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly members = signal<Member[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly listMode = signal<'active' | 'inactive'>('active');
  readonly payFilter = signal<'all' | 'paid' | 'overdue' | 'dueSoon' | 'partial' | 'pending'>('all');
  readonly sortKey = signal<'due' | 'name'>('due');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly desktopMemberView = signal<'table' | 'card'>('table');
  readonly dueSectionFilter = signal<'all' | 'dueToday' | 'overdue' | 'dueSoon'>('all');
  /** Deep link from dashboard: `?onboarding=review` shows only share-link submissions pending approval. */
  readonly onboardingReviewFilter = signal<'all' | 'review'>('all');

  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly moreOpen = signal(false);

  /** Mobile 3-dot menu state - tracks which member's menu is open */
  readonly mobileMenuOpen = signal<string | null>(null);

  /** Add/Edit member modal: mobile `<input>` for formatted display sync after modal opens. */
  readonly memberMobileInputRef = viewChild<ElementRef<HTMLInputElement>>('memberMobile');

  readonly payModalOpen = signal(false);
  readonly payTarget = signal<Member | null>(null);
  readonly payEntryMode = signal<'standard' | 'pendingOnly'>('standard');
  /** True while a markPaid() call is in flight — blocks double/triple submit. */
  readonly paymentSubmitting = signal(false);
  readonly historyModalOpen = signal(false);
  readonly historyMember = signal<Member | null>(null);
  readonly historyPayments = signal<Payment[]>([]);
  readonly historyEditPaymentOpen = signal(false);
  readonly historyEditPayment = signal<Payment | null>(null);
  readonly historyEditPaymentKind = signal<EditPaymentKind>('rent');
  readonly detailsModalOpen = signal(false);
  readonly detailsMember = signal<Member | null>(null);
  readonly detailsMessageDraft = signal('');
  readonly bedPickerOpen = signal(false);
  readonly pgLayout = signal<PgLayout | null>(null);
  readonly importModalOpen = signal(false);
  readonly importRows = signal<ImportPreviewRow[]>([]);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  /** 0-100 while `importBusy` (bulk import). */
  readonly importProgressPercent = signal(0);
  readonly importProgressMessage = signal('');
  private importProgressRotator: ReturnType<typeof setInterval> | null = null;
  readonly manualSeatEntryTriggered = signal(false);
  readonly manualSeatError = signal<string | null>(null);
  readonly importDueDateForAll = this.fb.nonNullable.control(false);
  readonly importDueDate = this.fb.nonNullable.control('');
  private historyUnsub: (() => void) | null = null;
  private layoutUnsub: (() => void) | null = null;
  private readonly i18n = inject(TranslationService);

  // Pagination signals
  readonly currentPage = signal(1);
  readonly pageGroupStart = signal(1); // For showing page numbers 1-5, 6-10, etc
  readonly itemsPerPage = 20;
  readonly pagesPerGroup = 5;

  readonly dueLabel = computed(() => {
    this.i18n.lang();
    return this.auth.profile()?.businessType === 'pg'
      ? this.i18n.t('fees.rentDue')
      : this.i18n.t('fees.planExpiry');
  });

  readonly isGym = computed(() => this.auth.profile()?.businessType === 'gym');
  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');
  readonly hasSeatLayout = computed(
    () => this.isPg() && (this.pgLayout()?.floors?.length ?? 0) > 0,
  );

  /** Floors from seat map, stable numeric order (for add/edit dropdowns). */
  readonly pgFloorsOrdered = computed((): PgFloorLayout[] => {
    const floors = this.pgLayout()?.floors ?? [];
    return [...floors].sort((a, b) => Number(a.floorNumber) - Number(b.floorNumber));
  });

  /** Due date for the member currently in the pay modal (if any). */
  getPayTargetDueDate(): Date | null {
    const m = this.payTarget();
    if (!m) return null;
    return timestampToDate(m.dueDate);
  }

  /** Safely get the formatted due date for a member in the members list */
  getMemberDueDate(m: Member | null): Date | null {
    if (!m) return null;
    return timestampToDate(m.dueDate);
  }

  readonly occupiedBedKeys = computed(() => {
    const set = new Set<string>();
    const editing = this.editingId();
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      if (editing && m.memberId === editing) continue;
      const key = this.bedKey(m.floorNumber, m.roomNumber, m.bedNumber);
      if (key) set.add(key);
    }
    return set;
  });

  readonly displayMembers = computed(() => {
    let list = [...this.members()];
    if (this.listMode() === 'active') {
      list = list.filter((m) => m.status === 'active');
    } else {
      list = list.filter((m) => m.status === 'inactive');
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const name = `${m.firstName} ${m.lastName || ''}`.toLowerCase();
        const mob = (m.mobile || '').replace(/\D/g, '');
        const qq = q.replace(/\D/g, '');
        const roomRaw = String(m.roomNumber ?? '').trim().toLowerCase();
        /** Match UI room chip: PG stores floor + room separately but shows e.g. "301" via formatPgRoomLabel. */
        let roomHaystack = roomRaw;
        if (this.isPg()) {
          const fNum = Math.trunc(Number(m.floorNumber));
          const rNum = Math.trunc(Number(m.roomNumber));
          if (Number.isFinite(fNum) && Number.isFinite(rNum) && rNum > 0) {
            const label = formatPgRoomLabel(fNum, rNum).toLowerCase();
            const floorRoomDigits = `${fNum}${rNum}`;
            roomHaystack = [roomRaw, label, floorRoomDigits].filter((s) => s.length > 0).join(' ');
          }
        }
        const roomDigitsHaystack = roomHaystack.replace(/\D/g, '');
        const nameMatch = name.includes(q);
        const mobileMatch = qq.length > 0 && mob.includes(qq);
        const roomTextMatch = roomHaystack.length > 0 && roomHaystack.includes(q);
        const roomDigitMatch =
          qq.length > 0 && roomDigitsHaystack.length > 0 && roomDigitsHaystack.includes(qq);
        return nameMatch || mobileMatch || roomTextMatch || roomDigitMatch;
      });
    }
    const sf = this.statusFilter();
    if (sf !== 'all') list = list.filter((m) => m.status === sf);
    const pf = this.payFilter();
    const dueFilter = this.dueSectionFilter();
    
    // Apply payment filters exclusively (only one at a time)
    if (pf === 'paid') {
      list = list.filter((m) => this.rowTone(m) === 'green');
    } else if (pf === 'overdue') {
      list = list.filter((m) => this.rowTone(m) === 'red');
    } else if (pf === 'dueSoon') {
      list = list.filter((m) => this.rowTone(m) === 'orange');
    } else if (pf === 'partial') {
      list = list.filter((m) => this.rowTone(m) === 'blue');
    } else if (pf === 'pending') {
      // Backward compatibility for old links/query params.
      list = list.filter((m) => {
        const tone = this.rowTone(m);
        return tone === 'red' || tone === 'orange' || tone === 'blue';
      });
    } else if (pf === 'all') {
      // Only apply due section filter when payment filter is 'all'
      if (dueFilter === 'dueToday') {
        list = list.filter((m) => {
          const d = timestampToDate(m.dueDate);
          return d ? dueUiStatus(d) === 'dueToday' : false;
        });
      } else if (dueFilter === 'overdue') {
        list = list.filter((m) => {
          const d = timestampToDate(m.dueDate);
          return d ? dueUiStatus(d) === 'overdue' : false;
        });
      } else if (dueFilter === 'dueSoon') {
        const today = startOfToday();
        list = list.filter((m) => {
          const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
          if (!due || m.status !== 'active') return false;
          const daysLeft = calendarDaysBetween(today, startOfDay(due));
          return daysLeft >= 0 && daysLeft <= 5;
        });
      }
    }

    if (this.onboardingReviewFilter() === 'review') {
      list = list.filter((m) => this.hasPendingSelfOnboardingReview(m));
    }

    const sk = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const dueCalendarTime = (m: Member): number => {
      const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
      return d ? startOfDay(d).getTime() : Number.POSITIVE_INFINITY;
    };
    list.sort((a, b) => {
      if (sk === 'name') {
        const an = `${a.firstName} ${a.lastName || ''}`.toLowerCase();
        const bn = `${b.firstName} ${b.lastName || ''}`.toLowerCase();
        return an.localeCompare(bn) * dir;
      }
      // Due sort: ascending = earliest due first (most overdue / least days left at top).
      return (dueCalendarTime(a) - dueCalendarTime(b)) * dir;
    });
    return list;
  });

  /** Members in the current tab + status dropdown, before search / payment / due / onboarding filters. */
  readonly membersListBaselineCount = computed(() => {
    let list = [...this.members()];
    if (this.listMode() === 'active') {
      list = list.filter((m) => m.status === 'active');
    } else {
      list = list.filter((m) => m.status === 'inactive');
    }
    const sf = this.statusFilter();
    if (sf !== 'all') list = list.filter((m) => m.status === sf);
    return list.length;
  });

  /** Whether search/payment/due/onboarding (or their interaction) narrows the list from the baseline. */
  readonly membersFiltersNarrowing = computed(() => {
    const q = this.search().trim();
    const pf = this.payFilter();
    const due = this.dueSectionFilter();
    if (q.length > 0 || pf !== 'all' || (pf === 'all' && due !== 'all')) return true;
    if (this.onboardingReviewFilter() === 'review') return true;
    return this.displayMembers().length !== this.membersListBaselineCount();
  });

  /** Grouped sections (order fixed): overdue → today → 1d → 2d → future → unknown → inactive */
  readonly groupedMemberSections = computed(() => {
    const list = this.displayMembers();
    const buckets = new Map<DueBucket, Member[]>();
    const order: DueBucket[] = [
      'overdue',
      'dueToday',
      'oneDayLeft',
      'twoDaysLeft',
      'future',
      'unknown',
      'inactive',
    ];
    for (const k of order) buckets.set(k, []);

    const dueOf = (m: Member) => coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);

    for (const m of list) {
      const due = dueOf(m);
      const b = memberDueBucket(due, m.status === 'active');
      buckets.get(b)?.push(m);
    }

    const sortByDue = (a: Member, b: Member) => {
      const da = dueOf(a)?.getTime() ?? 0;
      const db = dueOf(b)?.getTime() ?? 0;
      return da - db;
    };
    const sortByName = (a: Member, b: Member) => {
      const an = `${a.firstName} ${a.lastName || ''}`.toLowerCase();
      const bn = `${b.firstName} ${b.lastName || ''}`.toLowerCase();
      return an.localeCompare(bn);
    };

    for (const k of order) {
      const arr = buckets.get(k) ?? [];
      if (k === 'inactive') arr.sort(sortByName);
      else arr.sort(sortByDue);
    }

    const titles: Record<DueBucket, string> = {
      overdue: 'Overdue',
      dueToday: 'Due today',
      oneDayLeft: '1 day remaining',
      twoDaysLeft: '2 days remaining',
      future: 'Upcoming',
      unknown: 'Due date missing',
      inactive: 'Inactive',
    };

    return order
      .map((bucket) => ({
        key: bucket,
        title: titles[bucket],
        members: buckets.get(bucket) ?? [],
      }))
      .filter((s) =>
        this.dueSectionFilter() === 'all'
          ? true
          : this.dueSectionFilter() === 'dueToday'
            ? s.key === 'dueToday'
            : s.key === 'overdue',
      )
      .filter((s) => s.members.length > 0);
  });

  // Pagination computed functions
  readonly totalPages = computed(() => Math.ceil(this.displayMembers().length / this.itemsPerPage));

  readonly membersPagedList = computed(() => {
    const list = this.displayMembers();
    const page = this.currentPage();
    const start = (page - 1) * this.itemsPerPage;
    return list.slice(start, start + this.itemsPerPage);
  });

  readonly visiblePageNumbers = computed(() => {
    const total = this.totalPages();
    const groupStart = this.pageGroupStart();
    const groupEnd = Math.min(groupStart + this.pagesPerGroup - 1, total);
    const pages: number[] = [];
    for (let i = groupStart; i <= groupEnd; i++) {
      pages.push(i);
    }
    return pages;
  });

  readonly canPrevPageGroup = computed(() => this.pageGroupStart() > 1);

  readonly canNextPageGroup = computed(() => {
    return this.pageGroupStart() + this.pagesPerGroup - 1 < this.totalPages();
  });

  readonly importValidCount = computed(() => {
    return this.importRows().filter((r) => r.valid).length;
  });

  readonly importInvalidCount = computed(() => {
    return this.importRows().filter((r) => !r.valid).length;
  });

  readonly memberForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.pattern(/^[^0-9]*$/)]],
    lastName: ['', [Validators.pattern(/^[^0-9]*$/)]],
    // Mobile is required so the member-onboarding share link can do mobile-match verification.
    // Stored value is digits-only (normalized); pasted +91 spacing is tolerated in the input.
    mobile: ['', [indianMemberMobileValidator()]],
    email: [''],
    address: [''],
    floorNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    roomNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    bedNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    gender: this.fb.control<'male' | 'female' | 'other' | ''>(''),
    aadhaarLast4: ['', optionalDigitsLen(12)],
    notes: [''],
    joinDate: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    dueDate: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/), dueDateAfterJoinDate()]],
    amount: [0, [Validators.required, positiveAmount()]],
    advancePaid: [0, [Validators.min(0)]],
    isPartialPayment: this.fb.nonNullable.control(false),
    paidAmount: [0],
    /** Rent paid toward plan when editing a member (pending = plan − this). */
    paidRent: [0, [Validators.min(0)]],
    pendingAmount: [0, [Validators.min(0)]],
    paymentMethod: this.fb.nonNullable.control<PaymentMethod>('cash', Validators.required),
    status: this.fb.nonNullable.control<'active' | 'inactive'>('active', Validators.required),
    subscriptionType: this.fb.nonNullable.control<'monthly' | 'quarterly' | 'yearly'>(
      'monthly',
      Validators.required,
    ),
  });

  readonly payForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, positiveAmount()]],
    currentPayingAmount: [0, [Validators.min(0)]],
    method: this.fb.nonNullable.control<PaymentMethod>('cash', Validators.required),
    subscriptionType: this.fb.nonNullable.control<SubscriptionType>('monthly', Validators.required),
    isPartialPayment: this.fb.nonNullable.control(false),
    moveDueToNextCycle: this.fb.nonNullable.control(false),
    pendingAmount: [0],
  });

  /** Photo URLs on the member record (Firebase download URLs after upload or when editing existing). */
  readonly profilePhotoUrl = signal<string>('');
  readonly aadhaarFrontUrl = signal<string>('');
  readonly aadhaarBackUrl = signal<string>('');
  /** In-memory file chosen in the modal; uploaded on save via `uploadOwnerPhoto`. */
  private readonly profilePhotoPendingFile = signal<File | null>(null);
  private readonly aadhaarFrontPendingFile = signal<File | null>(null);
  private readonly aadhaarBackPendingFile = signal<File | null>(null);
  /** `blob:` preview URLs for pending files (revoked when replaced or reset). */
  private readonly profilePhotoLocalPreview = signal<string | null>(null);
  private readonly aadhaarFrontLocalPreview = signal<string | null>(null);
  private readonly aadhaarBackLocalPreview = signal<string | null>(null);

  readonly profilePhotoPreview = computed(
    () => this.profilePhotoLocalPreview() ?? this.profilePhotoUrl() ?? '',
  );
  readonly aadhaarFrontPreview = computed(
    () => this.aadhaarFrontLocalPreview() ?? this.aadhaarFrontUrl() ?? '',
  );
  readonly aadhaarBackPreview = computed(
    () => this.aadhaarBackLocalPreview() ?? this.aadhaarBackUrl() ?? '',
  );

  readonly memberSavingBusy = signal<boolean>(false);
  /** After saving billing fields on edit, remind that Payments page holds receipt history. */
  readonly billingProfileReminderOpen = signal(false);

  /* ---------- share-link (member onboarding) state ---------- */
  readonly shareLinkOpen = signal<boolean>(false);
  readonly shareLinkMember = signal<Member | null>(null);
  readonly shareLinkUrl = signal<string>('');
  readonly shareLinkExpiresAt = signal<Date | null>(null);
  readonly shareLinkBusy = signal<boolean>(false);
  readonly shareLinkCopied = signal<boolean>(false);

  /** Pre–add-member QR / link (distinct from post-member onboarding share link). */
  readonly joinIntakeShareUrl = signal('');
  readonly joinIntakeExpiresAt = signal<Date | null>(null);
  readonly joinIntakeQrDataUrl = signal('');
  readonly joinIntakeBusy = signal(false);
  readonly joinIntakeError = signal(false);
  readonly joinIntakeCopied = signal(false);
  readonly joinIntakeCountdownLabel = signal('');
  readonly joinIntakeFromReview = signal(false);
  readonly joinIntakeTokenForSave = signal<string | null>(null);
  /** Token for the QR currently shown in Add member (live listener until submit or close). */
  readonly joinIntakeActiveToken = signal<string | null>(null);
  /** True once Firestore shows this invite is no longer `active` (member submitted, etc.). */
  readonly joinIntakeQrConsumed = signal(false);
  readonly pendingJoinIntakes = signal<MemberJoinIntake[]>([]);
  private joinIntakeListUnsub: (() => void) | null = null;
  private joinIntakeDocUnsub: (() => void) | null = null;
  private joinIntakeTickTimer: ReturnType<typeof setInterval> | null = null;
  private joinIntakeLiveToastDone = false;
  readonly receiptConfirmOpen = signal<boolean>(false);
  readonly receiptConfirmTarget = signal<ReceiptCandidate | null>(null);
  readonly receiptConfirmAmount = signal<number>(0);
  readonly receiptConfirmSending = signal<boolean>(false);
  private receiptConfirmOptions: {
    amount?: number;
    method?: PaymentMethod;
    paymentDate?: Date;
    pendingAmount?: number;
    pendingBeforeAmount?: number;
  } | null = null;
  private receiptConfirmResolver: ((ok: boolean) => void) | null = null;

  readonly deactivateConfirmOpen = signal(false);
  readonly deactivateConfirmMember = signal<Member | null>(null);
  readonly deactivateConfirmBusy = signal(false);
  private deactivateConfirmCheckboxRef: HTMLInputElement | null = null;

  private unsub: (() => void) | null = null;
  private querySub: Subscription | null = null;
  private currentOwnerId: string | null = null;
  private payFormSubscription: Subscription | null = null;
  private joinDateValueSub: Subscription | null = null;

  constructor() {
    // Sync cache signals to component signals
    effect(() => {
      this.members.set(this.cache.members());
    });

    effect(() => {
      this.pgLayout.set(this.cache.layout());
    });

    this.joinDateValueSub = this.memberForm.get('joinDate')?.valueChanges.subscribe(() => {
      if (!this.editingId()) {
        this.syncDueDateFromJoinDate();
      }
      this.memberForm.get('dueDate')?.updateValueAndValidity();
    }) ?? null;

    // Set up conditional validation for pendingAmount based on isPartialPayment
    this.payFormSubscription = this.payForm.get('isPartialPayment')?.valueChanges.subscribe((isPartial: boolean) => {
      const pendingAmountControl = this.payForm.get('pendingAmount');
      const currentPayingControl = this.payForm.get('currentPayingAmount');
      if (!pendingAmountControl || !currentPayingControl) return;

      this.updateCurrentPayingValidators(!!isPartial);
      if (isPartial) {
        const total = this.payModeTotalAmount();
        currentPayingControl.setValue(total, { emitEvent: false });
      } else {
        const rent = Math.max(0, Number(this.payForm.controls.amount.value) || 0);
        const pendingOnly =
          this.payEntryMode() === 'pendingOnly' && this.payTargetPendingAmount() > 0;
        const resetVal = pendingOnly ? this.payTargetPendingAmount() : rent;
        currentPayingControl.setValue(resetVal, { emitEvent: false });
      }
      this.syncPayFormPending();
      pendingAmountControl.setValidators([]);
      pendingAmountControl.updateValueAndValidity();
      currentPayingControl.updateValueAndValidity();
    }) ?? null;

    this.payForm.get('currentPayingAmount')?.valueChanges.subscribe(() => this.syncPayFormPending());
    this.payForm.get('amount')?.valueChanges.subscribe(() => {
      if (this.payForm.controls.isPartialPayment.value) {
        const maxP = this.payModeTotalAmount();
        const paying = Math.max(0, Number(this.payForm.controls.currentPayingAmount.value) || 0);
        if (paying > maxP) {
          this.payForm.controls.currentPayingAmount.setValue(maxP, { emitEvent: false });
        }
      }
      this.syncPayFormPending();
    });

    // Add-member partial payment controls: validate paid amount only when split payment is enabled.
    this.memberForm.get('isPartialPayment')?.valueChanges.subscribe((isPartial) => {
      const paidAmountControl = this.memberForm.get('paidAmount');
      if (!paidAmountControl) return;
      if (isPartial) {
        paidAmountControl.setValidators([Validators.required, positiveAmount()]);
      } else {
        paidAmountControl.setValidators([]);
      }
      paidAmountControl.updateValueAndValidity();
    });

    this.memberForm.get('amount')?.valueChanges.subscribe(() => this.syncMemberEditPendingFromPaidRent());
    this.memberForm.get('paidRent')?.valueChanges.subscribe(() => this.syncMemberEditPendingFromPaidRent());
  }

  async ngOnInit(): Promise<void> {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const search = params.get('search');
      if (search?.trim()) {
        this.search.set(search.trim());
      }

      const pay = params.get('pay');
      if (
        pay === 'all' ||
        pay === 'paid' ||
        pay === 'overdue' ||
        pay === 'dueSoon' ||
        pay === 'partial' ||
        pay === 'pending'
      ) {
        this.payFilter.set(pay);
      } else {
        this.payFilter.set('all');
      }

      const due = params.get('due');
      if (due === 'dueToday' || due === 'overdue' || due === 'dueSoon') {
        this.dueSectionFilter.set(due);
      } else {
        this.dueSectionFilter.set('all');
      }

      const onboarding = params.get('onboarding');
      this.onboardingReviewFilter.set(onboarding === 'review' ? 'review' : 'all');

      const joinToken = params.get('joinToken');
      if (joinToken?.trim()) {
        void this.openAddModalFromJoinTokenParam(joinToken.trim());
      }
    });
    const routePath = this.route.snapshot.routeConfig?.path;
    this.listMode.set(routePath === 'inactive-members' ? 'inactive' : 'active');

    await this.auth.refreshProfile();
    const id = this.auth.profile()?.ownerId;
    if (id) {
      this.currentOwnerId = id;
      try {
        await this.cache.loadMembers(id);
        await this.cache.loadLayout(id);
        
        // Scroll to searched member after data is loaded
        const searchParam = this.route.snapshot.queryParamMap.get('search');
        if (searchParam?.trim()) {
          this.scrollToSearchedMember(searchParam.trim());
        }
      } catch (error) {
        console.error('❌ Error loading members data:', error);
        this.toast.error('Failed to load members');
      }

      this.joinIntakeListUnsub?.();
      this.joinIntakeListUnsub = this.joinIntakeApi.watchSubmittedIntakes(id, (rows) => {
        this.pendingJoinIntakes.set(rows);
      });
    }
  }

  pageTitle(): string {
    return this.listMode() === 'inactive' ? 'Inactive Members' : 'Members';
  }

  pageSubtitle(): string {
    return this.listMode() === 'inactive'
      ? 'View all inactive members'
      : 'Manage your active members';
  }

  /** When editing, keep pending = plan − paid rent in sync for save + display. */
  private syncMemberEditPendingFromPaidRent(): void {
    if (!this.editingId()) return;
    const plan = Math.max(0, Math.round(Number(this.memberForm.controls.amount.value) || 0));
    let paid = Math.max(0, Math.round(Number(this.memberForm.controls.paidRent.value) || 0));
    if (paid > plan) {
      paid = plan;
      this.memberForm.controls.paidRent.setValue(paid, { emitEvent: false });
    }
    const pend = Math.max(0, plan - paid);
    this.memberForm.controls.pendingAmount.setValue(pend, { emitEvent: false });
  }

  /** Live plan / paid / pending for the edit-member billing preview strip. */
  memberEditBillingSummary(): { plan: number; paid: number; pending: number } {
    const v = this.memberForm.getRawValue();
    const plan = Math.max(0, Math.round(Number(v.amount) || 0));
    const paidRaw = Math.max(0, Math.round(Number(v.paidRent) || 0));
    const paid = Math.min(plan, paidRaw);
    const pending = Math.max(0, plan - paid);
    return { plan, paid, pending };
  }

  pendingFromForm(): number {
    const total = Number(this.memberForm.controls.amount.value) || 0;
    const paid = Number(this.memberForm.controls.paidAmount.value) || 0;
    return Math.max(0, total - paid);
  }

  /** Pending line when adding with split payment (computed from total − paying). */
  memberModalPendingAmountDisplay(): number {
    return this.pendingFromForm();
  }

  private setMemberModalBillingFieldsLocked(locked: boolean): void {
    const c = this.memberForm.controls;
    if (locked) {
      c.amount.disable({ emitEvent: false });
      c.advancePaid.disable({ emitEvent: false });
      c.isPartialPayment.disable({ emitEvent: false });
      c.paidAmount.disable({ emitEvent: false });
      c.paidRent.disable({ emitEvent: false });
      c.pendingAmount.disable({ emitEvent: false });
    } else {
      c.amount.enable({ emitEvent: false });
      c.advancePaid.enable({ emitEvent: false });
      c.isPartialPayment.enable({ emitEvent: false });
      c.paidAmount.enable({ emitEvent: false });
      c.paidRent.enable({ emitEvent: false });
      c.pendingAmount.enable({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.historyUnsub?.();
    this.querySub?.unsubscribe();
    this.payFormSubscription?.unsubscribe();
    this.joinDateValueSub?.unsubscribe();
    this.joinIntakeListUnsub?.();
    this.joinIntakeListUnsub = null;
    this.clearJoinIntakeModalSession();
    this.clearImportProgressUi();
    this.revokeAllMemberPhotoLocalPreviews();
  }

  /**
   * Manual refresh - forces re-fetch from Firestore
   */
  async refreshMembers(): Promise<void> {
    if (!this.currentOwnerId) return;
    try {
      await this.cache.refresh(this.currentOwnerId);
      this.toast.success('Members refreshed');
    } catch (error) {
      console.error('❌ Error refreshing members:', error);
      this.toast.error('Failed to refresh members');
    }
  }

  clearDueSectionFilter(): void {
    this.dueSectionFilter.set('all');
  }

  onPayFilterChange(raw: unknown): void {
    const value = String(raw ?? '');
    if (
      value === 'all' ||
      value === 'paid' ||
      value === 'overdue' ||
      value === 'dueSoon' ||
      value === 'partial' ||
      value === 'pending'
    ) {
      this.payFilter.set(value);
      // When user changes payment filter manually, clear dashboard deep-link due filter.
      this.dueSectionFilter.set('all');
      this.exitOnboardingReviewFilterMode();
      this.currentPage.set(1);
      this.pageGroupStart.set(1);
    }
  }

  /** Clears profile-review-only list mode and drops `onboarding` from the URL when it was set via deep link. */
  clearOnboardingReviewDeepLink(): void {
    this.exitOnboardingReviewFilterMode();
  }

  /** Used when the user changes payment filter manually so URL and list stay in sync. */
  private exitOnboardingReviewFilterMode(): void {
    const urlHad = this.route.snapshot.queryParamMap.get('onboarding') === 'review';
    const signalHad = this.onboardingReviewFilter() === 'review';
    if (!urlHad && !signalHad) return;
    this.onboardingReviewFilter.set('all');
    if (urlHad) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { onboarding: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      // Adjust page group if needed
      if (page < this.pageGroupStart()) {
        this.pageGroupStart.set(Math.max(1, Math.floor((page - 1) / this.pagesPerGroup) * this.pagesPerGroup + 1));
      } else if (page > this.pageGroupStart() + this.pagesPerGroup - 1) {
        this.pageGroupStart.set(page - this.pagesPerGroup + 1);
      }
    }
  }

  prevPageGroup(): void {
    const newStart = Math.max(1, this.pageGroupStart() - this.pagesPerGroup);
    this.pageGroupStart.set(newStart);
    const currentPage = this.currentPage();
    if (currentPage < newStart) {
      this.currentPage.set(newStart);
    }
  }

  nextPageGroup(): void {
    const total = this.totalPages();
    const newStart = Math.min(total - this.pagesPerGroup + 1, this.pageGroupStart() + this.pagesPerGroup);
    this.pageGroupStart.set(newStart);
    const currentPage = this.currentPage();
    if (currentPage < newStart) {
      this.currentPage.set(newStart);
    }
  }

  /** Shared “blank add member” form reset (new member only). */
  private prepareEmptyAddMemberForm(): void {
    this.editingId.set(null);
    this.moreOpen.set(false);
    this.memberForm.controls.joinDate.setValidators([
      Validators.required,
      Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
      joinDateNotInPast(),
    ]);
    this.memberForm.controls.joinDate.updateValueAndValidity({ emitEvent: false });
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 30);
    const fy = futureDate.getFullYear();
    const fm = String(futureDate.getMonth() + 1).padStart(2, '0');
    const fd = String(futureDate.getDate()).padStart(2, '0');
    this.memberForm.reset({
      firstName: '',
      lastName: '',
      mobile: '',
      email: '',
      address: '',
      floorNumber: '',
      roomNumber: '',
      bedNumber: '',
      gender: '',
      aadhaarLast4: '',
      notes: '',
      joinDate: `${y}-${m}-${d}`,
      dueDate: `${fy}-${fm}-${fd}`,
      amount: 0,
      advancePaid: 0,
      isPartialPayment: false,
      paidAmount: 0,
      paidRent: 0,
      pendingAmount: 0,
      status: 'active',
      subscriptionType: 'monthly',
    });
    this.resetOnboardingPhotoState();
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.setMemberModalBillingFieldsLocked(false);
  }

  openAdd(): void {
    if (!this.canAddMembersAction()) return;
    this.prepareEmptyAddMemberForm();
    this.joinIntakeFromReview.set(false);
    this.joinIntakeTokenForSave.set(null);
    this.clearJoinIntakeModalSession();
    this.modalOpen.set(true);
    void this.bootstrapJoinIntakeForAddModal();
    this.scheduleMemberMobileInputDisplayRefresh();
  }

  /** Open Add member from a submitted join-intake (QR / link flow). */
  openAddFromPendingJoinIntake(row: MemberJoinIntake): void {
    if (!this.canAddMembersAction()) return;
    if (row.status !== 'submitted') return;
    this.prepareEmptyAddMemberForm();
    const aan = (row.submissionAadhaarNumber || '').replace(/\D/g, '');
    this.memberForm.patchValue({
      firstName: (row.submissionFirstName || '').trim(),
      lastName: (row.submissionLastName || '').trim(),
      mobile: normalizeIndianMemberMobileDigits(row.submissionMobile || ''),
      address: (row.submissionAddress || '').trim(),
      aadhaarLast4: aan.length === 12 ? aan : '',
    });
    this.joinIntakeFromReview.set(true);
    this.joinIntakeTokenForSave.set(row.token);
    this.clearJoinIntakeModalSession();
    this.modalOpen.set(true);
    this.scheduleMemberMobileInputDisplayRefresh();
  }

  private detachJoinIntakeDocListener(): void {
    this.joinIntakeDocUnsub?.();
    this.joinIntakeDocUnsub = null;
    this.joinIntakeActiveToken.set(null);
  }

  private clearJoinIntakeModalSession(): void {
    this.detachJoinIntakeDocListener();
    this.joinIntakeQrConsumed.set(false);
    this.joinIntakeLiveToastDone = false;
    if (this.joinIntakeTickTimer) {
      clearInterval(this.joinIntakeTickTimer);
      this.joinIntakeTickTimer = null;
    }
    this.joinIntakeShareUrl.set('');
    this.joinIntakeExpiresAt.set(null);
    this.joinIntakeQrDataUrl.set('');
    this.joinIntakeBusy.set(false);
    this.joinIntakeError.set(false);
    this.joinIntakeCopied.set(false);
    this.joinIntakeCountdownLabel.set('');
  }

  private attachJoinIntakeDocListener(token: string): void {
    this.detachJoinIntakeDocListener();
    this.joinIntakeActiveToken.set(token);
    this.joinIntakeDocUnsub = this.joinIntakeApi.watchIntakeDoc(token, (row) => {
      if (!row) return;
      if (row.status !== 'active') {
        this.joinIntakeQrConsumed.set(true);
        if (this.joinIntakeTickTimer) {
          clearInterval(this.joinIntakeTickTimer);
          this.joinIntakeTickTimer = null;
        }
        if (row.status === 'submitted' && !this.joinIntakeLiveToastDone) {
          this.joinIntakeLiveToastDone = true;
          this.toast.success(this.i18n.t('members.joinIntakeLiveReceived'));
        }
      }
    });
  }

  /** Deep link from dashboard: `/members?joinToken=…` opens Add member prefilled from intake. */
  private async openAddModalFromJoinTokenParam(token: string): Promise<void> {
    const clearJoinTokenFromUrl = (): void => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { joinToken: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    };
    if (!this.canAddMembersAction()) {
      clearJoinTokenFromUrl();
      return;
    }
    if (this.listMode() !== 'active') {
      this.toast.success(this.i18n.t('members.joinIntakeSwitchToActiveList'));
      clearJoinTokenFromUrl();
      return;
    }
    try {
      const row = await this.joinIntakeApi.readIntake(token);
      const ownerId = this.auth.profile()?.ownerId;
      if (!ownerId || row.ownerId !== ownerId) {
        this.toast.error(this.i18n.t('members.joinIntakeTokenWrongOwner'));
        clearJoinTokenFromUrl();
        return;
      }
      if (row.status !== 'submitted') {
        this.toast.success(this.i18n.t('members.joinIntakeTokenNotPending'));
        clearJoinTokenFromUrl();
        return;
      }
      this.openAddFromPendingJoinIntake(row);
      clearJoinTokenFromUrl();
    } catch {
      this.toast.error(this.i18n.t('members.joinIntakeTokenOpenError'));
      clearJoinTokenFromUrl();
    }
  }

  private updateJoinIntakeCountdown(): void {
    const exp = this.joinIntakeExpiresAt();
    if (!exp) {
      this.joinIntakeCountdownLabel.set('');
      return;
    }
    const ms = exp.getTime() - Date.now();
    if (ms <= 0) {
      this.joinIntakeCountdownLabel.set('0:00');
      return;
    }
    const totalSec = Math.floor(ms / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    this.joinIntakeCountdownLabel.set(`${mm}:${String(ss).padStart(2, '0')}`);
  }

  private async bootstrapJoinIntakeForAddModal(): Promise<void> {
    if (this.editingId()) return;
    if (this.joinIntakeFromReview()) return;
    this.joinIntakeBusy.set(true);
    this.joinIntakeError.set(false);
    try {
      const { token, url, expiresAt } = await this.joinIntakeApi.createIntake();
      this.joinIntakeLiveToastDone = false;
      this.attachJoinIntakeDocListener(token);
      this.joinIntakeShareUrl.set(url);
      this.joinIntakeExpiresAt.set(expiresAt);
      this.updateJoinIntakeCountdown();
      if (this.joinIntakeTickTimer) clearInterval(this.joinIntakeTickTimer);
      this.joinIntakeTickTimer = setInterval(() => this.updateJoinIntakeCountdown(), 1000);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
        color: { dark: '#1e1b4b', light: '#ffffff' },
      });
      this.joinIntakeQrDataUrl.set(dataUrl);
    } catch {
      this.joinIntakeError.set(true);
      this.toast.error(this.i18n.t('members.joinIntakeQrError'));
    } finally {
      this.joinIntakeBusy.set(false);
    }
  }

  async retryBootstrapJoinIntake(): Promise<void> {
    await this.bootstrapJoinIntakeForAddModal();
  }

  async copyJoinIntakeLink(): Promise<void> {
    const url = this.joinIntakeShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.joinIntakeCopied.set(true);
      this.toast.success(this.i18n.t('members.joinIntakeCopied'));
      setTimeout(() => this.joinIntakeCopied.set(false), 2200);
    } catch {
      this.toast.error('Could not copy. Long-press the link to copy manually.');
    }
  }

  joinIntakeWhatsAppHref(): string | null {
    const url = this.joinIntakeShareUrl();
    if (!url) return null;
    const host =
      this.auth.profile()?.businessName?.trim() ||
      this.auth.profile()?.name?.trim() ||
      this.i18n.t('brand.paybook');
    const msg = this.i18n.t('joinIntake.whatsappMsg', { host, url });
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  async dismissPendingJoinIntake(row: MemberJoinIntake): Promise<void> {
    if (!this.canAddMembersAction()) return;
    if (!confirm('Dismiss this request? You can still add the member manually.')) return;
    try {
      await this.joinIntakeApi.dismissIntake(row.token);
      this.toast.success('Request dismissed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not dismiss';
      this.toast.error(msg);
    }
  }

  openEdit(m: Member): void {
    if (!this.canEditMembersAction()) return;
    this.editingId.set(m.memberId);
    this.memberForm.controls.joinDate.setValidators([Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]);
    this.memberForm.controls.joinDate.updateValueAndValidity({ emitEvent: false });
    this.moreOpen.set(!!(m.gender || m.aadhaarLast4 || m.notes));
    const jd = timestampToDate(m.joinDate);
    const joinStr = jd ? this.toInputDate(jd) : '';
    const dd = timestampToDate(m.dueDate);
    const dueStr = dd ? this.toInputDate(dd) : '';
    const plan = Math.max(0, Number(m.amount) || 0);
    const pending = Math.max(0, Number(m.pendingAmount) || 0);
    const rawPaid = m.paidRent;
    const paidRentVal =
      rawPaid !== undefined && rawPaid !== null && Number.isFinite(Number(rawPaid))
        ? Math.max(0, Math.min(plan, Math.round(Number(rawPaid))))
        : Math.max(0, plan - pending);
    this.memberForm.patchValue({
      firstName: m.firstName,
      lastName: m.lastName || '',
      mobile: normalizeIndianMemberMobileDigits(m.mobile || ''),
      email: m.email || '',
      address: m.address || '',
      floorNumber: String(m.floorNumber || '').replace(/\D/g, ''),
      roomNumber: String(m.roomNumber || '').replace(/\D/g, ''),
      bedNumber: String(m.bedNumber || '').replace(/\D/g, ''),
      gender: (m.gender as 'male' | 'female' | 'other' | undefined) || '',
      aadhaarLast4: m.aadhaarNumber || m.aadhaarLast4 || '',
      notes: m.notes || '',
      joinDate: joinStr,
      dueDate: dueStr,
      amount: m.amount,
      advancePaid: Math.max(0, Number(m.advancePaid) || 0),
      isPartialPayment: false,
      paidAmount: 0,
      paidRent: paidRentVal,
      pendingAmount: Math.max(0, plan - paidRentVal),
      paymentMethod: 'cash',
      status: m.status,
      subscriptionType: m.subscriptionType || 'monthly',
    });
    this.resetOnboardingPhotoState();
    this.profilePhotoUrl.set(m.profilePhotoUrl || '');
    this.aadhaarFrontUrl.set(m.aadhaarFrontUrl || '');
    this.aadhaarBackUrl.set(m.aadhaarBackUrl || '');
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.setMemberModalBillingFieldsLocked(false);
    this.modalOpen.set(true);
    this.scheduleMemberMobileInputDisplayRefresh();
    this.memberForm.markAsPristine();
  }

  closeModal(): void {
    this.clearJoinIntakeModalSession();
    this.joinIntakeFromReview.set(false);
    this.joinIntakeTokenForSave.set(null);
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.resetOnboardingPhotoState();
    this.setMemberModalBillingFieldsLocked(false);
    this.modalOpen.set(false);
  }

  closeBillingProfileReminder(): void {
    this.billingProfileReminderOpen.set(false);
  }

  goToPaymentsFromBillingReminder(): void {
    this.billingProfileReminderOpen.set(false);
    void this.router.navigateByUrl('/payments');
  }

  /** Native date input `min` when adding (today); omitted when editing so past joins stay valid. */
  memberJoinDateInputMinIso(): string | null {
    return this.editingId() ? null : this.toInputDate(startOfToday());
  }

  /** End date cannot be before join (native picker + validator). */
  memberDueDateInputMinIso(): string | null {
    const j = (this.memberForm.controls.joinDate.value ?? '').trim();
    if (!j || !/^\d{4}-\d{2}-\d{2}$/.test(j)) return null;
    return j;
  }

  memberJoinDateDdMmHint(): string {
    return formatYyyyMmDdAsDdMmYyyy(this.memberForm.controls.joinDate.value || '');
  }

  memberDueDateDdMmHint(): string {
    return formatYyyyMmDdAsDdMmYyyy(this.memberForm.controls.dueDate.value || '');
  }

  onMemberJoinDatePickerChange(): void {
    this.memberForm.controls.joinDate.markAsTouched();
  }

  onMemberDueDatePickerChange(): void {
    this.memberForm.controls.dueDate.markAsTouched();
  }

  private syncDueDateFromJoinDate(): void {
    if (this.editingId()) return;
    const iso = (this.memberForm.controls.joinDate.value ?? '').trim();
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const join = parseYyyyMmDdLocal(iso);
    if (!join) return;
    const dueIso = this.toInputDate(addDays(join, 30));
    this.memberForm.patchValue({ dueDate: dueIso }, { emitEvent: true });
  }

  private resetOnboardingPhotoState(): void {
    this.revokeAllMemberPhotoLocalPreviews();
    this.profilePhotoPendingFile.set(null);
    this.aadhaarFrontPendingFile.set(null);
    this.aadhaarBackPendingFile.set(null);
    this.profilePhotoLocalPreview.set(null);
    this.aadhaarFrontLocalPreview.set(null);
    this.aadhaarBackLocalPreview.set(null);
    this.profilePhotoUrl.set('');
    this.aadhaarFrontUrl.set('');
    this.aadhaarBackUrl.set('');
  }

  private revokeAllMemberPhotoLocalPreviews(): void {
    for (const u of [
      this.profilePhotoLocalPreview(),
      this.aadhaarFrontLocalPreview(),
      this.aadhaarBackLocalPreview(),
    ]) {
      if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
    }
  }

  private revokeMemberPhotoLocalPreview(kind: OnboardingPhotoKind): void {
    const u =
      kind === 'profile'
        ? this.profilePhotoLocalPreview()
        : kind === 'aadhaarFront'
          ? this.aadhaarFrontLocalPreview()
          : this.aadhaarBackLocalPreview();
    if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
  }

  onMemberPhotoSelected(kind: OnboardingPhotoKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!(MEMBER_MODAL_PHOTO_MIMES as readonly string[]).includes(file.type)) {
      this.toast.error('Only JPG / PNG / WEBP images are allowed.');
      input.value = '';
      return;
    }
    if (file.size > MEMBER_MODAL_PHOTO_MAX_BYTES) {
      this.toast.error('Image too large. Use an image under 5 MB.');
      input.value = '';
      return;
    }
    this.revokeMemberPhotoLocalPreview(kind);
    const objectUrl = URL.createObjectURL(file);
    if (kind === 'profile') {
      this.profilePhotoPendingFile.set(file);
      this.profilePhotoLocalPreview.set(objectUrl);
    } else if (kind === 'aadhaarFront') {
      this.aadhaarFrontPendingFile.set(file);
      this.aadhaarFrontLocalPreview.set(objectUrl);
    } else {
      this.aadhaarBackPendingFile.set(file);
      this.aadhaarBackLocalPreview.set(objectUrl);
    }
    this.memberForm.markAsDirty();
    input.value = '';
  }

  removeMemberPhoto(kind: OnboardingPhotoKind): void {
    this.revokeMemberPhotoLocalPreview(kind);
    if (kind === 'profile') {
      this.profilePhotoPendingFile.set(null);
      this.profilePhotoLocalPreview.set(null);
      this.profilePhotoUrl.set('');
    } else if (kind === 'aadhaarFront') {
      this.aadhaarFrontPendingFile.set(null);
      this.aadhaarFrontLocalPreview.set(null);
      this.aadhaarFrontUrl.set('');
    } else {
      this.aadhaarBackPendingFile.set(null);
      this.aadhaarBackLocalPreview.set(null);
      this.aadhaarBackUrl.set('');
    }
    this.memberForm.markAsDirty();
  }

  /** Upload pending files from the add/edit modal; updates URL signals and clears pending state. */
  private async uploadPendingOwnerPhotosIfAny(memberId: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    const upload = (kind: OnboardingPhotoKind, file: File | null, setUrl: (u: string) => void) => {
      if (!file) return;
      tasks.push(
        (async () => {
          const url = await this.onboardingApi.uploadOwnerPhoto(memberId, kind, file);
          setUrl(url);
          this.revokeMemberPhotoLocalPreview(kind);
          if (kind === 'profile') {
            this.profilePhotoPendingFile.set(null);
            this.profilePhotoLocalPreview.set(null);
          } else if (kind === 'aadhaarFront') {
            this.aadhaarFrontPendingFile.set(null);
            this.aadhaarFrontLocalPreview.set(null);
          } else {
            this.aadhaarBackPendingFile.set(null);
            this.aadhaarBackLocalPreview.set(null);
          }
        })(),
      );
    };
    upload('profile', this.profilePhotoPendingFile(), (u) => this.profilePhotoUrl.set(u));
    upload('aadhaarFront', this.aadhaarFrontPendingFile(), (u) => this.aadhaarFrontUrl.set(u));
    upload('aadhaarBack', this.aadhaarBackPendingFile(), (u) => this.aadhaarBackUrl.set(u));
    if (tasks.length) await Promise.all(tasks);
  }

  /** @returns whether the server update succeeded */
  async toggleMemberStatus(m: Member, enabled: boolean): Promise<boolean> {
    const nextStatus: Member['status'] = enabled ? 'active' : 'inactive';
    if (m.status === nextStatus) return true;
    try {
      await this.membersApi.updateMemberStatus(m.memberId, nextStatus);
      this.toast.success(`Member marked as ${nextStatus}`);
      return true;
    } catch {
      this.toast.error('Could not update member status');
      return false;
    }
  }

  memberConfirmDisplayName(m: Member): string {
    const n = `${m.firstName} ${m.lastName}`.trim();
    return n || this.i18n.t('members.thisMember');
  }

  private openDeactivateConfirm(m: Member, checkbox?: HTMLInputElement): void {
    this.deactivateConfirmCheckboxRef = checkbox ?? null;
    this.deactivateConfirmMember.set(m);
    this.deactivateConfirmOpen.set(true);
  }

  cancelDeactivateMember(): void {
    if (this.deactivateConfirmBusy()) return;
    const input = this.deactivateConfirmCheckboxRef;
    if (input) input.checked = true;
    this.deactivateConfirmCheckboxRef = null;
    this.deactivateConfirmMember.set(null);
    this.deactivateConfirmOpen.set(false);
  }

  onDeactivateModalDismiss(): void {
    this.cancelDeactivateMember();
  }

  async confirmDeactivateMember(): Promise<void> {
    const m = this.deactivateConfirmMember();
    const input = this.deactivateConfirmCheckboxRef;
    if (!m || this.deactivateConfirmBusy()) return;
    this.deactivateConfirmBusy.set(true);
    const ok = await this.toggleMemberStatus(m, false);
    this.deactivateConfirmBusy.set(false);
    this.deactivateConfirmCheckboxRef = null;
    this.deactivateConfirmMember.set(null);
    this.deactivateConfirmOpen.set(false);
    if (!ok && input) input.checked = true;
  }

  /** Mobile card: open confirm modal, then deactivate. */
  requestDeactivateMember(m: Member): void {
    if (!this.canEditMembersAction()) return;
    if (m.status !== 'active') return;
    this.openDeactivateConfirm(m);
  }

  /**
   * Active checkbox (table / desktop card): custom confirm before deactivating; revert control if cancelled or API fails.
   */
  async onMemberActiveCheckboxChange(m: Member, ev: Event): Promise<void> {
    if (!this.canEditMembersAction()) return;
    const input = ev.target as HTMLInputElement;
    const wantActive = input.checked;
    if (!wantActive && m.status === 'active') {
      this.openDeactivateConfirm(m, input);
      return;
    }
    const ok = await this.toggleMemberStatus(m, wantActive);
    if (!ok) input.checked = m.status === 'active';
  }

  /** Add member: normal Save. Edit member: Save only after something changed (no accidental no-op submit). */
  memberModalSaveDisabled(): boolean {
    if (this.memberSavingBusy()) return true;
    if (this.memberForm.invalid) return true;
    if (this.editingId() && !this.memberForm.dirty) return true;
    return false;
  }

  async saveMember(): Promise<void> {
    // Guard against rapid double-clicks on Save (which can also record a partial payment).
    if (this.memberSavingBusy()) return;

    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }
    if (this.editingId() && !this.memberForm.dirty) {
      return;
    }
    const v = this.memberForm.getRawValue();
    const mobileStored = normalizeIndianMemberMobileDigits(v.mobile);
    if (this.hasSeatLayout()) {
      const seatIssue = this.getSeatAvailabilityIssue(v.floorNumber, v.roomNumber, v.bedNumber);
      if (seatIssue) {
        this.manualSeatError.set(seatIssue);
        this.toast.error(seatIssue);
        return;
      }
    }
    const join = new Date(v.joinDate + 'T12:00:00');
    const due = new Date(v.dueDate + 'T12:00:00');
    const editId = this.editingId();

    let newAmount: number;
    let paidAmount: number;
    let pendingAmount: number;
    let advancePaidVal: number;
    let paidRentSave: number;

    if (editId) {
      newAmount = Math.max(1, Math.round(Number(v.amount)) || 0);
      advancePaidVal = Math.max(0, Number(v.advancePaid) || 0);
      paidRentSave = Math.max(0, Math.round(Number(v.paidRent)) || 0);
      if (paidRentSave > newAmount) paidRentSave = newAmount;
      pendingAmount = Math.max(0, newAmount - paidRentSave);
      paidAmount = 0;
    } else {
      newAmount = Number(v.amount);
      advancePaidVal = Math.max(0, Number(v.advancePaid) || 0);
      const isPartial = !!v.isPartialPayment;
      paidAmount = isPartial ? Number(v.paidAmount) : newAmount;
      pendingAmount = isPartial ? Math.max(0, newAmount - paidAmount) : 0;
      paidRentSave = isPartial ? Math.max(0, Math.round(Number(paidAmount)) || 0) : Math.max(0, Math.round(Number(newAmount)) || 0);
      if (paidRentSave > newAmount) paidRentSave = newAmount;
      if (isPartial) {
        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
          this.toast.error('Enter a valid current paying amount');
          return;
        }
        if (paidAmount > newAmount) {
          this.toast.error('Current paying amount cannot be greater than total amount');
          return;
        }
      }
    }
    // The "Aadhaar number" field accepts up to 12 digits. We store both:
    //  - aadhaarLast4 (existing column, kept for backward-compat with older rows)
    //  - aadhaarNumber (new column, full value when 12 digits provided)
    const aadhaarRaw = (v.aadhaarLast4 || '').replace(/\D/g, '');
    const aadhaarNumberFull = aadhaarRaw.length === 12 ? aadhaarRaw : '';
    const aadhaarTail = aadhaarRaw.length >= 4 ? aadhaarRaw.slice(-4) : aadhaarRaw;

    const baseInput = {
      firstName: v.firstName,
      lastName: v.lastName || undefined,
      mobile: mobileStored || undefined,
      email: v.email || undefined,
      address: v.address || undefined,
      floorNumber: v.floorNumber,
      roomNumber: v.roomNumber,
      bedNumber: v.bedNumber,
      gender: v.gender || undefined,
      aadhaarLast4: aadhaarTail || undefined,
      aadhaarNumber: aadhaarNumberFull || undefined,
      notes: v.notes || undefined,
      joinDate: join,
      dueDate: due,
      amount: newAmount,
      advancePaid: advancePaidVal,
      paidRent: paidRentSave,
      paidAmount,
      pendingAmount,
      paymentMethod: v.paymentMethod,
      recordPaymentOnUpdate: false,
      status: v.status,
      subscriptionType: this.isGym() ? v.subscriptionType : undefined,
    };

    const remindPaymentsAfterProfileBillingSave =
      !!editId &&
      (this.memberForm.controls.amount.dirty ||
        this.memberForm.controls.paidRent.dirty ||
        this.memberForm.controls.advancePaid.dirty);

    this.memberSavingBusy.set(true);
    try {
      const id = this.editingId();
      let memberId = id;
      if (id) {
        await this.uploadPendingOwnerPhotosIfAny(id);
        await this.membersApi.updateMember(id, {
          ...baseInput,
          profilePhotoUrl: this.profilePhotoUrl(),
          aadhaarFrontUrl: this.aadhaarFrontUrl(),
          aadhaarBackUrl: this.aadhaarBackUrl(),
        });
        this.cache.patchMemberLocal(id, {
          firstName: v.firstName.trim(),
          lastName: v.lastName?.trim() || '',
          mobile: mobileStored || '',
          email: v.email?.trim() || '',
          address: v.address?.trim() || '',
          floorNumber: v.floorNumber.trim(),
          roomNumber: v.roomNumber.trim(),
          bedNumber: v.bedNumber.trim(),
          gender: (v.gender as Member['gender']) || undefined,
          aadhaarLast4: aadhaarTail || undefined,
          aadhaarNumber: aadhaarNumberFull || undefined,
          notes: v.notes?.trim() || '',
          joinDate: dateToTimestamp(join),
          dueDate: dateToTimestamp(due),
          amount: newAmount,
          advancePaid: advancePaidVal,
          paidRent: paidRentSave,
          pendingAmount,
          status: v.status,
          subscriptionType: this.isGym() ? v.subscriptionType : 'monthly',
          profilePhotoUrl: this.profilePhotoUrl().trim(),
          aadhaarFrontUrl: this.aadhaarFrontUrl().trim(),
          aadhaarBackUrl: this.aadhaarBackUrl().trim(),
        });
        this.toast.success('Member updated');
        this.notifyOwnerAction('Member updated', `${v.firstName} profile updated successfully.`);
      } else {
        // CREATE: first create the doc (we need its id for storage paths), then upload
        // any photos and write the URLs back. If owner provided no images, we skip the
        // second update entirely and the legacy create path runs unchanged.
        memberId = await this.membersApi.addMember({
          ...baseInput,
          profilePhotoUrl: this.profilePhotoUrl().trim(),
          aadhaarFrontUrl: this.aadhaarFrontUrl().trim(),
          aadhaarBackUrl: this.aadhaarBackUrl().trim(),
        });
        const intakeTok = this.joinIntakeTokenForSave();
        if (intakeTok && memberId) {
          try {
            await this.joinIntakeApi.markCompleted(intakeTok, memberId);
          } catch {
            this.toast.error('Member was saved but the join request could not be marked complete. You can dismiss it from the list.');
          }
        }
        this.joinIntakeTokenForSave.set(null);
        if (memberId) {
          await this.uploadPendingOwnerPhotosIfAny(memberId);
          const pu = this.profilePhotoUrl().trim();
          const fu = this.aadhaarFrontUrl().trim();
          const bu = this.aadhaarBackUrl().trim();
          if (pu || fu || bu) {
            await this.membersApi.updateMember(memberId, {
              ...baseInput,
              profilePhotoUrl: pu,
              aadhaarFrontUrl: fu,
              aadhaarBackUrl: bu,
            });
          }
        }
        this.toast.success('Member added');
        this.notifyOwnerAction('Member added', `${v.firstName} added successfully.`);
        if (memberId && paidAmount > 0) {
          const receiptTarget: ReceiptCandidate = {
            memberId,
            ownerId: this.auth.profile()?.ownerId || '',
            firstName: v.firstName,
            lastName: v.lastName || '',
            mobile: mobileStored || '',
            amount: newAmount,
            pendingAmount,
          };
          await this.promptSendReceiptNow(receiptTarget, {
            amount: paidAmount,
            method: v.paymentMethod,
            paymentDate: new Date(),
            pendingAmount,
            pendingBeforeAmount: 0,
          });
        }
      }
      this.closeModal();
      if (remindPaymentsAfterProfileBillingSave) {
        this.billingProfileReminderOpen.set(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (msg.includes('approved by admin')) {
        this.toast.error(msg);
      } else if (code === 'permission-denied' || msg.includes('permission-denied') || msg.toLowerCase().includes('insufficient permissions')) {
        this.toast.error(
          'Permission denied. Your account must be an approved owner, and Firestore rules must allow members writes and owners/{yourUid}/complaintMemberMobiles for approved owners.',
        );
      } else {
        this.toast.error(msg || 'Could not save member');
      }
    } finally {
      this.memberSavingBusy.set(false);
    }
  }

  /* ========================================================================
   *                    MEMBER SELF-ONBOARDING (SHARE LINK)
   * ======================================================================== */

  /** Member submitted via share link; owner must approve before it becomes the live profile. */
  hasPendingSelfOnboardingReview(m: Member): boolean {
    return Boolean(m.pendingSelfOnboarding);
  }

  /** True when this member still needs to fill missing self-onboarding info. */
  needsSelfOnboarding(m: Member): boolean {
    if (m.selfOnboardingStatus === 'completed') return false;
    if (m.pendingSelfOnboarding) return false;
    return !m.profilePhotoUrl || !m.aadhaarFrontUrl || !m.aadhaarBackUrl;
  }

  readonly onboardingReviewBusyId = signal<string | null>(null);

  async approvePendingOnboarding(m: Member): Promise<void> {
    if (!this.canEditMembersAction()) return;
    this.onboardingReviewBusyId.set(m.memberId);
    try {
      await this.membersApi.approvePendingSelfOnboarding(m.memberId);
      this.toast.success('Submission approved and saved to the member profile.');
      this.closeDetails();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not approve';
      this.toast.error(msg);
    } finally {
      this.onboardingReviewBusyId.set(null);
    }
  }

  async rejectPendingOnboarding(m: Member): Promise<void> {
    if (!this.canEditMembersAction()) return;
    if (!confirm('Reject this submission? The member will need a new share link to try again.')) return;
    this.onboardingReviewBusyId.set(m.memberId);
    try {
      await this.membersApi.rejectPendingSelfOnboarding(m.memberId);
      this.toast.success('Submission rejected. You can share a new link.');
      this.closeDetails();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reject';
      this.toast.error(msg);
    } finally {
      this.onboardingReviewBusyId.set(null);
    }
  }

  /**
   * Granular member-mutation permissions.
   *
   * Owners/admins always pass; supervisors are gated by per-account flags.
   * `canEditMembersAction` is the *broad* "can change member data" gate used
   * by the member edit modal save and the self-onboarding approval flow —
   * it's true if the supervisor has either Edit or Add (because creating a
   * member then editing it is essentially the same right). Add and Delete
   * have their own dedicated gates so the owner can grant them
   * independently in the supervisor edit modal.
   */
  readonly canAddMembersAction = computed(() => this.auth.hasPermission('canAddMembers'));
  readonly canEditMembersAction = computed(
    () => this.auth.hasPermission('canEditMembers') || this.auth.hasPermission('canAddMembers'),
  );
  readonly canDeleteMembersAction = computed(() => this.auth.hasPermission('canDeleteMembers'));
  /** Whether the current account can share onboarding links. */
  readonly canShareOnboardingLinkAction = computed(() =>
    this.auth.hasPermission('canShareOnboardingLink'),
  );
  /** Open Payments route (receipts / collection table). */
  readonly canViewPaymentsAction = computed(() => this.auth.hasPermission('canViewPayments'));
  /** Whether the current account can record payments ("Mark Paid"). */
  readonly canRecordPaymentsAction = computed(() => this.auth.hasPermission('canRecordPayments'));

  /** True when an onboarding share link can be issued (mobile is the second factor). */
  canShareOnboardingLink(m: Member): boolean {
    return Boolean(m.mobile && m.mobile.replace(/\D/g, '').length === 10);
  }

  async openShareLink(m: Member): Promise<void> {
    if (!this.canShareOnboardingLink(m)) {
      this.toast.error("Add the member's 10-digit mobile number first.");
      return;
    }
    this.shareLinkMember.set(m);
    this.shareLinkOpen.set(true);
    this.shareLinkBusy.set(true);
    this.shareLinkUrl.set('');
    this.shareLinkExpiresAt.set(null);
    this.shareLinkCopied.set(false);
    try {
      const { url, expiresAt } = await this.onboardingApi.generateLink(m);
      this.shareLinkUrl.set(url);
      this.shareLinkExpiresAt.set(expiresAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate link';
      this.toast.error(msg);
      this.shareLinkOpen.set(false);
    } finally {
      this.shareLinkBusy.set(false);
    }
  }

  closeShareLink(): void {
    this.shareLinkOpen.set(false);
    this.shareLinkMember.set(null);
    this.shareLinkUrl.set('');
    this.shareLinkExpiresAt.set(null);
    this.shareLinkCopied.set(false);
  }

  async copyShareLink(): Promise<void> {
    const url = this.shareLinkUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.shareLinkCopied.set(true);
      this.toast.success('Link copied to clipboard');
      setTimeout(() => this.shareLinkCopied.set(false), 2500);
    } catch {
      this.toast.error('Could not copy. Long-press the link to copy manually.');
    }
  }

  /** Build a WhatsApp share URL prefilled with the onboarding link. */
  whatsappShareLink(): string | null {
    const m = this.shareLinkMember();
    const url = this.shareLinkUrl();
    if (!m || !url) return null;
    const mobile = (m.mobile || '').replace(/\D/g, '');
    if (mobile.length !== 10) return null;
    
    const ownerProfile = this.auth.profile();
    const pgName = ownerProfile?.businessName?.trim() || ownerProfile?.name || 'PayBook';
    const shareCount = (m.onboardingLinkShareCount || 0) + 1; // Current share count
    
    let msg = '';
    
    if (shareCount === 1) {
      // First time message
      msg = `Hi ${m.firstName} ${m.lastName || ''}

This msg from ${pgName}

Please use below link to update your profile with ${pgName}

Make sure you are entering details are valid to avoid reminder 😊

${url}

Thanks regards,
${pgName}`;
    } else {
      // Second time onwards message
      msg = `Hi ${m.firstName} ${m.lastName || ''} this is ${shareCount}${this.getNumberSuffix(shareCount)} time we are sending link to you from ${pgName}

From old data you provided was something wrong details or photo you sent please send correctly 😒

This msg from ${pgName}

Please use below link to update your profile with ${pgName}

Make sure you are entering details are valid to avoid reminder 😊

${url}

Thanks regards,
${pgName}`;
    }
    
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  }

  /** Helper method to get number suffix (1st, 2nd, 3rd, 4th, etc.) */
  private getNumberSuffix(num: number): string {
    const lastDigit = num % 10;
    const lastTwoDigits = num % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
      return 'th';
    }
    
    switch (lastDigit) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  async deleteMember(m: Member): Promise<void> {
    if (!this.canDeleteMembersAction()) return;
    if (!confirm(`Remove ${m.firstName} from your list?`)) return;
    try {
      await this.membersApi.deleteMember(m.memberId);
      this.toast.success('Member removed');
    } catch {
      this.toast.error('Could not delete');
    }
  }

  openPayPendingOnly(m: Member): void {
    this.openPayInternal(m, 'pendingOnly');
  }

  openPay(m: Member): void {
    this.openPayInternal(m, 'standard');
  }

  private openPayInternal(m: Member, mode: 'standard' | 'pendingOnly'): void {
    this.payTarget.set(m);
    this.payEntryMode.set(mode);
    const pending = Math.max(0, Number(m.pendingAmount) || 0);
    const plan = Math.max(0, Number(m.amount) || 0);
    const defaultAmount = mode === 'pendingOnly' && pending > 0 ? pending : plan;
    this.payForm.reset({
      amount: defaultAmount,
      currentPayingAmount: defaultAmount,
      method: 'cash',
      subscriptionType: m.subscriptionType ?? 'monthly',
      isPartialPayment: false,
      moveDueToNextCycle: false,
      pendingAmount: Math.max(0, plan - defaultAmount),
    });
    this.syncPayFormPending();
    this.updateCurrentPayingValidators(!!this.payForm.controls.isPartialPayment.value);
    this.payModalOpen.set(true);
  }

  /**
   * Close the pay modal.
   * - User-initiated closes (Cancel button, X button) pass `force=false`
   *   and are blocked while a payment write is in flight.
   * - System-initiated closes from `submitPay()` after success pass `force=true`
   *   so the modal always closes the moment the payment lands.
   */
  closePay(force = false): void {
    if (!force && this.paymentSubmitting()) return;
    this.payModalOpen.set(false);
    this.payTarget.set(null);
    this.payEntryMode.set('standard');
  }

  async submitPay(): Promise<void> {
    // Guard: drop any rapid/double/triple submits while a request is in flight.
    if (this.paymentSubmitting()) return;

    if (this.payForm.invalid) {
      this.payForm.markAllAsTouched();
      return;
    }

    const m = this.payTarget();
    const owner = this.auth.profile();
    if (!m || !owner) return;

    const due = timestampToDate(m.dueDate);
    if (!due) {
      this.toast.error('Invalid due date');
      return;
    }

    const v = this.payForm.getRawValue();

    const priorPending = Math.max(0, Number(m.pendingAmount) || 0);
    const planAmount = Math.max(0, Number(m.amount) || 0);

    const enteredAmount = Math.max(0, Number(v.amount) || 0);
    const currentPayingAmount = Math.max(0, Number(v.currentPayingAmount) || 0);
    const isPendingOnly = this.payEntryMode() === 'pendingOnly' && priorPending > 0;
    const totalCollectibleStandard = isPendingOnly
      ? priorPending
      : priorPending > 0
        ? enteredAmount + priorPending
        : enteredAmount;
    const computedPending = Math.max(0, totalCollectibleStandard - currentPayingAmount);
    if (v.isPartialPayment) {
      if (!Number.isFinite(Number(v.currentPayingAmount)) || Number(v.currentPayingAmount) <= 0) {
        this.toast.error('Enter current paying amount for partial payment');
        return;
      }
      if (currentPayingAmount > totalCollectibleStandard) {
        this.toast.error('Enter a valid current paying amount');
        return;
      }
    }
      const paymentAmount = v.isPartialPayment
      ? currentPayingAmount
      : isPendingOnly
        ? priorPending
        : enteredAmount + priorPending;
    const effectivePlanAmount = v.isPartialPayment
      ? planAmount
      : isPendingOnly
        ? planAmount
        : enteredAmount;
      const pendingAfterPayment = v.isPartialPayment ? computedPending : 0;

    // ── Phase 1: write the payment. paymentSubmitting is true ONLY for this
    //    phase so any rapid-fire taps land in the early-return at the top.
    this.paymentSubmitting.set(true);
    let recorded = false;
    try {
      await this.paymentsApi.markPaid({
        memberId: m.memberId,
        ownerId: owner.ownerId,
        amount: paymentAmount,
        method: v.method,
        currentDueDate: due,
        subscriptionType: this.isGym() ? v.subscriptionType : undefined,
        isPartialPayment: v.isPartialPayment,
        moveDueOnPartial:
          v.isPartialPayment && this.payEntryMode() !== 'pendingOnly' ? v.moveDueToNextCycle : false,
        pendingAmount: v.isPartialPayment ? computedPending : 0,
        priorPendingAmount: priorPending,
        memberPlanAmount: effectivePlanAmount,
      });
      recorded = true;
    } catch (error) {
      console.error('Record payment failed:', error);
      this.toast.error('Could not record payment');
    } finally {
      this.paymentSubmitting.set(false);
    }

    if (!recorded) return;

    // ── Phase 2: success path. Close modal IMMEDIATELY (force) so the user
    //    gets instant feedback and can no longer interact with the form.
    this.toast.success(v.isPartialPayment ? 'Partial payment recorded' : 'Payment recorded');
    const paymentText = paymentAmount.toLocaleString('en-IN');
    this.notifyOwnerAction(
      v.isPartialPayment ? 'Partial payment recorded' : 'Payment recorded',
      `${m.firstName} paid INR ${paymentText}.`,
    );
    this.closePay(true);

    // ── Phase 3: receipt prompt. Isolated so receipt failures never surface
    //    as "Could not record payment" — the payment already landed.
    try {
      await this.promptSendReceiptNow(m, {
        amount: paymentAmount,
        method: v.method,
        paymentDate: new Date(),
        pendingAmount: pendingAfterPayment,
        pendingBeforeAmount: priorPending,
      });
    } catch (receiptError) {
      console.error('Receipt prompt failed:', receiptError);
    }
  }

  pendingFromPayForm(): number {
    const paying = Math.max(0, Number(this.payForm.controls.currentPayingAmount.value) || 0);
    const isPendingOnly = this.payEntryMode() === 'pendingOnly';
    if (isPendingOnly) {
      const total = this.payTargetPendingAmount();
      return Math.max(0, total - paying);
    }
    const rent = Math.max(0, Number(this.payForm.controls.amount.value) || 0);
    const priorPending = this.payTargetPendingAmount();
    const totalCollectible = priorPending > 0 ? rent + priorPending : rent;
    return Math.max(0, totalCollectible - paying);
  }

  payTargetPendingAmount(): number {
    return Math.max(0, Number(this.payTarget()?.pendingAmount) || 0);
  }

  payModeTotalAmount(): number {
    const rentAmount = Math.max(0, Number(this.payForm.controls.amount.value) || 0);
    const pendingAmount = this.payTargetPendingAmount();
    if (this.payEntryMode() === 'pendingOnly') {
      return pendingAmount;
    }
    return pendingAmount > 0 ? rentAmount + pendingAmount : rentAmount;
  }

  /** Rent field in Mark as paid (standard mode); used in the total breakdown line. */
  payFormRentNumeric(): number {
    return Math.max(0, Number(this.payForm.controls.amount.value) || 0);
  }

  payCurrentAllowedMax(): number {
    return this.payModeTotalAmount();
  }

  showMoveDueOnPartialOption(): boolean {
    // Pending-only flow clears old balance only; advancing the cycle would let
    // the member show as paid-up for the next period without paying that rent.
    if (this.payEntryMode() === 'pendingOnly') return false;
    return this.pendingFromPayForm() > 1;
  }

  private syncPayFormPending(): void {
    const nextPending = this.pendingFromPayForm();
    this.payForm.controls.pendingAmount.setValue(nextPending, { emitEvent: false });
  }

  private updateCurrentPayingValidators(isPartial: boolean): void {
    const currentPayingControl = this.payForm.get('currentPayingAmount');
    if (!currentPayingControl) return;
    if (isPartial) {
      currentPayingControl.setValidators([Validators.required, Validators.min(1)]);
    } else {
      currentPayingControl.setValidators([Validators.min(0)]);
    }
  }

  /** Immediate success feedback: short "ting" + desktop notification (if allowed). */
  private notifyOwnerAction(title: string, body: string): void {
    this.playTingSound();
    this.notifications.showNotification(title, body);
  }

  /** Lightweight in-app success chime. */
  private playTingSound(): void {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => {
        void ctx.close().catch(() => {});
      };
    } catch {
      // Non-blocking: audio feedback is best-effort only.
    }
  }

  openHistory(m: Member): void {
    this.historyUnsub?.();
    this.historyMember.set(m);
    this.historyPayments.set([]);
    this.historyModalOpen.set(true);
    this.historyUnsub = this.paymentsApi.watchPaymentsForMember(m.memberId, (list) =>
      this.historyPayments.set(list),
    );
  }

  closeHistory(): void {
    this.historyModalOpen.set(false);
    this.historyUnsub?.();
    this.historyUnsub = null;
    this.historyMember.set(null);
    this.historyEditPaymentOpen.set(false);
    this.historyEditPayment.set(null);
    this.historyEditPaymentKind.set('rent');
  }

  openHistoryEditPaymentRent(p: Payment): void {
    if (!this.canRecordPaymentsAction()) return;
    this.historyEditPaymentKind.set('rent');
    this.historyEditPayment.set(p);
    this.historyEditPaymentOpen.set(true);
  }

  openHistoryEditPaymentPending(p: Payment): void {
    if (!this.canRecordPaymentsAction()) return;
    if (!this.canEditPendingOnPayment(p)) return;
    this.historyEditPaymentKind.set('pending');
    this.historyEditPayment.set(p);
    this.historyEditPaymentOpen.set(true);
  }

  canEditPendingOnPayment(p: Payment): boolean {
    return p.isPartialPayment === true || (Number(p.pendingAmount) || 0) > 0;
  }

  closeHistoryEditPayment(): void {
    this.historyEditPaymentOpen.set(false);
    this.historyEditPayment.set(null);
    this.historyEditPaymentKind.set('rent');
  }

  historyEditMemberLabel(): string {
    const m = this.historyMember();
    return m ? `${m.firstName} ${m.lastName || ''}`.trim() : '';
  }

  openDetails(m: Member): void {
    this.detailsMember.set(m);
    this.detailsMessageDraft.set(this.suggestedReminderText(m));
    this.detailsModalOpen.set(true);
  }

  closeDetails(): void {
    this.detailsModalOpen.set(false);
    this.detailsMember.set(null);
    this.detailsMessageDraft.set('');
  }

  dialLink(m: Member): string | null {
    const digits = (m.mobile || '').replace(/\D/g, '');
    if (!digits) return null;
    return `tel:${digits}`;
  }

  canSendWhatsAppReminder(m: Member): boolean {
    const tone = this.rowTone(m);
    const digits = (m.mobile || '').replace(/\D/g, '');
    if (digits.length !== 10) return false;
    return tone === 'red' || tone === 'orange' || tone === 'blue';
  }

  suggestedReminderText(m: Member): string {
    const tone = this.rowTone(m);
    if (tone === 'blue') {
      const pending = Number(m.pendingAmount) || 0;
      return `Hi ${m.firstName}, your pending amount is Rs ${pending.toLocaleString('en-IN')}. Please pay it as soon as possible.`;
    }
    if (tone === 'red') {
      const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
      const dateText = due ? due.toLocaleDateString('en-IN') : 'the due date';
      return `Hi ${m.firstName}, your payment is overdue (${this.dueStatusLabel(m)}). It was due on ${dateText}. Please clear it as soon as possible.`;
    }
    if (tone === 'orange') {
      const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
      const bucket = memberDueBucket(due, true);
      const whenText =
        bucket === 'dueToday' ? 'today' : bucket === 'oneDayLeft' ? 'tomorrow' : bucket === 'twoDaysLeft' ? 'in 2 days' : 'soon';
      const dateText = due ? due.toLocaleDateString('en-IN') : '';
      return `Hi ${m.firstName}, your payment is due ${whenText}${dateText ? ` (${dateText})` : ''}. Please pay on time.`;
    }
    return `Hi ${m.firstName}, just sharing a quick update from your membership account.`;
  }

  sendWhatsAppFromDetails(m: Member): void {
    const digits = (m.mobile || '').replace(/\D/g, '');
    if (digits.length !== 10) {
      this.toast.error('Valid mobile number is required');
      return;
    }
    const msg = this.detailsMessageDraft().trim() || this.suggestedReminderText(m);
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/91${digits}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    const ownerId = this.auth.profile()?.ownerId;
    if (ownerId) {
      const display = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Member';
      const tone = this.rowTone(m);
      const reminderType =
        tone === 'red' ? 'overdue' : tone === 'orange' ? 'due-soon' : tone === 'blue' ? 'pending' : 'general';
      void this.auditLog.log({
        ownerId,
        action: 'member.reminderSent',
        entityType: 'member',
        entityId: m.memberId,
        entityLabel: display,
        description: `Sent payment reminder to ${display} on WhatsApp.`,
        meta: {
          channel: 'whatsapp',
          reminderType,
          mobile: digits.slice(-4),
        },
      });
    }
  }

  openBedPicker(): void {
    if (!this.hasSeatLayout()) return;
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.bedPickerOpen.set(true);
  }

  closeBedPicker(): void {
    this.bedPickerOpen.set(false);
  }

  toggleMore(): void {
    this.moreOpen.set(!this.moreOpen());
  }

  toggleMobileMenu(memberId: string, event: Event): void {
    event.stopPropagation();
    const currentOpen = this.mobileMenuOpen();
    if (currentOpen === memberId) {
      this.mobileMenuOpen.set(null);
    } else {
      this.mobileMenuOpen.set(memberId);
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(null);
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  /** Every bed in the room is taken (respects editing member: their bed is not “occupied”). */
  isRoomFullyOccupied(floorNum: number, roomNum: number): boolean {
    const f = Math.trunc(Number(floorNum));
    const r = Math.trunc(Number(roomNum));
    if (!Number.isFinite(f) || !Number.isFinite(r) || r <= 0) return false;
    const floorObj = this.pgLayout()?.floors?.find((x) => Math.trunc(Number(x.floorNumber)) === f);
    const roomObj = floorObj?.rooms?.find((x) => Math.trunc(Number(x.roomNumber)) === r);
    const n = Math.trunc(Number(roomObj?.beds));
    if (!Number.isFinite(n) || n <= 0) return true;
    for (let b = 1; b <= n; b++) {
      if (!this.isBedOccupied(f, r, b)) return false;
    }
    return true;
  }

  /** Every room on the floor is fully occupied (no assignable bed left on that floor). */
  isFloorFullyOccupied(floor: PgFloorLayout): boolean {
    const rooms = floor.rooms ?? [];
    if (rooms.length === 0) return false;
    const f = Math.trunc(Number(floor.floorNumber));
    return rooms.every((room) => this.isRoomFullyOccupied(f, Math.trunc(Number(room.roomNumber))));
  }

  /** Parsed floor when the control has a value (empty string means no selection, not ground `0`). */
  seatFloorFormNum(): number | null {
    const raw = (this.memberForm.controls.floorNumber.value ?? '').toString().trim();
    if (raw === '') return null;
    const f = Math.trunc(Number(raw));
    return Number.isFinite(f) ? f : null;
  }

  seatRoomFormNum(): number | null {
    const raw = (this.memberForm.controls.roomNumber.value ?? '').toString().trim();
    if (raw === '') return null;
    const r = Math.trunc(Number(raw));
    return Number.isFinite(r) && r > 0 ? r : null;
  }

  roomsForSelectedFloor(): PgRoomLayout[] {
    const f = this.seatFloorFormNum();
    if (f === null) return [];
    return this.roomsForFloorNumber(f);
  }

  selectedRoomBedCount(): number {
    const f = this.seatFloorFormNum();
    const r = this.seatRoomFormNum();
    if (f === null || r === null) return 0;
    const floorObj = this.pgLayout()?.floors?.find((x) => Math.trunc(Number(x.floorNumber)) === f);
    const roomObj = floorObj?.rooms?.find((x) => Math.trunc(Number(x.roomNumber)) === r);
    const n = Math.trunc(Number(roomObj?.beds));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  bedIndicesForSelectedRoom(): number[] {
    const n = this.selectedRoomBedCount();
    return n > 0 ? Array.from({ length: n }, (_, i) => i + 1) : [];
  }

  onSeatFloorSelectChange(): void {
    if (!this.hasSeatLayout()) return;
    const f = this.seatFloorFormNum();
    if (f === null) {
      this.memberForm.patchValue({ roomNumber: '', bedNumber: '' }, { emitEvent: false });
      this.syncSeatFieldsAfterDropdown();
      return;
    }
    const rooms = this.roomsForFloorNumber(f);
    const r = this.seatRoomFormNum();
    const roomOk = r !== null && rooms.some((x) => Math.trunc(Number(x.roomNumber)) === r);
    if (!roomOk) {
      this.memberForm.patchValue({ roomNumber: '', bedNumber: '' }, { emitEvent: false });
    } else {
      this.clearBedIfInvalidForRoom(f, r);
    }
    this.syncSeatFieldsAfterDropdown();
  }

  onSeatRoomSelectChange(): void {
    if (!this.hasSeatLayout()) return;
    const f = this.seatFloorFormNum();
    const r = this.seatRoomFormNum();
    if (f !== null && r !== null) {
      this.clearBedIfInvalidForRoom(f, r);
    }
    this.syncSeatFieldsAfterDropdown();
  }

  onSeatBedSelectChange(): void {
    if (!this.hasSeatLayout()) return;
    this.syncSeatFieldsAfterDropdown();
  }

  private roomsForFloorNumber(floorNum: number): PgRoomLayout[] {
    const floorObj = this.pgLayout()?.floors?.find((x) => Math.trunc(Number(x.floorNumber)) === floorNum);
    const rooms = floorObj?.rooms ?? [];
    return [...rooms].sort((a, b) => Number(a.roomNumber) - Number(b.roomNumber));
  }

  private clearBedIfInvalidForRoom(floorNum: number, roomNum: number): void {
    const roomObj = this.roomsForFloorNumber(floorNum).find((x) => Math.trunc(Number(x.roomNumber)) === roomNum);
    const maxBeds = Math.trunc(Number(roomObj?.beds));
    const b = Math.trunc(Number(this.memberForm.controls.bedNumber.value));
    if (!Number.isFinite(maxBeds) || maxBeds <= 0 || !Number.isFinite(b) || b < 1 || b > maxBeds) {
      this.memberForm.patchValue({ bedNumber: '' }, { emitEvent: false });
    }
  }

  private syncSeatFieldsAfterDropdown(): void {
    const v = this.memberForm.getRawValue();
    this.applyRoomRentToMemberAmount(v.floorNumber, v.roomNumber);
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(this.getSeatAvailabilityIssue(v.floorNumber, v.roomNumber, v.bedNumber));
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

  /** PG list/details: compact room label (e.g. G4, 101) from stored floor/room strings. */
  memberPgRoomLabel(m: Member): string {
    const f = Number(m.floorNumber);
    const r = Number(m.roomNumber);
    return formatPgRoomLabel(f, r) || '—';
  }

  /** Import preview: resolved seat label for PG rows. */
  importSeatSummary(row: ImportPreviewRow): string {
    if (!this.isPg()) return '—';
    if (!row.floorNumber || !row.roomNumber || !row.bedNumber) return 'No seat';
    const f = Number(row.floorNumber);
    const r = Number(row.roomNumber);
    const label = formatPgRoomLabel(f, r);
    return label ? `${label} · bed ${row.bedNumber}` : `Floor ${row.floorNumber} · room ${row.roomNumber} · bed ${row.bedNumber}`;
  }

  selectBed(floor: number, room: number, bed: number): void {
    if (this.isBedOccupied(floor, room, bed)) return;
    this.memberForm.patchValue({
      floorNumber: String(floor),
      roomNumber: String(room),
      bedNumber: String(bed),
    });
    // Bed picker updates are programmatic; mark dirty so Edit -> Save persists.
    this.memberForm.controls.floorNumber.markAsDirty();
    this.memberForm.controls.roomNumber.markAsDirty();
    this.memberForm.controls.bedNumber.markAsDirty();
    this.memberForm.markAsDirty();
    this.syncSeatFieldsAfterDropdown();
    this.memberForm.controls.floorNumber.markAsTouched();
    this.memberForm.controls.roomNumber.markAsTouched();
    this.memberForm.controls.bedNumber.markAsTouched();
    this.manualSeatEntryTriggered.set(false);
    this.closeBedPicker();
  }

  onManualSeatInput(): void {
    if (!this.hasSeatLayout()) return;
    this.manualSeatEntryTriggered.set(true);
    const v = this.memberForm.getRawValue();
    this.applyRoomRentToMemberAmount(v.floorNumber, v.roomNumber);
    this.manualSeatError.set(this.getSeatAvailabilityIssue(v.floorNumber, v.roomNumber, v.bedNumber));
  }

  /** Floor, room, and bed: digits only (no letters or symbols). */
  onNumericSeatField(field: 'floorNumber' | 'roomNumber' | 'bedNumber', event: Event): void {
    const el = event.target as HTMLInputElement;
    const digitsOnly = el.value.replace(/\D/g, '');
    this.memberForm.controls[field].setValue(digitsOnly, { emitEvent: false });
    if (el.value !== digitsOnly) {
      el.value = digitsOnly;
    }
    this.onManualSeatInput();
  }

  private applyRoomRentToMemberAmount(floor: unknown, room: unknown): void {
    const roomRent = this.getRoomRent(floor, room);
    if (roomRent <= 0) return;
    this.memberForm.controls.amount.setValue(roomRent);
    this.memberForm.controls.amount.markAsTouched();
  }

  private getRoomRent(floor: unknown, room: unknown): number {
    const floorNo = Math.trunc(Number(floor));
    const roomNo = Math.trunc(Number(room));
    if (!Number.isFinite(floorNo) || !Number.isFinite(roomNo) || roomNo <= 0) return 0;
    const floorLayout = this.pgLayout()?.floors?.find((f) => Math.trunc(Number(f.floorNumber)) === floorNo);
    if (!floorLayout) return 0;
    const roomLayout = floorLayout.rooms?.find((r) => Math.trunc(Number(r.roomNumber)) === roomNo);
    const rent = Number(roomLayout?.rent);
    return Number.isFinite(rent) && rent > 0 ? Math.round(rent) : 0;
  }

  onMemberMobileInput(event: Event): void {
    applyIndianMemberMobileFromInput(this.memberForm.controls.mobile, event);
  }

  /** Re-apply spaced display after opening the modal or when focusing the field. */
  onMemberMobileFocus(event: FocusEvent): void {
    const el = event.target as HTMLInputElement;
    const stored = normalizeIndianMemberMobileDigits(this.memberForm.controls.mobile.value ?? '');
    this.memberForm.controls.mobile.setValue(stored, { emitEvent: false });
    el.value = formatIndianMemberMobileDisplay(stored);
  }

  private scheduleMemberMobileInputDisplayRefresh(): void {
    setTimeout(() => this.refreshMemberMobileInputDisplayFromControl(), 0);
  }

  private refreshMemberMobileInputDisplayFromControl(): void {
    const el = this.memberMobileInputRef()?.nativeElement;
    if (!el) return;
    const stored = normalizeIndianMemberMobileDigits(this.memberForm.controls.mobile.value ?? '');
    this.memberForm.controls.mobile.setValue(stored, { emitEvent: false });
    el.value = formatIndianMemberMobileDisplay(stored);
  }

  onAadhaarDigitsInput(event: Event): void {
    applyDigitsOnlyFromInput(this.memberForm.controls.aadhaarLast4, event, 12);
  }

  onNameInput(field: 'firstName' | 'lastName', event: Event): void {
    const el = event.target as HTMLInputElement;
    const noDigits = el.value.replace(/[0-9]/g, '');
    this.memberForm.controls[field].setValue(noDigits, { emitEvent: false });
    if (el.value !== noDigits) {
      el.value = noDigits;
    }
  }

  /** Blue = partial payment pending, red = overdue, orange = due soon, green = active / further out, neutral = inactive / unknown */
  rowTone(m: Member): 'blue' | 'red' | 'orange' | 'green' | 'neutral' {
    if (m.status === 'active' && (Number(m.pendingAmount) || 0) > 0) return 'blue';
    const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    const b = memberDueBucket(d, m.status === 'active');
    if (b === 'inactive' || b === 'unknown') return 'neutral';
    if (b === 'overdue') return 'red';
    if (b === 'dueToday' || b === 'oneDayLeft' || b === 'twoDaysLeft') return 'orange';
    return 'green';
  }

  isPartialPaymentPending(m: Member): boolean {
    return m.status === 'active' && (Number(m.pendingAmount) || 0) > 0;
  }

  /** Whole calendar days from today to due date (active members only); null if not applicable. */
  calendarDaysUntilDue(m: Member): number | null {
    if (m.status !== 'active') return null;
    const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    if (!due) return null;
    return calendarDaysBetween(startOfToday(), startOfDay(due));
  }

  isDueSoonWithinFiveDays(m: Member): boolean {
    const daysLeft = this.calendarDaysUntilDue(m);
    return daysLeft !== null && daysLeft >= 0 && daysLeft <= 5;
  }

  /** Status pill copy when due in 0–5 days (same pill styling as former D5). */
  dueSoonWithinFiveDaysPillLabel(m: Member): string {
    const d = this.calendarDaysUntilDue(m);
    if (d === null || d < 0 || d > 5) return '—';
    if (d === 0) return 'Due today';
    if (d === 1) return '1 day';
    return `${d} days`;
  }

  partialPaidAmount(m: Member): number {
    const plan = Math.max(0, Number(m.amount) || 0);
    const pr = Number(m.paidRent);
    if (m.paidRent !== undefined && m.paidRent !== null && Number.isFinite(pr)) {
      return Math.max(0, Math.min(plan, Math.round(pr)));
    }
    const pending = Number(m.pendingAmount) || 0;
    return Math.max(0, plan - pending);
  }

  /**
   * Copy for partial-payment rows: `partialPaidAmount` is (plan rent − pending), not cash collected.
   * Showing only "Paid ₹X" beside "₹X pending" looks wrong when both numbers match.
   */
  partialPlanTowardLabel(m: Member): string {
    const plan = Math.max(0, Math.round(Number(m.amount) || 0));
    const toward = Math.round(this.partialPaidAmount(m));
    return `₹${toward.toLocaleString('en-IN')} toward ₹${plan.toLocaleString('en-IN')} plan`;
  }

  dueStatusLabel(m: Member): string {
    const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    return dueRemainingOrOverdueLabel(d, m.status === 'active');
  }

  whatsappLink(m: Member): string | null {
    if (m.status !== 'active') return null;
    const digits = (m.mobile || '').replace(/\D/g, '');
    if (digits.length !== 10) return null;

    const tone = this.rowTone(m);
    // Hide reminder for paid-ahead/long-expiry and neutral rows.
    if (tone === 'green' || tone === 'neutral') return null;

    let msg = 'Hi, your payment is due. Please pay.';
    if (tone === 'blue') {
      const pending = Number(m.pendingAmount) || 0;
      msg = `Hi ${m.firstName}, your Rs ${pending.toLocaleString('en-IN')} payment is pending. Please pay it as soon as possible.`;
    } else if (tone === 'red') {
      const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
      const dateText = due ? due.toLocaleDateString('en-IN') : 'the due date';
      msg = `Hi ${m.firstName}, your payment is overdue (${this.dueStatusLabel(m)}). It was due on ${dateText}. Please clear it as soon as possible.`;
    } else if (tone === 'orange') {
      const due = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
      const bucket = memberDueBucket(due, true);
      const whenText =
        bucket === 'dueToday'
          ? 'today'
          : bucket === 'oneDayLeft'
            ? 'tomorrow'
            : bucket === 'twoDaysLeft'
              ? 'in 2 days'
              : 'soon';
      const dateText = due ? due.toLocaleDateString('en-IN') : '';
      msg = `Hi ${m.firstName}, your payment is due ${whenText}${dateText ? ` (${dateText})` : ''}. Please pay on time.`;
    }

    const text = encodeURIComponent(msg);
    return `https://wa.me/91${digits}?text=${text}`;
  }

  canSendReceipt(m: ReceiptCandidate): boolean {
    const digits = (m.mobile || '').replace(/\D/g, '');
    return digits.length === 10;
  }

  private async promptSendReceiptNow(
    m: ReceiptCandidate,
    options?: {
      amount?: number;
      method?: PaymentMethod;
      paymentDate?: Date;
      pendingAmount?: number;
      pendingBeforeAmount?: number;
    },
  ): Promise<void> {
    if (!this.canSendReceipt(m)) return;
    this.receiptConfirmTarget.set(m);
    this.receiptConfirmOptions = options || null;
    this.receiptConfirmAmount.set(Math.max(0, Number(options?.amount) || 0));
    this.receiptConfirmOpen.set(true);
    const yes = await new Promise<boolean>((resolve) => {
      this.receiptConfirmResolver = resolve;
    });
    if (!yes) return;
    this.receiptConfirmSending.set(true);
    try {
      await this.sendReceipt(m, options);
    } finally {
      this.receiptConfirmSending.set(false);
    }
  }

  onReceiptConfirmSend(): void {
    this.resolveReceiptConfirm(true);
  }

  onReceiptConfirmSkip(): void {
    this.resolveReceiptConfirm(false);
  }

  onReceiptConfirmClosed(): void {
    this.resolveReceiptConfirm(false);
  }

  private resolveReceiptConfirm(ok: boolean): void {
    this.receiptConfirmOpen.set(false);
    const resolve = this.receiptConfirmResolver;
    this.receiptConfirmResolver = null;
    this.receiptConfirmOptions = null;
    this.receiptConfirmTarget.set(null);
    this.receiptConfirmAmount.set(0);
    if (resolve) resolve(ok);
  }

  async sendReceipt(
    m: ReceiptCandidate,
    options?: {
      amount?: number;
      method?: PaymentMethod;
      paymentDate?: Date;
      pendingAmount?: number;
      pendingBeforeAmount?: number;
    },
  ): Promise<void> {
    if (!this.canSendReceipt(m)) {
      this.toast.error('Valid mobile number is required');
      return;
    }

    try {
      const paymentDate = options?.paymentDate ?? new Date();
      const fallbackPendingAmount = Math.max(0, Number(options?.pendingAmount ?? 0) || 0);
      const fallbackPendingBeforeAmount = Math.max(
        0,
        Number(options?.pendingBeforeAmount ?? m.pendingAmount) || 0,
      );
      const fallbackPaidAmount =
        Math.max(0, Number(m.amount || 0) - fallbackPendingAmount) || Number(m.amount || 0);
      const estimatedPaidAmount = Math.max(0, Number(options?.amount) || fallbackPaidAmount);
      const memberForReceipt: ReceiptCandidate & {
        pendingBeforeAmount?: number;
        pendingAfterAmount?: number;
      } = {
        ...m,
        pendingAmount: fallbackPendingBeforeAmount,
        pendingBeforeAmount: fallbackPendingBeforeAmount,
        pendingAfterAmount: fallbackPendingAmount,
      };

      const ownerProfile = this.auth.profile();
      const businessName = ownerProfile?.businessName?.trim() || ownerProfile?.name || 'PayBook';
      const monthText = paymentDate.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
      const mobile = (m.mobile || '').replace(/\D/g, '');
      const receiptNo = `RCPT-${paymentDate.getFullYear()}${String(paymentDate.getMonth() + 1).padStart(2, '0')}${String(
        paymentDate.getDate(),
      ).padStart(2, '0')}-${m.memberId.slice(0, 6).toUpperCase()}`;

      const latestPayment = await this.paymentsApi.getLatestPaymentForMember(m.memberId).catch(() => null);
      const methodFromOptions = options?.method;
      const resolvedMethod: PaymentMethod =
        methodFromOptions === 'cash' || methodFromOptions === 'upi' || methodFromOptions === 'card'
          ? methodFromOptions
          : latestPayment?.method === 'cash' ||
              latestPayment?.method === 'upi' ||
              latestPayment?.method === 'card'
            ? latestPayment.method
            : 'cash';

      const paymentIdForReceipt =
        latestPayment?.paymentId && String(latestPayment.paymentId).length > 0
          ? latestPayment.paymentId
          : `payment-${Date.now()}`;

      // Payment row for receipt (method matches owner payments table when not passed explicitly)
      const payment: Payment = {
        paymentId: paymentIdForReceipt,
        memberId: m.memberId,
        ownerId: this.auth.profile()?.ownerId || '',
        amount: estimatedPaidAmount,
        date: Timestamp.fromDate(paymentDate),
        method: resolvedMethod,
        createdAt: Timestamp.fromDate(paymentDate),
      };

      // Generate receipt link
      const { url, expiresAt } = await this.receiptService.generateReceiptLink(memberForReceipt, payment, receiptNo);

      // Create WhatsApp message
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
        // Popup likely blocked: fallback to same-tab navigation so owner can still send.
        window.location.assign(wa);
        this.toast.success('Opening WhatsApp in this tab...');
      }
    } catch (error) {
      console.error('Error sending receipt:', error);
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

  private toInputDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f < 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }

  private getSeatAvailabilityIssue(floor: unknown, room: unknown, bed: unknown): string | null {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return null;
    if (f < 0 || r <= 0 || b <= 0) return 'Enter valid floor, room, and bed number';

    const floorObj = (this.pgLayout()?.floors || []).find((x) => Number(x.floorNumber) === Math.trunc(f));
    if (!floorObj) return `Floor ${Math.trunc(f)} is not available in seat map`;
    const roomObj = floorObj.rooms.find((x) => Number(x.roomNumber) === Math.trunc(r));
    if (!roomObj) return `Room ${this.formatRoomNumber(Math.trunc(f), Math.trunc(r))} is not available in seat map`;
    if (Math.trunc(b) > Number(roomObj.beds || 0)) {
      return `Bed ${Math.trunc(b)} is not available in room ${this.formatRoomNumber(Math.trunc(f), Math.trunc(r))}`;
    }
    const editingId = this.editingId();
    if (editingId) {
      const editingMember = this.members().find((m) => m.memberId === editingId);
      if (editingMember) {
        const ef = Number(editingMember.floorNumber);
        const er = Number(editingMember.roomNumber);
        const eb = Number(editingMember.bedNumber);
        if (
          Number.isFinite(ef) &&
          Number.isFinite(er) &&
          Number.isFinite(eb) &&
          Math.trunc(ef) === Math.trunc(f) &&
          Math.trunc(er) === Math.trunc(r) &&
          Math.trunc(eb) === Math.trunc(b)
        ) {
          return null;
        }
      }
    }
    if (this.isBedOccupied(f, r, b)) return 'Selected bed is already occupied';
    return null;
  }

  // ===== Import Methods =====

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

  /** Loads the built-in sample into the preview table (same data as the Excel download). */
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

    const rawHeaders = this.parseCsvLine(lines[0]);
    const headers = rawHeaders.map((h) => h.trim().toLowerCase());
    
    // Flexible header matching - support both original and exported CSV formats
    const idx = {
      name: this.findHeaderIndex(headers, ['name', 'first name']),
      lastName: this.findHeaderIndex(headers, ['last name']),
      mobile: this.findHeaderIndex(headers, ['mobile', 'phone']),
      plan: this.findHeaderIndex(headers, ['plan', 'amount']),
      dueDate: this.findHeaderIndex(headers, ['duedate', 'due date']),
      subscriptionType: this.findHeaderIndex(headers, ['subscriptiontype', 'subscription type']),
      floor: this.findHeaderIndex(headers, ['floor', 'floor number']),
      room: this.findHeaderIndex(headers, ['room', 'room number']),
      bed: this.findHeaderIndex(headers, ['bed', 'bed number']),
      // Optional fields from export
      email: this.findHeaderIndex(headers, ['email']),
      gender: this.findHeaderIndex(headers, ['gender']),
      aadhaar: this.findHeaderIndex(headers, ['aadhaar last 4', 'aadhaar']),
      address: this.findHeaderIndex(headers, ['address']),
      joinDate: this.findHeaderIndex(headers, ['join date', 'joindate']),
      pendingAmount: this.findHeaderIndex(headers, ['pending amount', 'pending']),
      advancePaid: this.findHeaderIndex(headers, ['advance paid', 'advance']),
      status: this.findHeaderIndex(headers, ['status']),
    };
    
    // Check for required fields - be more flexible for exported CSV
    if (idx.name < 0) {
      this.importRows.set([]);
      this.toast.error('CSV missing name column. Expected: "name" or "First Name"');
      return;
    }
    if (idx.plan < 0) {
      this.importRows.set([]);
      this.toast.error('CSV missing plan/amount column. Expected: "plan" or "Amount"');
      return;
    }
    if (idx.dueDate < 0) {
      this.importRows.set([]);
      this.toast.error('CSV missing due date column. Expected: "duedate" or "Due Date"');
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
      
      // Handle name parsing - support both combined "name" and separate "first name"/"last name"
      let firstName = '';
      let lastName = '';
      if (idx.lastName >= 0) {
        // Exported CSV format with separate first/last name columns
        firstName = this.readCol(cols, idx.name).trim();
        lastName = this.readCol(cols, idx.lastName).trim();
      } else {
        // Original format with combined name column
        const rawName = this.readCol(cols, idx.name);
        const [first, ...lastParts] = rawName.trim().split(/\s+/);
        firstName = first;
        lastName = lastParts.join(' ');
      }
      
      const mobile = this.readCol(cols, idx.mobile).replace(/\D/g, '');
      const planText = this.readCol(cols, idx.plan);
      const dueDateText = this.readCol(cols, idx.dueDate);
      const subRaw = idx.subscriptionType >= 0 ? this.readCol(cols, idx.subscriptionType) : 'monthly'; // Default to monthly if not present
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

      const identityLoc = this.identityLocationParts(
        assignedBed.floorNumber,
        assignedBed.roomNumber,
        assignedBed.bedNumber,
      );
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

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private readCol(cols: string[], idx: number): string {
    return idx >= 0 && idx < cols.length ? cols[idx].trim() : '';
  }

  private parseDateInput(dateStr: string): Date | null {
    const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
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

  private memberIdentityKey(firstName: string, lastName: string, mobile: string, floor: string, room: string, bed: string): string {
    return `${firstName}|${lastName}|${mobile}|${floor}|${room}|${bed}`;
  }

  private identityLocationParts(floor: string, room: string, bed: string): { floorNumber: string; roomNumber: string; bedNumber: string } {
    return { floorNumber: floor, roomNumber: room, bedNumber: bed };
  }

  async exportToCSV(): Promise<void> {
    try {
      // Get ALL members from database, not just filtered display members
      const allMembers = this.members();
      const membersToExport = this.listMode() === 'active' 
        ? allMembers.filter(m => m.status === 'active')
        : allMembers.filter(m => m.status === 'inactive');
      
      if (membersToExport.length === 0) {
        this.toast.success('No members to export');
        return;
      }

      const XLSX = await import('xlsx');
      
      // Prepare CSV headers based on business type
      const headers = [
        'Member ID',
        'First Name',
        'Last Name',
        'Mobile',
        'Email',
        'Gender',
        'Aadhaar Last 4',
        'Address',
        'Join Date',
        'Due Date',
        'Amount',
        'Pending Amount',
        'Advance Paid',
        'Payment Status',
        'Status',
        'Subscription Type',
        'Created At'
      ];

      // Add PG-specific headers if it's a PG business
      if (this.isPg()) {
        headers.splice(8, 0, 'Floor Number', 'Room Number', 'Bed Number');
      }

      // Transform member data for CSV
      const csvData = membersToExport.map(member => {
        const row: any[] = [
          member.memberId,
          member.firstName,
          member.lastName || '',
          member.mobile || '',
          member.email || '',
          member.gender || '',
          member.aadhaarLast4 || '',
          member.address || '',
          this.formatDate(member.joinDate),
          this.formatDate(member.dueDate),
          member.amount || 0,
          member.pendingAmount || 0,
          member.advancePaid || 0,
          this.getPaymentStatus(member),
          member.status,
          member.subscriptionType || 'monthly',
          this.formatDate(member.createdAt)
        ];

        // Add PG-specific data if it's a PG business
        if (this.isPg()) {
          row.splice(8, 0, 
            member.floorNumber || '',
            member.roomNumber || '',
            member.bedNumber || ''
          );
        }

        return row;
      });

      // Combine headers and data
      const finalData = [headers, ...csvData];

      // Create and download CSV file
      const ws = XLSX.utils.aoa_to_sheet(finalData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Members');
      
      const fileName = `members-${this.listMode()}-${new Date().toISOString().split('T')[0]}.csv`;
      XLSX.writeFile(wb, fileName);
      
      this.toast.success(`Exported ${membersToExport.length} members to ${fileName}`);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      this.toast.error('Failed to export CSV. Please try again.');
    }
  }

  private formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestampToDate(timestamp);
    return date ? date.toISOString().split('T')[0] : '';
  }

  private getPaymentStatus(member: Member): string {
    const pending = Number(member.pendingAmount) || 0;
    if (pending > 0) return 'Partial Payment';
    if (pending < 0) return 'Overpaid';
    return 'Paid';
  }

  /** Helper to find header index with multiple possible names (for flexible CSV import) */
  private findHeaderIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.indexOf(name.toLowerCase());
      if (index >= 0) return index;
    }
    return -1;
  }

  /** Scroll to the member element that matches the search query */
  private scrollToSearchedMember(searchQuery: string): void {
    // Wait for the view to update after search filters are applied
    setTimeout(() => {
      const members = this.displayMembers();
      const searchTerm = searchQuery.toLowerCase().trim();
      
      // Find the first member that matches the search query
      const targetMember = members.find(m => {
        const fullName = `${m.firstName} ${m.lastName || ''}`.toLowerCase();
        return fullName.includes(searchTerm);
      });
      
      if (targetMember) {
        // Determine the view mode and construct the element ID
        const isMobile = window.innerWidth < 768;
        const isCardView = this.desktopMemberView() === 'card' && !isMobile;
        
        let elementId: string;
        if (isMobile) {
          elementId = `member-mobile-${targetMember.memberId}`;
        } else if (isCardView) {
          elementId = `member-card-${targetMember.memberId}`;
        } else {
          elementId = `member-table-${targetMember.memberId}`;
        }
        
        const element = document.getElementById(elementId);
        if (element) {
          // Smooth scroll to the element
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center', 
            inline: 'nearest' 
          });
          
          // Add a brief highlight effect
          element.style.transition = 'background-color 0.3s ease';
          element.style.backgroundColor = '#fef3c7'; // amber-100
          
          setTimeout(() => {
            element.style.backgroundColor = '';
          }, 1500);
        }
      }
    }, 100); // Small delay to ensure DOM is updated
  }
}

interface ImportPreviewRow {
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
}

type ReceiptCandidate = Pick<
  Member,
  'memberId' | 'ownerId' | 'firstName' | 'lastName' | 'mobile' | 'amount' | 'pendingAmount'
>;
