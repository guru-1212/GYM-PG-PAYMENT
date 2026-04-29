import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { getAuth, signOut } from 'firebase/auth';
import { Member } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { FirebaseAppService } from '../../core/services/firebase-app.service';
import { MemberAppPushService } from '../../core/services/member-app-push.service';
import {
  MEMBER_COMPLAINT_CATEGORIES,
  MemberAppIdentity,
  MemberComplaint,
  MemberComplaintCategory,
  MemberSelfService,
} from '../../core/services/member-self.service';
import {
  MemberReceiptService,
  ReceiptLinkData,
} from '../../core/services/member-receipt.service';
import {
  OwnerPublicStatus,
  OwnerPublicStatusService,
} from '../../core/services/owner-public-status.service';
import { ToastService } from '../../core/services/toast.service';

type MemberTab = 'home' | 'receipts' | 'complaint';

interface ReceiptRow {
  payment: Payment;
  monthLabel: string;
  receiptNumber: string;
  isDownloading: boolean;
}

@Component({
  selector: 'app-member-app-home',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, TitleCasePipe, ReactiveFormsModule],
  templateUrl: './member-app-home.component.html',
  styleUrl: './member-app-home.component.scss',
})
export class MemberAppHomeComponent implements OnInit, OnDestroy {
  private readonly fbApp = inject(FirebaseAppService);
  private readonly router = inject(Router);
  private readonly self = inject(MemberSelfService);
  private readonly receipts = inject(MemberReceiptService);
  private readonly ownerStatusApi = inject(OwnerPublicStatusService);
  private readonly push = inject(MemberAppPushService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /* ------------------------------ state ------------------------------ */

  readonly identity = signal<MemberAppIdentity | null>(null);
  readonly member = signal<Member | null>(null);
  readonly ownerStatus = signal<OwnerPublicStatus | null>(null);
  readonly payments = signal<Payment[]>([]);
  readonly complaints = signal<MemberComplaint[]>([]);
  readonly tab = signal<MemberTab>('home');
  readonly nowMs = signal(Date.now());
  readonly nextComplaintAtMs = signal<number | null>(null);
  readonly downloadingPaymentId = signal<string | null>(null);

  /** Live cooldown until the member can raise the next complaint. */
  readonly cooldownText = computed(() => {
    const next = this.nextComplaintAtMs();
    if (!next) return '';
    const diff = Math.max(0, next - this.nowMs());
    if (diff <= 0) return '';
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  });

  readonly canRaiseComplaint = computed(() => {
    const next = this.nextComplaintAtMs();
    if (!next) return true;
    return next <= this.nowMs();
  });

  /** Plan-expiry empathy state — drives the "ask owner" banner on Home. */
  readonly planExpired = computed(() => {
    const status = this.ownerStatus();
    const end = status?.planEndDate?.toDate?.();
    if (!end) return false;
    return end.getTime() <= this.nowMs();
  });

  readonly memberName = computed(() => {
    const m = this.member();
    if (m) {
      const first = (m.firstName || '').trim();
      const last = (m.lastName || '').trim();
      const full = `${first} ${last}`.trim();
      if (full) return full;
    }
    return this.identity()?.memberDisplayName || 'Member';
  });

  readonly greetingText = computed(() => {
    const h = new Date(this.nowMs()).getHours();
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 21) return 'Good evening';
    return 'Hi';
  });

  readonly receiptRows = computed<ReceiptRow[]>(() => {
    const downloading = this.downloadingPaymentId();
    return this.payments().map((p) => {
      const date = p.date?.toDate?.() ?? p.createdAt?.toDate?.() ?? new Date();
      const monthLabel = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return {
        payment: p,
        monthLabel,
        receiptNumber: this.buildReceiptNumber(p),
        isDownloading: downloading === p.paymentId,
      };
    });
  });

  /* --------------------------- complaint form --------------------------- */

