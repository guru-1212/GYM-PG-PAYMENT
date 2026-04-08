import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { jsPDF } from 'jspdf';
import { Member } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { dueUiStatus, endOfToday, timestampToDate } from '../../core/utils/date.utils';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslatePipe],
  templateUrl: './payments-page.component.html',
})
export class PaymentsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly i18n = inject(TranslationService);

  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly methodFilter = signal<string>('');
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');

  // Pagination signals
  readonly itemsPerPage = 10;
  readonly dueTodayPage = signal<number>(1);
  readonly overduePage = signal<number>(1);
  readonly paidUpPage = signal<number>(1);
  readonly paymentsTablePage = signal<number>(1);

  readonly dueLabel = computed(() => {
    this.i18n.lang();
    return this.auth.profile()?.businessType === 'pg'
      ? this.i18n.t('fees.rentDue')
      : this.i18n.t('fees.planExpiry');
  });

  readonly memberNameById = computed(() => {
    const map = new Map<string, string>();
    for (const m of this.members()) {
      map.set(m.memberId, `${m.firstName} ${m.lastName || ''}`.trim());
    }
    return map;
  });

  readonly filteredPayments = computed(() => {
    const payments = this.payments();
    const method = this.methodFilter();
    const fromDateValue = this.fromDate();
    const toDateValue = this.toDate();
    const start = fromDateValue ? new Date(fromDateValue) : null;
    const end = toDateValue ? new Date(toDateValue) : null;
    if (end) {
      end.setHours(23, 59, 59, 999);
    }
    return payments.filter((p) => {
      if (method && p.method !== method) return false;
      const date = p.date.toDate();
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  });

  readonly paymentMethodCounts = computed(() => {
    const counts = { cash: 0, upi: 0, card: 0 };
    for (const p of this.filteredPayments()) {
      counts[p.method] += 1;
    }
    return counts;
  });

  readonly paymentMethodSums = computed(() => {
    const sums = { cash: 0, upi: 0, card: 0 };
    for (const p of this.filteredPayments()) {
      sums[p.method] += Number(p.amount) || 0;
    }
    return sums;
  });

  readonly dueToday = computed(() => {
    return this.members().filter((m) => {
      if (m.status !== 'active') return false;
      const d = timestampToDate(m.dueDate);
      return d && dueUiStatus(d) === 'dueToday';
    });
  });

  readonly overdue = computed(() => {
    return this.members().filter((m) => {
      if (m.status !== 'active') return false;
      const d = timestampToDate(m.dueDate);
      return d && dueUiStatus(d) === 'overdue';
    });
  });

  readonly paidUp = computed(() => {
    const end = endOfToday();
    return this.members().filter((m) => {
      if (m.status !== 'active') return false;
      const d = timestampToDate(m.dueDate);
      return d && d > end;
    });
  });

  // Paginated data computed signals
  readonly paginatedDueToday = computed(() => {
    const data = this.dueToday();
    const page = this.dueTodayPage();
    const start = (page - 1) * this.itemsPerPage;
    return data.slice(start, start + this.itemsPerPage);
  });

  readonly dueTodayPages = computed(() => {
    return Math.ceil(this.dueToday().length / this.itemsPerPage);
  });

  readonly paginatedOverdue = computed(() => {
    const data = this.overdue();
    const page = this.overduePage();
    const start = (page - 1) * this.itemsPerPage;
    return data.slice(start, start + this.itemsPerPage);
  });

  readonly overduePages = computed(() => {
    return Math.ceil(this.overdue().length / this.itemsPerPage);
  });

  readonly paginatedPaidUp = computed(() => {
    const data = this.paidUp();
    const page = this.paidUpPage();
    const start = (page - 1) * this.itemsPerPage;
    return data.slice(start, start + this.itemsPerPage);
  });

  readonly paidUpPages = computed(() => {
    return Math.ceil(this.paidUp().length / this.itemsPerPage);
  });

  readonly paginatedPayments = computed(() => {
    const data = this.filteredPayments();
    const page = this.paymentsTablePage();
    const start = (page - 1) * this.itemsPerPage;
    return data.slice(start, start + this.itemsPerPage);
  });

  readonly paymentsTablePages = computed(() => {
    return Math.ceil(this.filteredPayments().length / this.itemsPerPage);
  });

  private unsubM: (() => void) | null = null;
  private unsubP: (() => void) | null = null;

  ngOnInit(): void {
    const id = this.auth.profile()?.ownerId;
    if (!id) return;
    this.unsubM = this.membersApi.watchMembersForOwner(id, (list) => this.members.set(list));
    this.unsubP = this.paymentsApi.watchPaymentsForOwner(id, (list) => this.payments.set(list));
  }

  ngOnDestroy(): void {
    this.unsubM?.();
    this.unsubP?.();
  }

  nameForPayment(p: Payment): string {
    return this.memberNameById().get(p.memberId) || 'Member';
  }

  async downloadPaymentsPdf(): Promise<void> {
    const payments = this.filteredPayments();
    const now = new Date();
    const fileName = `payments-${now.toISOString().slice(0, 10)}.pdf`;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const rowHeight = 8;
    // Adjusted columns for more details: Date, Member, Amount, Method, Payment ID, Created At, Partial, Pending
    const columns = [margin, margin + 25, margin + 65, margin + 95, margin + 125, margin + 155, margin + 185, margin + 205];
    let y = margin;
    let pageNumber = 1;

    const drawHeader = (): void => {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(this.i18n.t('payments.allPayments'), margin, y);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const filterText = this.methodFilter()
        ? `${this.i18n.t('payments.filterByMethod')}: ${this.i18n.t(`payments.${this.methodFilter()}`)}`
        : `${this.i18n.t('payments.filterByMethod')}: ${this.i18n.t('payments.all')}`;
      doc.text(filterText, margin, y + rowHeight);
      doc.text(
        this.i18n.t('payments.generatedAt', { date: now.toLocaleString('en-IN') }),
        pageWidth - margin,
        y + rowHeight,
        { align: 'right' },
      );

      y += rowHeight * 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(this.i18n.t('payments.date'), columns[0], y);
      doc.text(this.i18n.t('payments.member'), columns[1], y);
      doc.text(this.i18n.t('payments.amount'), columns[2], y);
      doc.text(this.i18n.t('payments.method'), columns[3], y);
      doc.text(this.i18n.t('payments.paymentId'), columns[4], y);
      doc.text(this.i18n.t('payments.createdAt'), columns[5], y);
      doc.text(this.i18n.t('payments.isPartial'), columns[6], y);
      doc.text(this.i18n.t('payments.pendingAmount'), columns[7], y);
      y += rowHeight;
      doc.setDrawColor(200);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);
      y += 1;
    };

    const drawFooter = (): void => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    };

    const startPage = (): void => {
      drawFooter();
      doc.addPage();
      pageNumber += 1;
      y = margin;
      drawHeader();
    };

    drawHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const rowText = (text: string, x: number, maxWidth: number): void => {
      const trimmed = typeof text === 'string' ? text : String(text);
      doc.text(trimmed, x, y, { maxWidth });
    };

    for (const payment of payments) {
      if (y + rowHeight * 2 > pageHeight - margin) {
        startPage();
      }

      rowText(payment.date.toDate().toLocaleDateString('en-IN'), columns[0], columns[1] - columns[0] - 2);
      rowText(this.nameForPayment(payment), columns[1], columns[2] - columns[1] - 2);
      rowText(`₹${payment.amount.toLocaleString('en-IN')}`, columns[2], columns[3] - columns[2] - 2);
      rowText(payment.method.toUpperCase(), columns[3], columns[4] - columns[3] - 2);
      rowText(payment.paymentId.slice(-8), columns[4], columns[5] - columns[4] - 2); // Show last 8 chars of ID
      rowText(payment.createdAt.toDate().toLocaleDateString('en-IN'), columns[5], columns[6] - columns[5] - 2);
      rowText(payment.isPartialPayment ? 'Yes' : 'No', columns[6], columns[7] - columns[6] - 2);
      rowText(payment.pendingAmount ? `₹${payment.pendingAmount.toLocaleString('en-IN')}` : '-', columns[7], pageWidth - columns[7] - margin);
      y += rowHeight;
    }

    if (payments.length === 0) {
      doc.text(this.i18n.t('payments.noPaymentsYet'), margin, y + rowHeight);
    }

    doc.setFontSize(9);
    doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    doc.save(fileName);
  }

  onMethodFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.methodFilter.set(target.value);
    this.paymentsTablePage.set(1); // Reset to first page when filter changes
  }

  onFromDateChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.fromDate.set(target.value);
    this.paymentsTablePage.set(1); // Reset to first page when filter changes
  }

  onToDateChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toDate.set(target.value);
    this.paymentsTablePage.set(1); // Reset to first page when filter changes
  }

  // Pagination methods
  setDueTodayPage(page: number): void {
    if (page >= 1 && page <= this.dueTodayPages()) {
      this.dueTodayPage.set(page);
    }
  }

  setOverduePage(page: number): void {
    if (page >= 1 && page <= this.overduePages()) {
      this.overduePage.set(page);
    }
  }

  setPaidUpPage(page: number): void {
    if (page >= 1 && page <= this.paidUpPages()) {
      this.paidUpPage.set(page);
    }
  }

  setPaymentsTablePage(page: number): void {
    if (page >= 1 && page <= this.paymentsTablePages()) {
      this.paymentsTablePage.set(page);
    }
  }
}
