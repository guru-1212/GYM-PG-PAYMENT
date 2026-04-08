import { Component, computed, signal, input, output } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Payment } from '../core/models/payment.model';
import { Member } from '../core/models/member.model';

@Component({
  selector: 'app-monthly-earnings',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  template: `
    <div class="fixed inset-0 z-40 overflow-hidden bg-black/50 backdrop-blur-sm" (click)="onBackdropClick()">
      <div class="absolute inset-y-0 right-0 h-screen w-full max-w-5xl overflow-y-auto overflow-x-hidden bg-white shadow-2xl">
        <!-- Header -->
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-6">
          <div>
            <h1 class="text-3xl font-bold text-slate-900">Monthly Earnings</h1>
            <p class="mt-1 text-sm text-slate-600">Track and manage your income by month</p>
          </div>
          <button
            type="button"
            class="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            (click)="onClose()"
          >
            <span class="material-icons text-2xl">close</span>
          </button>
        </div>

        <!-- Content -->
        <div class="p-8">
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <!-- Sidebar - Month & Year Selection -->
            <div class="space-y-6 lg:col-span-1">
              <!-- Month Selection -->
              <div class="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-6">
                <h3 class="mb-4 text-sm font-bold uppercase tracking-wide text-slate-900">Select Month</h3>
                <div class="grid grid-cols-3 gap-2">
                  @for (month of months; track month) {
                    <button
                      type="button"
                      (click)="selectMonth(month)"
                      [class.bg-gradient-to-r]="selectedMonth() === month"
                      [class.from-blue-600]="selectedMonth() === month"
                      [class.to-blue-800]="selectedMonth() === month"
                      [class.text-white]="selectedMonth() === month"
                      [class.shadow-lg]="selectedMonth() === month"
                      [class.font-bold]="selectedMonth() === month"
                      [class.bg-white]="selectedMonth() !== month"
                      [class.text-slate-700]="selectedMonth() !== month"
                      [class.border]="selectedMonth() !== month"
                      [class.border-slate-300]="selectedMonth() !== month"
                      class="rounded-lg px-2 py-2 text-xs transition-all duration-200 hover:shadow-md"
                    >
                      {{ month | slice: 0: 3 }}
                    </button>
                  }
                </div>
              </div>

              <!-- Year Selection -->
              <div class="rounded-xl bg-white p-6 shadow-sm">
                <h3 class="mb-4 text-sm font-bold uppercase tracking-wide text-slate-900">Year</h3>
                <div class="flex flex-col gap-3">
                  <button
                    type="button"
                    (click)="decrementYear()"
                    class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-200 px-3 py-2 text-slate-600 transition hover:bg-slate-50"
                  >
                    <span class="material-icons text-sm">chevron_left</span>
                    <span class="text-sm font-semibold">Previous</span>
                  </button>
                  <div class="rounded-lg border-2 border-blue-200 bg-blue-50 py-3 text-center">
                    <p class="text-2xl font-bold text-blue-900">{{ selectedYear() }}</p>
                  </div>
                  <button
                    type="button"
                    (click)="incrementYear()"
                    class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-200 px-3 py-2 text-slate-600 transition hover:bg-slate-50"
                  >
                    <span class="material-icons text-sm">chevron_right</span>
                    <span class="text-sm font-semibold">Next</span>
                  </button>
                </div>
              </div>

              <!-- Filter Buttons -->
              <div class="space-y-2 rounded-xl bg-white p-6 shadow-sm">
                <h3 class="mb-4 text-sm font-bold uppercase tracking-wide text-slate-900">Payment Method</h3>
                <button
                  type="button"
                  (click)="filterByMethod('all')"
                  [class.bg-gradient-to-r]="filterMethod() === 'all'"
                  [class.from-slate-600]="filterMethod() === 'all'"
                  [class.to-slate-700]="filterMethod() === 'all'"
                  [class.text-white]="filterMethod() === 'all'"
                  [class.shadow-lg]="filterMethod() === 'all'"
                  [class.bg-slate-100]="filterMethod() !== 'all'"
                  [class.text-slate-700]="filterMethod() !== 'all'"
                  class="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                >
                  All Payments
                </button>
                <button
                  type="button"
                  (click)="filterByMethod('cash')"
                  [class.bg-gradient-to-r]="filterMethod() === 'cash'"
                  [class.from-green-600]="filterMethod() === 'cash'"
                  [class.to-green-700]="filterMethod() === 'cash'"
                  [class.text-white]="filterMethod() === 'cash'"
                  [class.shadow-lg]="filterMethod() === 'cash'"
                  [class.bg-green-50]="filterMethod() !== 'cash'"
                  [class.text-green-700]="filterMethod() !== 'cash'"
                  class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                >
                  <span class="material-icons text-lg">local_atm</span>
                  Cash
                </button>
                <button
                  type="button"
                  (click)="filterByMethod('online')"
                  [class.bg-gradient-to-r]="filterMethod() === 'online'"
                  [class.from-blue-600]="filterMethod() === 'online'"
                  [class.to-blue-800]="filterMethod() === 'online'"
                  [class.text-white]="filterMethod() === 'online'"
                  [class.shadow-lg]="filterMethod() === 'online'"
                  [class.bg-blue-50]="filterMethod() !== 'online'"
                  [class.text-blue-700]="filterMethod() !== 'online'"
                  class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                >
                  <span class="material-icons text-lg">payment</span>
                  Online
                </button>
              </div>
            </div>

            <!-- Main Content - Payments Table -->
            <div class="lg:col-span-3">
              <!-- Summary Cards -->
              <div class="mb-6 grid grid-cols-2 gap-4">
                <div class="rounded-xl border-2 border-slate-200 bg-white p-6">
                  <p class="text-sm font-semibold text-slate-600">Total Earnings</p>
                  <p class="mt-2 text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                    ₹{{ totalMonthEarnings() | number: '1.0-0' }}
                  </p>
                </div>
                <div class="rounded-xl border-2 border-slate-200 bg-white p-6">
                  <p class="text-sm font-semibold text-slate-600">Transactions</p>
                  <p class="mt-2 text-3xl font-bold text-slate-900">
                    {{ filteredPayments().length }}
                  </p>
                </div>
              </div>

              <!-- Payments Header -->
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-xl font-bold text-slate-900">
                  {{ selectedMonth() }} {{ selectedYear() }} Payments
                </h3>
              </div>

              <!-- Payments Table -->
              @if (filteredPayments().length === 0) {
                <div class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-12 text-center">
                  <span class="material-icons mb-3 inline-block text-5xl text-slate-400">receipt_long</span>
                  <p class="text-lg font-semibold text-slate-600">No payments found</p>
                  <p class="mt-1 text-sm text-slate-500">Try selecting a different month or payment method</p>
                </div>
              } @else {
                <div class="overflow-hidden rounded-xl border-2 border-slate-200 shadow-lg">
                  <div class="overflow-x-auto">
                    <table class="w-full">
                      <thead class="bg-gradient-to-r from-blue-50 via-slate-50 to-slate-50">
                        <tr class="border-b-2 border-slate-200">
                          <th class="px-6 py-4 text-left text-sm font-bold text-slate-900">Member Name</th>
                          <th class="px-6 py-4 text-left text-sm font-bold text-slate-900">Payment Date</th>
                          <th class="px-6 py-4 text-right text-sm font-bold text-slate-900">Amount</th>
                          <th class="px-6 py-4 text-center text-sm font-bold text-slate-900">Method</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        @for (item of displayedPayments(); track item.payment.paymentId) {
                          <tr class="transition-colors hover:bg-slate-50">
                            <td class="px-6 py-4">
                              <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                                  {{ (item.memberName | slice: 0: 1).toUpperCase() }}
                                </div>
                                <div>
                                  <p class="font-semibold text-slate-900">{{ item.memberName }}</p>
                                </div>
                              </div>
                            </td>
                            <td class="px-6 py-4">
                              <p class="text-slate-600">{{ item.paymentDate | date: 'MMM dd, yyyy' }}</p>
                            </td>
                            <td class="px-6 py-4 text-right">
                              <p class="text-lg font-bold text-slate-900">₹{{ item.payment.amount | number: '1.0-0' }}</p>
                            </td>
                            <td class="px-6 py-4 text-center">
                              <span
                                [ngClass]="{
                                  'bg-green-100 text-green-800': item.payment.method === 'cash',
                                  'bg-blue-100 text-blue-800': item.payment.method === 'upi' || item.payment.method === 'card',
                                }"
                                class="inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize"
                              >
                                {{ item.payment.method }}
                              </span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Download Button -->
                <div class="mt-6">
                  <button
                    type="button"
                    (click)="downloadPDF()"
                    class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-6 py-3 font-bold text-white transition-all duration-200 hover:shadow-lg"
                  >
                    <span class="material-icons">download</span>
                    Download as CSV
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class MonthlyEarningsComponent {
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

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    this.closed.emit();
  }
}
