import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
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
import {
  MemberBroadcastService,
  type OwnerBroadcast,
} from '../../core/services/member-broadcast.service';

type MemberTab = 'home' | 'receipts' | 'complaint';

interface ReceiptRow {
  payment: Payment;
  monthLabel: string;
  receiptNumber: string;
  /** Normalised for the template — avoids calling `.toDate()` on a missing `date`. */
  receiptDate: Date;
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
  private readonly broadcastsApi = inject(MemberBroadcastService);

  /* ------------------------------ state ------------------------------ */

  readonly identity = signal<MemberAppIdentity | null>(null);
  readonly member = signal<Member | null>(null);
  readonly ownerStatus = signal<OwnerPublicStatus | null>(null);
  readonly broadcasts = signal<OwnerBroadcast[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly complaints = signal<MemberComplaint[]>([]);
  readonly tab = signal<MemberTab>('home');
  readonly nowMs = signal(Date.now());
  readonly nextComplaintAtMs = signal<number | null>(null);
  readonly downloadingPaymentId = signal<string | null>(null);
  /** Firestore / auth listener failure — surfaced so tenants are not staring at empty tabs. */
  readonly dataLoadError = signal<string | null>(null);

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

  /**
   * In-app complaints: admin must not have revoked tenant app
   * (`publicOwnerStatus.tenantMemberAppEnabled`). When owner explicitly turns
   * complaints off in their profile, `complaintEnabled` on the mirror also hides it.
   */
  readonly canUseComplaints = computed(() => {
    const st = this.ownerStatus();
    if (!st) return false;
    if (st.tenantMemberAppEnabled === false) return false;
    return st.complaintEnabled !== false;
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
        receiptDate: date,
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
  private unsubBroadcasts: (() => void) | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.tab() === 'complaint' && !this.canUseComplaints()) {
        this.tab.set('home');
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const auth = getAuth(this.fbApp.app);
    const user = auth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/member-app/login');
      return;
    }
    // Do **not** call getIdToken(true) here: it forces a round-trip to
    // securetoken.googleapis.com. Restricted Web API keys often block that
    // endpoint (403 granttoken blocked) even though sign-in already succeeded.
    try {
      await user.getIdToken();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/securetoken|granttoken|blocked|403/i.test(msg)) {
        this.dataLoadError.set(
          'Sign-in token could not be refreshed. In Google Cloud Console, edit your Firebase Web API key and allow the Token Service / Identity Toolkit APIs (or temporarily relax API restrictions for testing). Then sign out and sign in again.',
        );
      }
    }

    let identity: MemberAppIdentity | null = null;
    try {
      identity = await this.self.getIdentity();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/securetoken|granttoken|blocked|403/i.test(msg)) {
        this.dataLoadError.set(
          'Could not read your session. Check Firebase API key restrictions (Token Service) or sign out and sign in again.',
        );
      }
      await this.router.navigateByUrl('/member-app/login');
      return;
    }
    if (!identity) {
      await this.router.navigateByUrl('/member-app/login');
      return;
    }
    this.identity.set(identity);

    const onSnapErr =
      (label: string) =>
      (err: unknown): void => {
        console.error(`[member-app] ${label}`, err);
        const msg = err instanceof Error ? err.message : String(err);
        if (/permission|insufficient/i.test(msg)) {
          this.dataLoadError.set(
            'Could not load part of your data (access denied). Sign out, sign in again, or ask your owner to confirm your profile is active.',
          );
        } else if (!this.dataLoadError()) {
          this.dataLoadError.set('Could not load your data. Check your connection and pull to refresh or reopen the app.');
        }
      };

    this.unsubMember = this.self.watchMyProfile(
      identity.memberId,
      (m) => {
        this.member.set(m);
        if (m) this.dataLoadError.set(null);
      },
      onSnapErr('member profile'),
    );
    this.unsubPayments = this.self.watchMyPayments(
      identity.ownerId,
      identity.memberId,
      (rows) => {
        this.payments.set(rows);
        this.dataLoadError.set(null);
      },
      onSnapErr('payments'),
    );
    this.unsubComplaints = this.self.watchMyComplaints(
      identity.ownerId,
      identity.memberId,
      (rows) => {
        this.complaints.set(rows);
        this.dataLoadError.set(null);
        // Re-derive cooldown after each new complaint lands.
        const last = rows[0]?.createdAt?.toDate?.()?.getTime();
        if (last) {
          const next = last + 24 * 60 * 60 * 1000;
          this.nextComplaintAtMs.set(next > Date.now() ? next : null);
        } else {
          this.nextComplaintAtMs.set(null);
        }
      },
      onSnapErr('complaints'),
    );
    this.unsubOwnerStatus = this.ownerStatusApi.watchStatus(
      identity.ownerId,
      (status) => this.ownerStatus.set(status),
    );

