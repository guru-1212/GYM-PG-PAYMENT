import { Component, computed, signal, input, output } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Payment } from '../core/models/payment.model';
import { Member } from '../core/models/member.model';

@Component({
  selector: 'app-monthly-earnings-detailed',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  templateUrl: './monthly-earnings-detailed.component.html',
  styleUrls: ['./monthly-earnings-detailed.component.scss'],
})
export class MonthlyEarningsDetailedComponent {
  readonly paymentsInput = input<Payment[]>([]);
  readonly membersInput = input<Member[]>([]);
  readonly closed = output<void>();

  readonly months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  readonly selectedMonth = signal('April');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly filterMethod = signal<'all' | 'cash' | 'online'>('all');

  readonly selectedMonthIndex = computed(() => this.months.indexOf(this.selectedMonth()));

  readonly filteredPayments = computed(() => {
    const monthIndex = this.selectedMonthIndex();
    const year = this.selectedYear();
    const method = this.filterMethod();
    const payments = this.paymentsInput();

    return payments.filter((payment) => {
      const paymentDate = payment.date?.toDate?.() || new Date(payment.date as any);
      const paymentMonth = paymentDate.getMonth();
      const paymentYear = paymentDate.getFullYear();

      const monthMatch = paymentMonth === monthIndex;
      const yearMatch = paymentYear === year;

      let methodMatch = true;
      if (method === 'cash') {
        methodMatch = payment.method === 'cash';
      } else if (method === 'online') {
        methodMatch = payment.method === 'upi' || payment.method === 'card';
      }

      return monthMatch && yearMatch && methodMatch;
    });
  });

  readonly displayedPayments = computed(() => {
    const members = this.membersInput();
    return this.filteredPayments().map((payment) => {
      const member = members.find((m) => m.memberId === payment.memberId);
      const paymentDate = payment.date?.toDate?.() || new Date(payment.date as any);
      return {
        payment,
        paymentDate,
        memberName: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
      };
    });
  });

  readonly totalMonthEarnings = computed(() => {
    return this.filteredPayments().reduce((sum, payment) => sum + payment.amount, 0);
  });

  selectMonth(month: string): void {
    this.selectedMonth.set(month);
    this.filterMethod.set('all');
  }

  incrementYear(): void {
    this.selectedYear.update((year) => year + 1);
  }

  decrementYear(): void {
    this.selectedYear.update((year) => Math.max(2020, year - 1));
  }

  filterByMethod(method: 'all' | 'cash' | 'online'): void {
    if (method === 'all') {
      this.filterMethod.set('all');
    } else {
      this.filterMethod.set(this.filterMethod() === method ? 'all' : method);
    }
  }

  downloadPDF(): void {
    if (this.filteredPayments().length === 0) return;

    const csv =
      'Name,Payment Date,Amount,Payment Method\n' +
      this.displayedPayments()
        .map(
          (item) =>
            `"${item.memberName}","${item.paymentDate.toLocaleDateString()}","₹${item.payment.amount}","${item.payment.method}"`
        )
        .join('\n') +
      `\n\nTotal Earnings,₹${this.totalMonthEarnings()}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `earnings-${this.selectedMonth()}-${this.selectedYear()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  onClose(): void {
    this.closed.emit();
  }
}
