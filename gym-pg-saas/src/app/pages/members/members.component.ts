import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { jsPDF } from 'jspdf';
import { Subscription } from 'rxjs';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { PgLayout } from '../../core/models/pg-layout.model';
import { Payment, PaymentMethod } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { TranslationService } from '../../core/services/translation.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import {
  calendarDaysBetween,
  coerceFirestoreDate,
  dueUiStatus,
  DueBucket,
  dueRemainingOrOverdueLabel,
  endOfToday,
  memberDueBucket,
  startOfDay,
  startOfToday,
  timestampToDate,
} from '../../core/utils/date.utils';
import { formatPgRoomLabel } from '../../core/utils/pg-layout-display.utils';
import { memberImportSampleAoA, memberImportSampleCsv } from '../../core/utils/member-import-sample.util';
import { MEMBER_IMPORT_PROGRESS_MESSAGES } from '../../core/utils/member-import-progress.messages';
import { parsePgImportSeat, pgSheetSubscriptionError } from '../../core/utils/pg-sheet-import.utils';
import { applyDigitsOnlyFromInput, optionalDigitsLen, positiveAmount, dueDateAfterJoinDate } from '../../core/utils/validators';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, ModalComponent, TranslatePipe],
  templateUrl: './members.component.html',
  styles: [`
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

  `],
})
export class MembersComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly cache = inject(DataCacheService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly members = signal<Member[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly listMode = signal<'active' | 'inactive'>('active');
  readonly payFilter = signal<'all' | 'paid' | 'overdue' | 'dueSoon' | 'partial' | 'pending'>('all');
  readonly sortKey = signal<'due' | 'name'>('due');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly dueSectionFilter = signal<'all' | 'dueToday' | 'overdue' | 'dueSoon'>('all');

  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly moreOpen = signal(false);

  readonly payModalOpen = signal(false);
  readonly payTarget = signal<Member | null>(null);
  readonly historyModalOpen = signal(false);
  readonly historyMember = signal<Member | null>(null);
  readonly historyPayments = signal<Payment[]>([]);
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

  /** Safely get the due date for a member, with fallback handling */
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
        return name.includes(q) || (qq.length > 0 && mob.includes(qq));
      });
    }
    const sf = this.statusFilter();
    if (sf !== 'all') list = list.filter((m) => m.status === sf);
    const pf = this.payFilter();
    if (pf === 'paid') {
      list = list.filter((m) => this.rowTone(m) === 'green');
    } else if (pf === 'overdue') {
      list = list.filter((m) => this.rowTone(m) === 'red');
    } else if (pf === 'dueSoon') {
      list = list.filter((m) => this.isDueSoonWithinFiveDays(m));
    } else if (pf === 'partial') {
      list = list.filter((m) => this.rowTone(m) === 'blue');
    } else if (pf === 'pending') {
      // Backward compatibility for old links/query params.
      list = list.filter((m) => {
        const tone = this.rowTone(m);
        return tone === 'red' || tone === 'orange' || tone === 'blue';
      });
    }

    const dueFilter = this.dueSectionFilter();
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
    firstName: ['', Validators.required],
    lastName: [''],
    mobile: ['', optionalDigitsLen(10)],
    email: [''],
    address: [''],
    floorNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    roomNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    bedNumber: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    gender: this.fb.control<'male' | 'female' | 'other' | ''>(''),
    aadhaarLast4: ['', optionalDigitsLen(12)],
    notes: [''],
    joinDate: ['', Validators.required],
    dueDate: ['', [Validators.required, dueDateAfterJoinDate()]],
    amount: [0, [Validators.required, positiveAmount()]],
    advancePaid: [0, [Validators.min(0)]],
    isPartialPayment: this.fb.nonNullable.control(false),
    paidAmount: [0],
    pendingAmount: [0],
    paymentMethod: this.fb.nonNullable.control<PaymentMethod>('cash', Validators.required),
    status: this.fb.nonNullable.control<'active' | 'inactive'>('active', Validators.required),
    subscriptionType: this.fb.nonNullable.control<'monthly' | 'quarterly' | 'yearly'>(
      'monthly',
      Validators.required,
    ),
  });

  readonly payForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, positiveAmount()]],
    method: this.fb.nonNullable.control<PaymentMethod>('cash', Validators.required),
    subscriptionType: this.fb.nonNullable.control<SubscriptionType>('monthly', Validators.required),
    isPartialPayment: this.fb.nonNullable.control(false),
    pendingAmount: [0], // No validators initially - will be added conditionally
  });

  private unsub: (() => void) | null = null;
  private querySub: Subscription | null = null;
  private currentOwnerId: string | null = null;
  private payFormSubscription: Subscription | null = null;
  private oldAmount: number = 0;

  constructor() {
    // Sync cache signals to component signals
    effect(() => {
      this.members.set(this.cache.members());
    });

    effect(() => {
      this.pgLayout.set(this.cache.layout());
    });

    // Update dueDate validation when joinDate changes
    this.memberForm.get('joinDate')?.valueChanges.subscribe(() => {
      this.memberForm.get('dueDate')?.updateValueAndValidity();
    });

    // Set up conditional validation for pendingAmount based on isPartialPayment
    this.payFormSubscription = this.payForm.get('isPartialPayment')?.valueChanges.subscribe((isPartial) => {
      const pendingAmountControl = this.payForm.get('pendingAmount');
      if (!pendingAmountControl) return;

      if (isPartial) {
        // When partial payment is enabled, make it required and positive
        pendingAmountControl.setValidators([Validators.required, positiveAmount()]);
      } else {
        // When partial payment is disabled, remove validators
        pendingAmountControl.setValidators([]);
      }
      pendingAmountControl.updateValueAndValidity();
    }) ?? null;

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
  }

  async ngOnInit(): Promise<void> {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
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
      }

      const due = params.get('due');
      if (due === 'dueToday' || due === 'overdue' || due === 'dueSoon') {
        this.dueSectionFilter.set(due);
      } else {
        this.dueSectionFilter.set('all');
      }
    });
    const routePath = this.route.snapshot.routeConfig?.path;
    this.listMode.set(routePath === 'inactive-members' ? 'inactive' : 'active');

    await this.auth.refreshProfile();
    const id = this.auth.profile()?.ownerId;
    if (id) {
      this.currentOwnerId = id;
      console.log('📥 Members page loading data from cache...');
      try {
        await this.cache.loadMembers(id);
        await this.cache.loadLayout(id);
        console.log('✅ Members page data loaded');
      } catch (error) {
        console.error('❌ Error loading members data:', error);
        this.toast.error('Failed to load members');
      }
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

  pendingFromForm(): number {
    const total = Number(this.memberForm.controls.amount.value) || 0;
    const paid = Number(this.memberForm.controls.paidAmount.value) || 0;
    return Math.max(0, total - paid);
  }

  ngOnDestroy(): void {
    this.historyUnsub?.();
    this.querySub?.unsubscribe();
    this.payFormSubscription?.unsubscribe();
    this.clearImportProgressUi();
  }

  /**
   * Manual refresh - forces re-fetch from Firestore
   */
  async refreshMembers(): Promise<void> {
    if (!this.currentOwnerId) return;
    console.log('🔄 Refreshing members...');
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
      this.currentPage.set(1);
      this.pageGroupStart.set(1);
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

  openAdd(): void {
    this.editingId.set(null);
    this.moreOpen.set(false);
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
      pendingAmount: 0,
      status: 'active',
      subscriptionType: 'monthly',
    });
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(m: Member): void {
    this.oldAmount = m.amount;
    this.editingId.set(m.memberId);
    this.moreOpen.set(!!(m.gender || m.aadhaarLast4 || m.notes));
    const jd = timestampToDate(m.joinDate);
    const joinStr = jd ? this.toInputDate(jd) : '';
    const dd = timestampToDate(m.dueDate);
    const dueStr = dd ? this.toInputDate(dd) : '';
    this.memberForm.patchValue({
      firstName: m.firstName,
      lastName: m.lastName || '',
      mobile: m.mobile || '',
      email: m.email || '',
      address: m.address || '',
      floorNumber: String(m.floorNumber || '').replace(/\D/g, ''),
      roomNumber: String(m.roomNumber || '').replace(/\D/g, ''),
      bedNumber: String(m.bedNumber || '').replace(/\D/g, ''),
      gender: (m.gender as 'male' | 'female' | 'other' | undefined) || '',
      aadhaarLast4: m.aadhaarLast4 || '',
      notes: m.notes || '',
      joinDate: joinStr,
      dueDate: dueStr,
      amount: m.amount,
      advancePaid: Math.max(0, Number(m.advancePaid) || 0),
      isPartialPayment: false,
      paidAmount: 0,
      pendingAmount: Number(m.pendingAmount) || 0,
      paymentMethod: 'cash', // Default to cash for existing members
      status: m.status,
      subscriptionType: m.subscriptionType || 'monthly',
    });
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.modalOpen.set(false);
  }

  async saveMember(): Promise<void> {
    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }
    const v = this.memberForm.getRawValue();
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
    const newAmount = Number(v.amount);
    const isCreate = !this.editingId();
    const isPartialOnCreate = isCreate && !!v.isPartialPayment;
    const paidAmount = isPartialOnCreate ? Number(v.paidAmount) : newAmount;
    const pendingAmount = isPartialOnCreate ? Math.max(0, newAmount - paidAmount) : 0;
    if (isPartialOnCreate) {
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        this.toast.error('Enter a valid paid amount');
        return;
      }
      if (paidAmount > newAmount) {
        this.toast.error('Paid amount cannot be greater than total amount');
        return;
      }
    }
    const input = {
      firstName: v.firstName,
      lastName: v.lastName || undefined,
      mobile: v.mobile || undefined,
      email: v.email || undefined,
      address: v.address || undefined,
      floorNumber: v.floorNumber,
      roomNumber: v.roomNumber,
      bedNumber: v.bedNumber,
      gender: v.gender || undefined,
      aadhaarLast4: v.aadhaarLast4 || undefined,
      notes: v.notes || undefined,
      joinDate: join,
      dueDate: due,
      amount: newAmount,
      advancePaid: Math.max(0, Number(v.advancePaid) || 0),
      paidAmount,
      pendingAmount,
      paymentMethod: v.paymentMethod,
      status: v.status,
      subscriptionType: this.isGym() ? v.subscriptionType : undefined,
    };
    try {
      const id = this.editingId();
      if (id) {
        await this.membersApi.updateMember(id, input);
        this.toast.success('Member updated');
        
        // Check if amount changed and update latest payment if confirmed
        if (this.oldAmount !== newAmount) {
          const amountChanged = confirm(
            `Amount changed from ₹${this.oldAmount} to ₹${newAmount}. Do you want to update the latest payment also?`
          );
          
          if (amountChanged) {
            try {
              const latestPayment = await this.paymentsApi.getLatestPaymentForMember(id);
              if (latestPayment) {
                await this.paymentsApi.updatePaymentAmount(latestPayment.paymentId, newAmount);
                this.toast.success('Payment updated successfully');
                console.log(`✅ Payment updated: ${latestPayment.paymentId} amount changed from ₹${latestPayment.amount} to ₹${newAmount}`);
              } else {
                console.log('ℹ️ No payment records found for this member');
              }
            } catch (error) {
              console.error('❌ Error updating payment:', error);
              this.toast.error('Could not update payment');
            }
          }
        }
      } else {
        await this.membersApi.addMember(input);
        this.toast.success('Member added');
      }
      this.closeModal();
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
    }
  }

  async deleteMember(m: Member): Promise<void> {
    if (!confirm(`Remove ${m.firstName} from your list?`)) return;
    try {
      await this.membersApi.deleteMember(m.memberId);
      this.toast.success('Member removed');
    } catch {
      this.toast.error('Could not delete');
    }
  }

  openPay(m: Member): void {
    this.payTarget.set(m);
    const pending = Math.max(0, Number(m.pendingAmount) || 0);
    const plan = Math.max(0, Number(m.amount) || 0);
    /** Default amount to outstanding balance when they owe a split; avoids accidental full renewal. */
    const defaultAmount = pending > 0 ? pending : plan;
    this.payForm.reset({
      amount: defaultAmount,
      method: 'cash',
      subscriptionType: m.subscriptionType ?? 'monthly',
      isPartialPayment: false,
      pendingAmount: pending,
    });
    this.payModalOpen.set(true);
  }

  closePay(): void {
    this.payModalOpen.set(false);
    this.payTarget.set(null);
  }

  async submitPay(): Promise<void> {
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
    if (v.isPartialPayment) {
      if (!Number.isFinite(Number(v.pendingAmount)) || Number(v.pendingAmount) <= 0) {
        this.toast.error('Enter pending amount for partial payment');
        return;
      }
    }

    const priorPending = Math.max(0, Number(m.pendingAmount) || 0);
    const planAmount = Math.max(0, Number(m.amount) || 0);

    try {
      await this.paymentsApi.markPaid({
        memberId: m.memberId,
        ownerId: owner.ownerId,
        amount: Number(v.amount),
        method: v.method,
        currentDueDate: due,
        subscriptionType: this.isGym() ? v.subscriptionType : undefined,
        isPartialPayment: v.isPartialPayment,
        pendingAmount: v.isPartialPayment ? Number(v.pendingAmount) : 0,
        priorPendingAmount: priorPending,
        memberPlanAmount: planAmount,
      });

      this.toast.success(v.isPartialPayment ? 'Partial payment recorded' : 'Payment recorded');
      this.closePay();
    } catch (error) {
      console.error('Record payment failed:', error);
      this.toast.error('Could not record payment');
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

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  formatRoomNumber(floorNumber: number, roomNumber: number): string {
    return formatPgRoomLabel(floorNumber, roomNumber);
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
    this.memberForm.controls.floorNumber.markAsTouched();
    this.memberForm.controls.roomNumber.markAsTouched();
    this.memberForm.controls.bedNumber.markAsTouched();
    this.manualSeatEntryTriggered.set(false);
    this.manualSeatError.set(null);
    this.closeBedPicker();
  }

  onManualSeatInput(): void {
    if (!this.hasSeatLayout()) return;
    this.manualSeatEntryTriggered.set(true);
    const v = this.memberForm.getRawValue();
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

  onMemberMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.memberForm.controls.mobile, event, 10);
  }

  onAadhaarDigitsInput(event: Event): void {
    applyDigitsOnlyFromInput(this.memberForm.controls.aadhaarLast4, event, 12);
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
    const total = Number(m.amount) || 0;
    const pending = Number(m.pendingAmount) || 0;
    return Math.max(0, total - pending);
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

  canSendReceipt(m: Member): boolean {
    if (m.status !== 'active') return false;
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
      const pendingAmount = Math.max(0, Number(m.pendingAmount) || 0);
      const estimatedPaidAmount = Math.max(0, Number(m.amount || 0) - pendingAmount) || Number(m.amount || 0);

      const ownerProfile = this.auth.profile();
      const businessName = ownerProfile?.businessName?.trim() || ownerProfile?.name || 'PayBook';
      const monthText = paymentDate.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
      const mobile = (m.mobile || '').replace(/\D/g, '');
      const fileName = `receipt-${m.firstName}-${monthText.replace(/\s+/g, '-')}.pdf`;
      const receiptNo = `RCPT-${paymentDate.getFullYear()}${String(paymentDate.getMonth() + 1).padStart(2, '0')}${String(
        paymentDate.getDate(),
      ).padStart(2, '0')}-${m.memberId.slice(0, 6).toUpperCase()}`;
      const memberName = `${m.firstName} ${m.lastName || ''}`.trim();
      const paymentDateText = paymentDate.toLocaleDateString('en-IN');

      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;

      // Outer border
      doc.setDrawColor(180, 180, 180);
      doc.rect(8, 8, pageW - 16, 281);

      // Header strip
      doc.setFillColor(16, 185, 129);
      doc.rect(8, 8, pageW - 16, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('PAYMENT RECEIPT', margin, 23);
      doc.setFontSize(11);
      doc.text(businessName.toUpperCase(), pageW - margin, 23, { align: 'right' });

      // Receipt meta
      doc.setTextColor(33, 37, 41);
      doc.setFontSize(10);
      doc.text(`Receipt No: ${receiptNo}`, margin, 42);
      doc.text(`Date: ${paymentDateText}`, pageW - margin, 42, { align: 'right' });

      // Member info box
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(margin, 48, pageW - margin * 2, 34, 2, 2);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('Received From', margin + 4, 56);
      doc.setTextColor(33, 37, 41);
      doc.setFontSize(12);
      doc.text(memberName || '-', margin + 4, 63);
      doc.setFontSize(10);
      doc.text(`Mobile: ${m.mobile || '-'}`, margin + 4, 70);
      doc.text(`Payment Month: ${monthText}`, pageW - margin - 4, 70, { align: 'right' });

      // Amount table
      const tableY = 92;
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, tableY, pageW - margin * 2, 10, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, tableY, pageW - margin * 2, 44);
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text('Description', margin + 4, tableY + 7);
      doc.text('Amount (INR)', pageW - margin - 4, tableY + 7, { align: 'right' });
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, tableY + 10, pageW - margin, tableY + 10);
      doc.setTextColor(33, 37, 41);
      doc.text(`Membership payment - ${monthText}`, margin + 4, tableY + 20);
      doc.text(`Rs ${estimatedPaidAmount.toLocaleString('en-IN')}`, pageW - margin - 4, tableY + 20, { align: 'right' });
      doc.line(margin, tableY + 26, pageW - margin, tableY + 26);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Total Paid', margin + 4, tableY + 36);
      doc.text(`Rs ${estimatedPaidAmount.toLocaleString('en-IN')}`, pageW - margin - 4, tableY + 36, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      // Footer note
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, 150, pageW - margin * 2, 26, 2, 2, 'F');
      doc.setTextColor(22, 101, 52);
      doc.setFontSize(11);
      doc.text('Thank you for your payment!', margin + 4, 160);
      doc.setTextColor(75, 85, 99);
      doc.setFontSize(9);
      doc.text('This is a system-generated receipt. Please keep it for your records.', margin + 4, 167);
      doc.text(`${businessName}`, pageW - margin - 4, 167, { align: 'right' });

      doc.save(fileName);

      const msg = encodeURIComponent(
        `Hi ${m.firstName}, here is your payment receipt for ${monthText}.`,
      );
      const wa = `https://wa.me/91${mobile}?text=${msg}`;
      window.open(wa, '_blank', 'noopener,noreferrer');
    } catch {
      this.toast.error('Could not generate receipt');
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
