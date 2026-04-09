import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Payment } from '../../core/models/payment.model';
import { Member } from '../../core/models/member.model';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { PaymentService } from '../../core/services/payment.service';
import { MemberService } from '../../core/services/member.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-monthly-earnings-page',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, TranslatePipe],
  templateUrl: './monthly-earnings-page.component.html',
  styleUrl: './monthly-earnings-page.component.scss',
})
export class MonthlyEarningsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(DataCacheService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly membersApi = inject(MemberService);
  private readonly i18n = inject(TranslationService);

  // Expose Math to template
  readonly Math = Math;

  readonly months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  readonly years = this.generateYears();
  
  readonly payments = signal<Payment[]>([]);
  readonly members = signal<Member[]>([]);
  readonly selectedMonth = signal(new Date().getMonth());
  readonly selectedYear = signal(new Date().getFullYear());

  private paymentsUnsub: (() => void) | null = null;
  private membersUnsub: (() => void) | null = null;

  readonly monthlyEarnings = computed(() => {
    const month = this.selectedMonth();
    const year = this.selectedYear();
    let total = 0;
    
    for (const payment of this.payments()) {
      const pDate = payment.date instanceof Object && 'toDate' in payment.date 
        ? (payment.date as any).toDate() 
        : new Date(payment.date as any);
      
      if (pDate.getMonth() === month && pDate.getFullYear() === year) {
        total += Number(payment.amount) || 0;
      }
    }
    return total;
  });

  readonly paymentsByDay = computed(() => {
    const month = this.selectedMonth();
    const year = this.selectedYear();
    const days = new Map<number, { amount: number; count: number; payments: Payment[] }>();
    
    for (const payment of this.payments()) {
      const pDate = payment.date instanceof Object && 'toDate' in payment.date 
        ? (payment.date as any).toDate() 
        : new Date(payment.date as any);
      
      if (pDate.getMonth() === month && pDate.getFullYear() === year) {
        const day = pDate.getDate();
        const existing = days.get(day) || { amount: 0, count: 0, payments: [] };
        existing.amount += Number(payment.amount) || 0;
        existing.count += 1;
        existing.payments.push(payment);
        days.set(day, existing);
      }
    }
    
    return Array.from(days.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([day, data]) => ({ day, ...data }));
  });

  readonly yearlyEarnings = computed(() => {
    const year = this.selectedYear();
    const earnings = new Array(12).fill(0);
    
    for (const payment of this.payments()) {
      const pDate = payment.date instanceof Object && 'toDate' in payment.date 
        ? (payment.date as any).toDate() 
        : new Date(payment.date as any);
      
      if (pDate.getFullYear() === year) {
        const month = pDate.getMonth();
        earnings[month] += Number(payment.amount) || 0;
      }
    }
    return earnings;
  });

  readonly maxPayment = computed(() => {
    const days = this.paymentsByDay();
    if (days.length === 0) return 0;
    return Math.max(...days.map((d) => d.amount));
  });

  readonly monthlyPaymentsWithMembers = computed(() => {
    const month = this.selectedMonth();
    const year = this.selectedYear();
    const memberMap = new Map(this.members().map(m => [m.memberId, m]));
    const paymentsList: Array<Payment & { memberName: string; memberMobile: string }> = [];
    
    for (const payment of this.payments()) {
      const pDate = payment.date instanceof Object && 'toDate' in payment.date 
        ? (payment.date as any).toDate() 
        : new Date(payment.date as any);
      
      if (pDate.getMonth() === month && pDate.getFullYear() === year) {
        const member = memberMap.get(payment.memberId);
        paymentsList.push({
          ...payment,
          memberName: member ? `${member.firstName} ${member.lastName || ''}`.trim() : 'Unknown',
          memberMobile: member?.mobile || 'N/A',
        });
      }
    }
    
    // Sort by date descending
    return paymentsList.sort((a, b) => {
      const dateA = a.date instanceof Object && 'toDate' in a.date 
        ? (a.date as any).toDate() 
        : new Date(a.date as any);
      const dateB = b.date instanceof Object && 'toDate' in b.date 
        ? (b.date as any).toDate() 
        : new Date(b.date as any);
      return dateB.getTime() - dateA.getTime();
    });
  });

  ngOnInit(): void {
    const ownerId = this.auth.profile()?.ownerId;
    if (ownerId) {
      this.paymentsUnsub = this.paymentsApi.watchPaymentsForOwner(ownerId, (payments) => {
        this.payments.set(payments);
      });
      this.membersUnsub = this.membersApi.watchMembersForOwner(ownerId, (members) => {
        this.members.set(members);
      });
    }
  }

  ngOnDestroy(): void {
    this.paymentsUnsub?.();
    this.membersUnsub?.();
  }

  selectMonth(month: number): void {
    this.selectedMonth.set(month);
  }

  selectYear(year: number): void {
    this.selectedYear.set(year);
  }

  previousYear(): void {
    this.selectedYear.set(this.selectedYear() - 1);
  }

  nextYear(): void {
    this.selectedYear.set(this.selectedYear() + 1);
  }

  generatePDF(): void {
    const month = this.selectedMonth();
    const year = this.selectedYear();
    const monthName = this.months[month];
    const payments = this.monthlyPaymentsWithMembers();
    const total = this.monthlyEarnings();
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 20;
    
    // Title
    doc.setFontSize(18);
    doc.text(`Monthly Earnings Report`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 12;
    
    // Header info
    doc.setFontSize(12);
    doc.text(`${monthName} ${year}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 12;
    
    const profile = this.auth.profile();
    doc.setFontSize(10);
    doc.text(`Organization: ${profile?.name || 'N/A'}`, 14, currentY);
    currentY += 8;
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, currentY);
    currentY += 12;
    
    // Summary
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text('Summary', 14, currentY);
    currentY += 8;
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Total Earnings: ${this.formatCurrency(total)}`, 14, currentY);
    currentY += 6;
    doc.text(`Number of Payments: ${payments.length}`, 14, currentY);
    currentY += 6;
    doc.text(
      `Average Payment: ${this.formatCurrency(payments.length > 0 ? total / payments.length : 0)}`, 
      14, 
      currentY
    );
    currentY += 14;
    
    // Table Headers
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setFillColor(79, 70, 229);
    doc.setTextColor(255, 255, 255);
    
    const colWidth = (pageWidth - 28) / 5;
    const headers = ['Date', 'Member', 'Mobile', 'Amount', 'Method'];
    let colX = 14;
    
    for (const header of headers) {
      doc.rect(colX, currentY - 5, colWidth, 8, 'F');
      doc.text(header, colX + 2, currentY, { maxWidth: colWidth - 4 });
      colX += colWidth;
    }
    currentY += 10;
    
    // Table rows
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    let rowCount = 0;
    
    for (const payment of payments) {
      // Check if we need a new page
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = 14;
      }
      
      const pDate = this.getPaymentDate(payment);
      const dateStr = pDate.toLocaleDateString();
      const amountStr = this.formatCurrency(payment.amount);
      const methodStr = payment.method || 'Cash';
      
      // Alternate row background
      if (rowCount % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY - 4, pageWidth - 28, 6, 'F');
      }
      
      colX = 14;
      const rowData = [dateStr, payment.memberName, payment.memberMobile, amountStr, methodStr];
      
      for (const data of rowData) {
        doc.text(data, colX + 2, currentY, { maxWidth: colWidth - 4 });
        colX += colWidth;
      }
      
      currentY += 8;
      rowCount++;
    }
    
    // Footer with page number
    const docInternal = doc as any;
    const totalPages = docInternal.internal?.pages?.length || 1;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Page 1 of ${totalPages - 1}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    
    // Save PDF
    doc.save(`earnings-${monthName}-${year}.pdf`);
  }

  getPaymentDate(payment: Payment): Date {
    return payment.date instanceof Object && 'toDate' in payment.date 
      ? (payment.date as any).toDate() 
      : new Date(payment.date as any);
  }

  private generateYears(): number[] {
    const now = new Date().getFullYear();
    const years = [];
    for (let i = now - 5; i <= now + 1; i++) {
      years.push(i);
    }
    return years;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
}
