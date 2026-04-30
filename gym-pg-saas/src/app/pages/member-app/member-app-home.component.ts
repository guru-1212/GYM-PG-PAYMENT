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

type MemberReceiptKind = 'pending_balance' | 'rent';

interface MemberReceiptLine {
  payment: Payment;
  kind: MemberReceiptKind;
  amount: number;
  monthLabel: string;
  receiptNumber: string;
  receiptDate: Date;
  downloadKey: string;
  isDownloading: boolean;
}

type MemberAppThemePref = 'light' | 'dark' | 'system';

@Component({
  selector: 'app-member-app-home',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, TitleCasePipe, ReactiveFormsModule],
  templateUrl: './member-app-home.component.html',
  styleUrl: './member-app-home.component.scss',
  host: {
    '[attr.data-mah-theme]': 'resolvedMahTheme()',
  },
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
  readonly downloadingKey = signal<string | null>(null);
  /** Tenant-controlled appearance; persisted in localStorage. */
  readonly themePref = signal<MemberAppThemePref>('system');
  readonly systemIsDark = signal(false);
  private themeMq: MediaQueryList | null = null;
  private readonly themeMqHandler = (e: MediaQueryListEvent): void => {
    this.systemIsDark.set(e.matches);
  };
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

  readonly resolvedMahTheme = computed((): 'light' | 'dark' => {
    const p = this.themePref();
    if (p === 'light' || p === 'dark') return p;
    return this.systemIsDark() ? 'dark' : 'light';
  });

  readonly receiptLines = computed<MemberReceiptLine[]>(() => {
    const downloading = this.downloadingKey();
    const m = this.member();
    const dueMonth =
      m?.dueDate?.toDate?.()?.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }) ?? null;

    const lines: MemberReceiptLine[] = [];
    for (const p of this.payments()) {
      const { pending, rent } = MemberAppHomeComponent.splitPaymentAmounts(p);
      const date = p.date?.toDate?.() ?? p.createdAt?.toDate?.() ?? new Date();
      const rentMonthLabel = date.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
      const pendingMonthLabel = dueMonth || rentMonthLabel;

      if (pending > 0) {
        const key = `${p.paymentId}:pending`;
        lines.push({
          payment: p,
          kind: 'pending_balance',
          amount: pending,
          monthLabel: pendingMonthLabel,
          receiptDate: date,
          receiptNumber: `${this.buildReceiptNumber(p)}-P`,
          downloadKey: key,
          isDownloading: downloading === key,
        });
      }
      if (rent > 0) {
        const key = `${p.paymentId}:rent`;
        lines.push({
          payment: p,
          kind: 'rent',
          amount: rent,
          monthLabel: rentMonthLabel,
          receiptDate: date,
          receiptNumber: `${this.buildReceiptNumber(p)}-R`,
          downloadKey: key,
          isDownloading: downloading === key,
        });
      }
    }
    return lines;
  });

  readonly receiptLinesPending = computed(() =>
    this.receiptLines().filter((l) => l.kind === 'pending_balance'),
  );

  readonly receiptLinesRent = computed(() =>
    this.receiptLines().filter((l) => l.kind === 'rent'),
  );

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

    try {
      const t = localStorage.getItem('memberAppTheme');
      if (t === 'light' || t === 'dark' || t === 'system') {
        this.themePref.set(t);
      }
    } catch {
      /* non-fatal */
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.themeMq = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemIsDark.set(this.themeMq.matches);
      this.themeMq.addEventListener('change', this.themeMqHandler);
    }
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
    this.themeMq?.removeEventListener('change', this.themeMqHandler);
    this.themeMq = null;
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

  setThemePref(pref: MemberAppThemePref): void {
    this.themePref.set(pref);
    try {
      localStorage.setItem('memberAppTheme', pref);
    } catch {
      /* non-fatal */
    }
  }

  async downloadReceipt(line: MemberReceiptLine): Promise<void> {
    const id = this.identity();
    if (!id) {
      this.toast.error('Could not load your details. Please refresh.');
      return;
    }
    this.downloadingKey.set(line.downloadKey);
    try {
      const date = line.receiptDate;
      const pendingAfter = Math.max(0, Number(line.payment.pendingAmount) || 0);
      const receiptKind = line.kind === 'pending_balance' ? 'pending_balance' : 'rent';
      const linkData: ReceiptLinkData = {
        memberId: id.memberId,
        ownerId: id.ownerId,
        paymentId: line.payment.paymentId,
        receiptNumber: line.receiptNumber,
        receiptData: {
          memberName: this.memberName(),
          amount: line.amount,
          paymentDate: date,
          paymentMethod: line.payment.method || 'cash',
          businessName: this.ownerStatus()?.businessName || id.ownerBusinessName || 'PayBook',
          monthText: line.monthLabel,
          pendingAmount: line.kind === 'rent' ? pendingAfter : 0,
          receiptKind,
          ...(line.kind === 'rent' && pendingAfter > 0
            ? {
                pendingCarryForwardText: `Pending amount INR ${pendingAfter.toLocaleString(
                  'en-IN',
                )} will be charged in next cycle.`,
              }
            : {}),
        },
        createdAt: line.payment.createdAt,
        expiresAt: line.payment.createdAt,
      };
      const blob = await this.receipts.generateReceiptPDF(linkData);
      const slug =
        line.kind === 'pending_balance'
          ? 'pending-balance'
          : 'rent';
      this.triggerDownload(
        blob,
        `${slug}-receipt-${line.monthLabel.replace(/\s+/g, '-')}-${line.receiptNumber}.pdf`,
      );
    } catch (e) {
      this.toast.error('Could not generate receipt. Please try again.');
    } finally {
      this.downloadingKey.set(null);
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

  /**
   * How much of a payment cleared an existing pending balance vs rent,
   * using `priorPendingAmount` when present (new payments).
   */
  private static splitPaymentAmounts(p: Payment): { pending: number; rent: number } {
    const amount = Math.max(0, Number(p.amount) || 0);
    const prior = Math.max(0, Number(p.priorPendingAmount) || 0);
    if (p.isPartialPayment) {
      const after = Math.max(0, Number(p.pendingAmount) || 0);
      const towardPending = Math.max(0, prior - after);
      const pending = Math.min(amount, towardPending);
      return { pending, rent: Math.max(0, amount - pending) };
    }
    const pending = Math.min(amount, prior);
    return { pending, rent: Math.max(0, amount - pending) };
  }

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

  /** Owner broadcasts sent on the member's local calendar day (uses live clock). */
  readonly broadcastsToday = computed(() => {
    const ref = new Date(this.nowMs());
    return this.broadcasts().filter((b) => {
      const t = b.createdAt?.toDate?.();
      return t ? MemberAppHomeComponent.isSameLocalCalendarDay(t, ref) : false;
    });
  });

  readonly broadcastsEarlier = computed(() => {
    const ref = new Date(this.nowMs());
    return this.broadcasts().filter((b) => {
      const t = b.createdAt?.toDate?.();
      return !t || !MemberAppHomeComponent.isSameLocalCalendarDay(t, ref);
    });
  });

  private static isSameLocalCalendarDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
