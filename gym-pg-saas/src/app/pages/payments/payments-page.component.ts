import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Member } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { dueUiStatus, endOfToday, timestampToDate } from '../../core/utils/date.utils';

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './payments-page.component.html',
})
export class PaymentsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);

  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);

  readonly dueLabel = computed(() =>
    this.auth.profile()?.businessType === 'pg' ? 'Rent due' : 'Plan expiry',
  );

  readonly memberNameById = computed(() => {
    const map = new Map<string, string>();
    for (const m of this.members()) {
      map.set(m.memberId, `${m.firstName} ${m.lastName || ''}`.trim());
    }
    return map;
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
}
