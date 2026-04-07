import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { jsPDF } from 'jspdf';
import { Subscription } from 'rxjs';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { PgLayout } from '../../core/models/pg-layout.model';
import { Payment, PaymentMethod } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
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
import { optionalDigitsLen, positiveAmount } from '../../core/utils/validators';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, ModalComponent, TranslatePipe],
  templateUrl: './members.component.html',
})
export class MembersComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly members = signal<Member[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly payFilter = signal<'all' | 'paid' | 'pending'>('all');
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
  readonly bedPickerOpen = signal(false);
  readonly pgLayout = signal<PgLayout | null>(null);
  private historyUnsub: (() => void) | null = null;
  private layoutUnsub: (() => void) | null = null;
  private readonly i18n = inject(TranslationService);

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
    const end = endOfToday();
    if (pf === 'paid') {
      list = list.filter((m) => {
        const d = timestampToDate(m.dueDate);
        return d && d > end;
      });
    } else if (pf === 'pending') {
      list = list.filter((m) => {
        const d = timestampToDate(m.dueDate);
        return d && d <= end;
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

  readonly memberForm = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: [''],
    mobile: ['', optionalDigitsLen(10)],
    email: [''],
    address: [''],
    floorNumber: ['', Validators.required],
    roomNumber: ['', Validators.required],
    bedNumber: ['', Validators.required],
    gender: this.fb.control<'male' | 'female' | 'other' | ''>(''),
    aadhaarLast4: ['', optionalDigitsLen(4)],
    notes: [''],
    joinDate: ['', Validators.required],
    dueDate: ['', Validators.required],
    amount: [0, [Validators.required, positiveAmount()]],
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
    pendingAmount: [0, [positiveAmount()]],
  });

  private unsub: (() => void) | null = null;
  private querySub: Subscription | null = null;

  async ngOnInit(): Promise<void> {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const pay = params.get('pay');
      if (pay === 'all' || pay === 'paid' || pay === 'pending') {
        this.payFilter.set(pay);
      }

      const due = params.get('due');
      if (due === 'dueToday' || due === 'overdue' || due === 'dueSoon') {
        this.dueSectionFilter.set(due);
      } else {
        this.dueSectionFilter.set('all');
      }
    });

    await this.auth.refreshProfile();
    const id = this.auth.profile()?.ownerId;
    if (id) {
      this.unsub = this.membersApi.watchMembersForOwner(id, (list) => this.members.set(list));
      this.layoutUnsub = this.pgLayoutApi.watchLayout(id, (layout) => this.pgLayout.set(layout));
    }
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.historyUnsub?.();
    this.layoutUnsub?.();
    this.querySub?.unsubscribe();
  }

  clearDueSectionFilter(): void {
    this.dueSectionFilter.set('all');
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
      status: 'active',
      subscriptionType: 'monthly',
    });
    this.modalOpen.set(true);
  }

  openEdit(m: Member): void {
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
      floorNumber: m.floorNumber || '',
      roomNumber: m.roomNumber || '',
      bedNumber: m.bedNumber || '',
      gender: (m.gender as 'male' | 'female' | 'other' | undefined) || '',
      aadhaarLast4: m.aadhaarLast4 || '',
      notes: m.notes || '',
      joinDate: joinStr,
      dueDate: dueStr,
      amount: m.amount,
      paymentMethod: 'cash', // Default to cash for existing members
      status: m.status,
      subscriptionType: m.subscriptionType || 'monthly',
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  async saveMember(): Promise<void> {
    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }
    const v = this.memberForm.getRawValue();
    if (this.hasSeatLayout() && this.isBedOccupied(v.floorNumber, v.roomNumber, v.bedNumber)) {
      this.toast.error('Selected bed is already occupied');
      return;
    }
    const join = new Date(v.joinDate + 'T12:00:00');
    const due = new Date(v.dueDate + 'T12:00:00');
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
      amount: Number(v.amount),
      paymentMethod: v.paymentMethod,
      status: v.status,
      subscriptionType: this.isGym() ? v.subscriptionType : undefined,
    };
    try {
      const id = this.editingId();
      if (id) {
        await this.membersApi.updateMember(id, input);
        this.toast.success('Member updated');
      } else {
        await this.membersApi.addMember(input);
        this.toast.success('Member added');
      }
      this.closeModal();
    } catch {
      this.toast.error('Could not save member');
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
    this.payForm.reset({
      amount: m.amount,
      method: 'cash',
      subscriptionType: m.subscriptionType ?? 'monthly',
      isPartialPayment: false,
      pendingAmount: Number(m.pendingAmount) || 0,
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
    if (v.isPartialPayment && (!Number.isFinite(Number(v.pendingAmount)) || Number(v.pendingAmount) <= 0)) {
      this.toast.error('Enter pending amount for partial payment');
      return;
    }
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
      });
      this.toast.success(v.isPartialPayment ? 'Partial payment recorded' : 'Payment recorded');
      this.closePay();
    } catch {
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

  openBedPicker(): void {
    if (!this.hasSeatLayout()) return;
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
    return `${floorNumber}${roomNumber.toString().padStart(2, '0')}`;
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
    this.closeBedPicker();
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
    if (f <= 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }
}