    this.unsubBroadcasts = this.broadcastsApi.watchBroadcasts(
      identity.ownerId,
      (rows) => {
        this.broadcasts.set(rows);
        this.dataLoadError.set(null);
      },
      onSnapErr('owner messages'),
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
    this.unsubBroadcasts?.();
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  /* -------------------------------- actions -------------------------------- */

  setTab(tab: MemberTab): void {
    if (tab === 'complaint' && !this.canUseComplaints()) {
      this.toast.error('Complaints are not available for this property right now.');
      return;
    }
    this.tab.set(tab);
  }

  async logout(): Promise<void> {
    await signOut(getAuth(this.fbApp.app));
    await this.router.navigateByUrl('/member-app/login');
  }

  async downloadReceipt(row: ReceiptRow): Promise<void> {
    const id = this.identity();
    if (!id) {
      this.toast.error('Could not load your details. Please refresh.');
      return;
    }
    this.downloadingPaymentId.set(row.payment.paymentId);
    try {
      const date = row.receiptDate;
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
    if (!this.canUseComplaints()) {
      this.toast.error('Complaints are not available for this property right now.');
      return;
    }
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
    if (!id) {
      this.toast.error('Could not load your details. Please refresh.');
      return;
    }
    const t = this.tenantLayout(id, this.member());
    if (!t.mobile || t.mobile.length < 10) {
      this.toast.error(
        'A 10-digit mobile number is required on your profile to raise a complaint. Ask your owner to update it, or wait for your profile to finish loading.',
      );
      return;
    }
    this.submittingComplaint.set(true);
    try {
      const v = this.form.getRawValue();
      await this.self.submitComplaint({
        ownerId: id.ownerId,
        memberId: id.memberId,
        memberMobile: t.mobile,
        memberName: this.memberName(),
        roomNumber: t.roomNumber,
        floorNumber: t.floorNumber,
        bedNumber: t.bedNumber,
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

  /**
   * Room / mobile for forms and receipts: prefer live Firestore member doc,
   * fall back to claims minted at sign-in (survives temporary profile read issues).
   */
  private tenantLayout(
    id: MemberAppIdentity,
    m: Member | null,
  ): { mobile: string; roomNumber: string; floorNumber: string; bedNumber: string } {
    if (m) {
      return {
        mobile: this.normalizedMobile(m.mobile),
        roomNumber: String(m.roomNumber || ''),
        floorNumber: String(m.floorNumber || ''),
        bedNumber: String(m.bedNumber || ''),
      };
    }
    const mob = (id.memberMobile || '').replace(/\D/g, '').slice(-10);
    return {
      mobile: mob.length === 10 ? mob : '',
      roomNumber: String(id.roomNumber || ''),
      floorNumber: String(id.floorNumber || ''),
      bedNumber: String(id.bedNumber || ''),
    };
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
    const id = this.identity();
    if (!m && !id) return null;
    const t = id ? this.tenantLayout(id, m) : null;
    const join = m?.joinDate?.toDate?.();
    const due = m?.dueDate?.toDate?.();
    return {
      room: m ? String(m.roomNumber || '—') : t?.roomNumber || '—',
      floor: m ? String(m.floorNumber || '—') : t?.floorNumber || '—',
      bed: m ? String(m.bedNumber || '') : String(t?.bedNumber || ''),
      joinedOn: join ? join.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      dueOn: due ? due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      rentAmount: m ? Number(m.amount) || 0 : 0,
      pendingAmount: m ? Math.max(0, Number(m.pendingAmount) || 0) : 0,
      mobile: m ? this.normalizedMobile(m.mobile) : t?.mobile || '—',
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
