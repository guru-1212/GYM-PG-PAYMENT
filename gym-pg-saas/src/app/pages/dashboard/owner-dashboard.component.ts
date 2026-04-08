import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { PgFloorLayout, PgLayout } from '../../core/models/pg-layout.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { ModalComponent } from '../../shared/modal.component';
import { MonthlyEarningsComponent } from '../../shared/monthly-earnings.component';
import { MonthlyEarningsDetailedComponent } from '../../shared/monthly-earnings-detailed.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import {
  coerceFirestoreDate,
  calendarDaysBetween,
  dueRemainingOrOverdueLabel,
  dueUiStatus,
  endOfToday,
  isDateInCalendarMonth,
  overdueCalendarDays,
  startOfDay,
  startOfToday,
  timestampToDate,
} from '../../core/utils/date.utils';

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, NgClass, RouterLink, ReactiveFormsModule, ModalComponent, MonthlyEarningsComponent, MonthlyEarningsDetailedComponent, TranslatePipe],
  templateUrl: './owner-dashboard.component.html',
})
export class OwnerDashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly i18n = inject(TranslationService);

  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly loading = signal(true);
  readonly setupModalOpen = signal(false);
  readonly bedMapModalOpen = signal(false);
  readonly importModalOpen = signal(false);
  readonly importRows = signal<ImportPreviewRow[]>([]);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importDueDateForAll = this.fb.nonNullable.control(false);
  readonly importDueDate = this.fb.nonNullable.control('');
  readonly pgLayout = signal<PgLayout | null>(null);
  readonly showMonthEarnings = signal(false);
  readonly showMonthlyEarningsModal = signal(false);
  readonly recentJoinersExpanded = signal(false);
  readonly memberDetailTarget = signal<Member | null>(null);
  readonly showScrollTopButton = signal(false);

  // Pagination signals
  readonly dueTodayPage = signal(1);
  readonly dueSoonPage = signal(1);
  readonly overduePage = signal(1);
  readonly itemsPerPage = 10;
  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');
  readonly isGym = computed(() => this.auth.profile()?.businessType === 'gym');
  readonly hasPgLayout = computed(() => {
    if ((this.pgLayout()?.floors?.length ?? 0) > 0) return true;
    return this.formToLayoutFloors().some((f) => f.rooms.length > 0);
  });

  readonly dueLabel = computed(() => {
    this.i18n.lang();
    return this.auth.profile()?.businessType === 'pg'
      ? this.i18n.t('fees.rentDue')
      : this.i18n.t('fees.planExpiry');
  });

  readonly subscriptionDaysRemaining = computed(() => {
    const profile = this.auth.profile();
    if (!profile?.planEndDate) return null;
    const planEndDate = profile.planEndDate.toDate?.() || new Date(profile.planEndDate as any);
    const daysRemaining = calendarDaysBetween(startOfToday(), planEndDate);
    return Math.max(0, daysRemaining);
  });

  readonly totalMembers = computed(() => this.members().filter((m) => m.status === 'active').length);

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

    // Debug log
    console.log('🔍 Monthly Earnings Calculation:', {
      timestamp: now.toISOString(),
      currentMonth,
      currentYear,
      loggedInOwnerId,
      paymentsCount: payments.length,
      payments: payments.map((p) => ({
        paymentId: p.paymentId,
        amount: p.amount,
        ownerId: p.ownerId,
        date: this.convertTimestampToDate(p.date),
      })),
    });

    const monthlySum = payments.reduce((sum, payment) => {
      // 1. Match ownerId with logged-in user
      if (payment.ownerId !== loggedInOwnerId) {
        return sum;
      }

      // 2. Convert Firestore Timestamp to JS Date using toDate()
      const paymentDate = this.convertTimestampToDate(payment.date);

      if (!paymentDate) {
        console.warn('⚠️ Could not parse payment date:', payment);
        return sum;
      }

      // 3. Filter by current month AND year
      const paymentMonth = paymentDate.getMonth();
      const paymentYear = paymentDate.getFullYear();

      if (paymentMonth !== currentMonth || paymentYear !== currentYear) {
        return sum;
      }

      // 4. Add to sum
      const amount = Number(payment.amount) || 0;
      console.log('✅ Payment included:', {
        amount,
        date: paymentDate.toISOString(),
        runningTotal: sum + amount,
      });
      return sum + amount;
    }, 0);

    console.log('💰 Monthly Earnings Total:', monthlySum);
    return monthlySum;
  });

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
    floorCount: [1, [Validators.required, Validators.min(1), Validators.max(8)]],
    floors: this.fb.array([]),
  });

  private unsubM: (() => void) | null = null;
  private unsubP: (() => void) | null = null;
  private unsubLayout: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.payments.set([]);
    console.log('🚀 Dashboard init started');
    await this.auth.refreshProfile();
    const uid = this.auth.profile()?.ownerId;
    console.log('👤 Logged-in user ID:', uid);
    if (!uid) {
      this.loading.set(false);
      console.error('❌ No owner ID found');
      return;
    }
    console.log('📡 Setting up data listeners for owner:', uid);
    this.attach(uid);
  }

  ngOnDestroy(): void {
    this.unsubM?.();
    this.unsubP?.();
    this.unsubLayout?.();
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const scrollPosition = window.scrollY;
    this.showScrollTopButton.set(scrollPosition > 300);
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private attach(ownerId: string): void {
    this.unsubM?.();
    this.unsubP?.();
    this.unsubLayout?.();

    // Members listener
    this.unsubM = this.membersApi.watchMembersForOwner(ownerId, (list) => {
      console.log('👥 Members loaded:', list.length);
      this.members.set(list);
    });

    // Payments listener - CRITICAL: Verify ownerId matches
    this.unsubP = this.paymentsApi.watchPaymentsForOwner(ownerId, (list) => {
      const filtered = list.filter((p) => p.ownerId === ownerId);
      console.log(
        `💳 Payments loaded: ${filtered.length} out of ${list.length} (filtered for ownerId: ${ownerId})`,
      );
      filtered.forEach((p, i) => {
        const pDate = (p.date as any) instanceof Object && 'toDate' in (p.date as any) ? (p.date as any).toDate() : p.date;
        console.log(`  Payment ${i + 1}: Amount=${p.amount}, Date=${pDate}, OwnerId=${p.ownerId}`);
      });
      this.payments.set(filtered);
      // Mark loading as complete once payments are loaded
      this.loading.set(false);
    });

    // Layout listener
    this.unsubLayout = this.pgLayoutApi.watchLayout(ownerId, (layout) => {
      console.log('🏗️ PG Layout loaded');
      this.pgLayout.set(layout);
    });
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
    this.setupModalOpen.set(true);
  }

  closeSetupModal(): void {
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
    this.importModalOpen.set(true);
  }

  closeImportModal(): void {
    this.importModalOpen.set(false);
  }

  downloadSampleCsv(): void {
    let sample: string;
    if (this.isPg()) {
      sample = [
        'name,mobile,plan,dueDate,subscriptionType,floor,room,bed',
        'Ravi Kumar,9876543210,4000,2026-04-30,monthly,1,101,1',
        'Priya Singh,9988776655,5000,2026-05-15,quarterly,5,503,3',
        'Amit Patel,9123456789,3500,2026-06-10,monthly,4,407,2',
      ].join('\n');
    } else {
      sample = [
        'name,mobile,plan,dueDate,subscriptionType,floor,room,bed',
        'Ravi Kumar,9876543210,2500,2026-04-30,monthly,,',
        'Anita Sharma,9988776655,3200,2026-05-15,quarterly,,',
        'Vikram Singh,9123456789,2000,2026-05-20,monthly,,',
      ].join('\n');
    }
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'members-import-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
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
      const subText = this.readCol(cols, idx.subscriptionType).toLowerCase();
      const floor = this.readCol(cols, idx.floor);
      const room = this.readCol(cols, idx.room);
      const bed = this.readCol(cols, idx.bed);

      const errors: string[] = [];
      if (!firstName) errors.push('Name is required');
      const amount = Number(planText);
      if (!Number.isFinite(amount) || amount <= 0) errors.push('Plan should be a positive number');
      const subscriptionType = (subText || 'monthly') as SubscriptionType;
      if (!['monthly', 'quarterly', 'yearly'].includes(subscriptionType)) {
        errors.push('subscriptionType should be monthly/quarterly/yearly');
      }
      const dueDate = this.parseDateInput(dueDateText);
      if (!dueDate) errors.push('dueDate should be YYYY-MM-DD');
      if (mobile && mobile.length !== 10) errors.push('Mobile should be 10 digits');

      const assignedBed = this.resolveBedForImport(floor, room, bed);
      const identityLoc = this.identityLocationParts(assignedBed.floorNumber, assignedBed.roomNumber, assignedBed.bedNumber);
      const key = this.memberIdentityKey(firstName, lastName, mobile, identityLoc.floorNumber, identityLoc.roomNumber, identityLoc.bedNumber);
      if (existingKeys.has(key)) errors.push('Member details already exist');
      if (fileKeys.has(key)) errors.push('Duplicate row in file');
      fileKeys.add(key);

      if (assignedBed.error) errors.push(assignedBed.error);

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
    this.importBusy.set(true);
    let imported = 0;
    for (const row of validRows) {
      const due = dueForAll || this.parseDateInput(row.dueDate);
      if (!due) continue;
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
          paymentMethod: 'cash', // Default to cash for bulk import
          status: 'active',
          subscriptionType: owner.businessType === 'gym' ? row.subscriptionType : 'monthly',
        });
        imported += 1;
      } catch {
        // Skip failed row, continue import.
      }
    }
    this.importBusy.set(false);
    this.toast.success(`Imported ${imported} members. Skipped ${validRows.length - imported}.`);
    this.closeImportModal();
  }

  onFloorCountChange(raw: unknown): void {
    const count = this.coerceCount(raw, 1, 8);
    this.setupForm.controls.floorCount.setValue(count);
    this.rebuildFloors(count);
  }

  onRoomCountChange(floorIndex: number, raw: unknown): void {
    const rooms = this.roomGroupsAt(floorIndex);
    const count = this.coerceCount(raw, 1, 100);
    const floorGroup = this.floorGroups.at(floorIndex);
    floorGroup.get('roomCount')?.setValue(count);
    while (rooms.length < count) {
      rooms.push(
        this.fb.nonNullable.group({
          roomNumber: rooms.length + 1,
          beds: [1, [Validators.required, Validators.min(1)]],
        }),
      );
    }
    while (rooms.length > count) {
      rooms.removeAt(rooms.length - 1);
    }
    this.renumberRooms(floorIndex);
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
    const floorCount = Math.min(8, Math.max(1, layout.floors.length || 1));
    this.setupForm.controls.floorCount.setValue(floorCount);
    this.floorGroups.clear();
    for (let i = 0; i < floorCount; i += 1) {
      const floor = layout.floors[i] ?? { floorNumber: i + 1, rooms: [{ roomNumber: 1, beds: 1 }] };
      const rooms = this.fb.array(
        (floor.rooms.length ? floor.rooms : [{ roomNumber: 1, beds: 1 }]).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: i + 1,
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private rebuildFloors(targetCount: number): void {
    const current = this.formToLayoutFloors();
    this.floorGroups.clear();
    for (let i = 0; i < targetCount; i += 1) {
      const floor = current[i] ?? { floorNumber: i + 1, rooms: [{ roomNumber: 1, beds: 1 }] };
      const rooms = this.fb.array(
        (floor.rooms.length ? floor.rooms : [{ roomNumber: 1, beds: 1 }]).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: i + 1,
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
      }));
      return {
        floorNumber: floorIdx + 1,
        rooms,
      };
    });
  }

  private coerceCount(v: unknown, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  formatRoomNumber(floorNumber: number, roomNumber: number): string {
    return `${floorNumber}${roomNumber.toString().padStart(2, '0')}`;
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f <= 0 || r <= 0 || b <= 0) return '';
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

  private resolveBedForImport(
    floorRaw: string,
    roomRaw: string,
    bedRaw: string,
  ): { floorNumber: string; roomNumber: string; bedNumber: string; error?: string } {
    const floor = String(floorRaw || '').trim();
    const room = String(roomRaw || '').trim();
    const bed = String(bedRaw || '').trim();
    if (!this.isPg()) return { floorNumber: '', roomNumber: '', bedNumber: '' };
    if (!room || !bed) return { floorNumber: '', roomNumber: '', bedNumber: '' };

    // Try to parse room number - check if it contains floor info (e.g., 101, 407, 503)
    const roomNum = Number(room);
    let f: number;
    let r: number;

    if (!Number.isFinite(roomNum) || roomNum <= 0) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Invalid room/floor format' };
    }

    // If room number >= 100, extract floor and room (e.g., 101 -> floor=1, room=1)
    if (roomNum >= 100) {
      f = Math.floor(roomNum / 100);
      r = roomNum % 100;
      
      // If floor is also provided separately, validate it matches
      if (floor) {
        const floorNum = Number(floor);
        if (Number.isFinite(floorNum) && floorNum !== f) {
          return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Floor mismatch: data has floor 1 but room 501' };
        }
      }
    } else {
      // Otherwise use floor and room separately (old format)
      if (!floor) return { floorNumber: '', roomNumber: '', bedNumber: '' };
      f = Number(floor);
      r = roomNum;
      
      if (!Number.isFinite(f) || f <= 0) {
        return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Invalid floor value' };
      }
    }

    const b = Number(bed);
    if (!Number.isFinite(b) || b <= 0) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Invalid bed value' };
    }

    // Validate against layout
    const fl = (this.pgLayout()?.floors || []).find((x) => Number(x.floorNumber) === Math.trunc(f));
    const rm = fl?.rooms.find((x) => Number(x.roomNumber) === Math.trunc(r));
    if (!fl || !rm) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: `Floor ${f}, Room ${r} not found in layout` };
    }
    if (Math.trunc(b) > Number(rm.beds || 0)) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: `Bed ${b} not found in room` };
    }
    if (this.isBedOccupied(f, r, b)) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Bed already occupied' };
    }
    return { floorNumber: String(Math.trunc(f)), roomNumber: String(Math.trunc(r)), bedNumber: String(Math.trunc(b)) };
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