  readonly categories = MEMBER_COMPLAINT_CATEGORIES;
  readonly form = this.fb.nonNullable.group({
    category: ['Plumbing' as MemberComplaintCategory, [Validators.required]],
    message: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(4000)]],
  });
  readonly submittingComplaint = signal(false);

  /* ------------------------------- lifecycle ------------------------------- */

  private unsubMember: (() => void) | null = null;
  private unsubPayments: (() => void) | null = null;
  private unsubComplaints: (() => void) | null = null;
  private unsubOwnerStatus: (() => void) | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    const auth = getAuth(this.fbApp.app);
    const user = auth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/');
      return;
    }
    await user.getIdToken(true);

    const identity = await this.self.getIdentity();
    if (!identity) {
      await this.router.navigateByUrl('/');
      return;
    }
    this.identity.set(identity);

    this.unsubMember = this.self.watchMyProfile(identity.memberId, (m) => {
      this.member.set(m);
    });
    this.unsubPayments = this.self.watchMyPayments(
      identity.ownerId,
      identity.memberId,
      (rows) => this.payments.set(rows),
    );
    this.unsubComplaints = this.self.watchMyComplaints(
      identity.ownerId,
      identity.memberId,
      (rows) => {
        this.complaints.set(rows);
        // Re-derive cooldown after each new complaint lands.
        const last = rows[0]?.createdAt?.toDate?.()?.getTime();
        if (last) {
          const next = last + 24 * 60 * 60 * 1000;
          this.nextComplaintAtMs.set(next > Date.now() ? next : null);
        } else {
          this.nextComplaintAtMs.set(null);
        }
      },
    );
    this.unsubOwnerStatus = this.ownerStatusApi.watchStatus(
      identity.ownerId,
      (status) => this.ownerStatus.set(status),
    );

    // Tick once a second so the cooldown countdown + greeting stay live without
    // a separate listener per derived value.
    this.clockTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);

    // Best-effort initial cooldown read so the form disables immediately on load.
    try {
      const next = await this.self.getNextComplaintAllowedAtMs(identity.memberId);
      if (next) this.nextComplaintAtMs.set(next);
    } catch {
      /* non-fatal */
    }

    void this.push.registerDeviceToken(identity.ownerId, identity.memberId);
  }

  ngOnDestroy(): void {
    this.unsubMember?.();
    this.unsubPayments?.();
    this.unsubComplaints?.();
    this.unsubOwnerStatus?.();
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  /* -------------------------------- actions -------------------------------- */

  setTab(tab: MemberTab): void {
    this.tab.set(tab);
  }

  async logout(): Promise<void> {
    await signOut(getAuth(this.fbApp.app));
    await this.router.navigateByUrl('/');
  }

  async downloadReceipt(row: ReceiptRow): Promise<void> {
    const id = this.identity();
    const m = this.member();
    if (!id || !m) {
      this.toast.error('Could not load your details. Please refresh.');
      return;
    }
    this.downloadingPaymentId.set(row.payment.paymentId);
    try {
      const date = row.payment.date?.toDate?.() ?? new Date();
      // Build a synthetic ReceiptLinkData object using only data the member is
      // already authorised to see — so we never need a Cloud Function or a
      // server-issued token to download.
      const linkData: ReceiptLinkData = {
        memberId: id.memberId,
        ownerId: id.ownerId,
        paymentId: row.payment.paymentId,
        receiptNumber: row.receiptNumber,
        receiptData: {
          memberName: this.memberName(),
          amount: Number(row.payment.amount) || 0,
          paymentDate: date,
          paymentMethod: row.payment.method || 'cash',
          businessName: this.ownerStatus()?.businessName || id.ownerBusinessName || 'PayBook',
          monthText: row.monthLabel,
          pendingAmount: Math.max(0, Number(row.payment.pendingAmount) || 0),
        },
        // These two are unused for the PDF generator but required by the type.
        createdAt: row.payment.createdAt,
        expiresAt: row.payment.createdAt,
      };
      const blob = await this.receipts.generateReceiptPDF(linkData);
      this.triggerDownload(
        blob,
        `receipt-${row.monthLabel.replace(/\s+/g, '-')}-${row.receiptNumber}.pdf`,
      );
    } catch (e) {
      this.toast.error('Could not generate receipt. Please try again.');
    } finally {
      this.downloadingPaymentId.set(null);
    }
  }

  async submitComplaint(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.canRaiseComplaint()) {
      this.toast.error(
        `You can raise the next complaint after ${this.cooldownText()}.`,
      );
      return;
    }
    const id = this.identity();
    const m = this.member();
    if (!id || !m) {
      this.toast.error('Could not load your details. Please refresh.');
      return;
    }
    this.submittingComplaint.set(true);
    try {
      const v = this.form.getRawValue();
      await this.self.submitComplaint({
        ownerId: id.ownerId,
        memberId: id.memberId,
        memberMobile: this.normalizedMobile(m.mobile),
        memberName: this.memberName(),
        roomNumber: String(m.roomNumber || ''),
        floorNumber: String(m.floorNumber || ''),
        bedNumber: String(m.bedNumber || ''),
        category: v.category,
        message: v.message,
      });
      this.form.reset({ category: 'Plumbing', message: '' });
      this.toast.success('Complaint sent. Your owner will see it right away.');
      // Tick the cooldown immediately for snappy UX (the listener will confirm).
      this.nextComplaintAtMs.set(Date.now() + 24 * 60 * 60 * 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send complaint.';
      this.toast.error(msg);
    } finally {
      this.submittingComplaint.set(false);
    }
  }

  /* --------------------------- helpers --------------------------- */

  private buildReceiptNumber(p: Payment): string {
    // Stable, derivable receipt number — does not require a server stamp.
    const tail = (p.paymentId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const date = p.date?.toDate?.() ?? new Date();
    const yymm =
      `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    return `R${yymm}-${tail || '000000'}`;
  }

  private normalizedMobile(raw: string | undefined): string {
    return String(raw || '').replace(/\D/g, '').slice(-10);
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ----------------------- template-only computeds ----------------------- */

  readonly profileLines = computed(() => {
    const m = this.member();
    if (!m) return null;
    const join = m.joinDate?.toDate?.();
    const due = m.dueDate?.toDate?.();
    return {
      room: String(m.roomNumber || '—'),
      floor: String(m.floorNumber || '—'),
      bed: String(m.bedNumber || ''),
      joinedOn: join ? join.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      dueOn: due ? due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      rentAmount: Number(m.amount) || 0,
      pendingAmount: Math.max(0, Number(m.pendingAmount) || 0),
      mobile: this.normalizedMobile(m.mobile),
    };
  });

  readonly planExpiryLine = computed(() => {
    const status = this.ownerStatus();
    const end = status?.planEndDate?.toDate?.();
    if (!end) return null;
    return end.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  });

  readonly openComplaintsCount = computed(
    () => this.complaints().filter((c) => c.status === 'open').length,
  );
}
