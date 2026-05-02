import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Unsubscribe, doc, getDoc } from 'firebase/firestore';
import { Owner } from '../core/models/owner.model';
import { AuthService } from '../core/services/auth.service';
import { FirebaseAppService } from '../core/services/firebase-app.service';
import { InAppNotificationService } from '../core/services/in-app-notification.service';
import { IpRestrictionService } from '../core/services/ip-restriction.service';
import { SupervisorSessionService } from '../core/services/supervisor-session.service';
import { ToastService } from '../core/services/toast.service';
import { TranslationService } from '../core/services/translation.service';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { ThemePickerComponent } from '../shared/theme-picker.component';
import { ThemeToggleComponent } from '../shared/theme-toggle.component';

type DayGreetingSegment = 'morning' | 'afternoon' | 'evening' | 'night';

function dayGreetingSegment(now: Date): DayGreetingSegment {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function dayGreetingIcon(segment: DayGreetingSegment): string {
  switch (segment) {
    case 'morning':
      return 'wb_sunny';
    case 'afternoon':
      return 'wb_twilight';
    case 'evening':
      return 'nights_stay';
    case 'night':
      return 'bedtime';
    default:
      return 'waving_hand';
  }
}

/**
 * Dedicated shell for supervisor sub-accounts.
 *
 * Why a separate shell from `OwnerShellComponent`?
 *  - Owners and supervisors are different jobs. Owners run the business
 *    (revenue, plan, billing). Supervisors run today's floor (members,
 *    cash collected today). Mixing both in one shell forced sprinkled
 *    `if (isSupervisor)` checks and caused permission-denied errors when
 *    owner-only listeners (admin chat thread) ran in supervisor sessions.
 *  - Owners are usually at a desk; supervisors are usually on a phone.
 *    A separate shell lets us optimise each independently without
 *    second-guessing impact on the other role.
 *
 * Reuse vs fork: this shell REUSES the same business components
 * (MembersComponent, PaymentsPageComponent, RoomsPageComponent). Forking
 * those would cause feature drift. Permission-driven UI inside those
 * components keeps working because `auth.hasPermission(...)` returns the
 * supervisor flag for supervisors and `true` for owners.
 */
@Component({
  selector: 'app-supervisor-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BrandLogoComponent,
    ThemeToggleComponent,
    ThemePickerComponent,
  ],
  templateUrl: './supervisor-shell.component.html',
})
export class SupervisorShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FirebaseAppService);
  private readonly inApp = inject(InAppNotificationService);
  private readonly ipRestriction = inject(IpRestrictionService);
  private readonly session = inject(SupervisorSessionService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);

  readonly profile = this.auth.profile;
  readonly permissions = this.auth.supervisorPermissions;

  readonly isPg = computed(() => this.profile()?.businessType === 'pg');

  readonly canViewMembers = computed(() => !!this.permissions()?.canViewMembers);
  readonly canViewInactiveMembers = computed(() => !!this.permissions()?.canViewInactiveMembers);
  readonly canViewPayments = computed(() => !!this.permissions()?.canViewPayments);
  readonly canRecordPayments = computed(() => !!this.permissions()?.canRecordPayments);
  readonly canViewRooms = computed(() => !!this.permissions()?.canViewRooms);
  readonly canShareOnboardingLink = computed(
    () => !!this.permissions()?.canShareOnboardingLink,
  );

  /** Initial letter shown in the avatar circle. */
  readonly supervisorInitial = computed(() => {
    const n = this.profile()?.name?.trim();
    return n ? n.charAt(0).toUpperCase() : 'S';
  });

  /**
   * Friendly business name of the parent owner this supervisor works under.
   * Hydrated lazily — the projected supervisor profile carries `businessName`
   * once the auth service merges in the parent owner doc, but on a cold
   * start that merge can lag a frame. We also fetch directly as a safety
   * net so the badge never shows blank for more than a few hundred ms.
   */
  readonly parentBusinessName = signal<string>('');
  readonly parentOwnerName = signal<string>('');

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly nowMs = signal(Date.now());

  readonly headerGreeting = computed(() => {
    this.nowMs();
    const seg = dayGreetingSegment(new Date());
    const text =
      seg === 'morning'
        ? 'Good morning'
        : seg === 'afternoon'
          ? 'Good afternoon'
          : seg === 'evening'
            ? 'Good evening'
            : 'Hi';
    const p = this.profile();
    const displayName = p?.name?.trim() || '';
    return { text, icon: dayGreetingIcon(seg), displayName };
  });

  readonly inAppUnread = signal(0);
  private unsubInApp: Unsubscribe | null = null;
  private unsubSession: Unsubscribe | null = null;
  private sessionConflictHandled = false;
  private greetingTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Inherited subscription expiry banner data. Supervisors can't pay or
   * renew (only the owner can), so the banner is purely informational —
   * but it's loud when expiry is close so the supervisor can prompt the
   * owner before lock-out.
   *
   * Returns:
   *   `null` when the plan is healthy (>14 days remaining).
   *   `{ tone: 'warn', daysLeft, dateText }` when 0–14 days remain.
   *   `{ tone: 'danger', daysLeft: 0, dateText }` when already expired
   *      (subscriptionGuard will redirect; we still render this in case
   *      the redirect lags a frame on slow networks).
   */
  readonly planExpiryBanner = computed<
    { tone: 'warn' | 'danger'; daysLeft: number; dateText: string } | null
  >(() => {
    this.nowMs();
    const profile = this.profile();
    if (!profile || profile.role !== 'supervisor') return null;
    const planEnd = profile.planEndDate;
    if (!planEnd) return null;
    const endDate = (planEnd as { toDate?: () => Date }).toDate?.()
      ?? new Date(planEnd as unknown as string | number);
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return null;
    const now = new Date();
    const ms = endDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
    const dateText = endDate.toLocaleDateString();
    if (daysLeft <= 0) return { tone: 'danger', daysLeft: 0, dateText };
    if (daysLeft <= 14) return { tone: 'warn', daysLeft, dateText };
    return null;
  });

  constructor() {
    // Hydrate parent owner identity any time the bound supervisor changes.
    effect(() => {
      const p = this.profile();
      if (!p || p.role !== 'supervisor') {
        this.parentBusinessName.set('');
        this.parentOwnerName.set('');
        return;
      }
      // Auth service projects parent business fields onto the supervisor
      // profile asynchronously. Use them when present, otherwise fetch.
      if (p.businessName) {
        this.parentBusinessName.set(p.businessName);
      }
      const parentId = p.parentOwnerId || p.ownerId;
      if (parentId) {
        void this.hydrateParentOwner(parentId);
      }
    });

    // Sidebar / nav badge for in-app notifications under the parent owner
    // scope. The supervisor only subscribes if they're permitted to view
    // members (rules require `canViewMembers` to read appNotifications).
    effect(() => {
      const ownerId = this.profile()?.ownerId;
      const allowed = this.canViewMembers();
      this.unsubInApp?.();
      this.inAppUnread.set(0);
      if (!ownerId || !allowed) return;
      this.unsubInApp = this.inApp.watchOwnerNotifications(ownerId, (rows) => {
        this.inAppUnread.set(rows.filter((r) => !r.read).length);
      });
    });

    // Single-device session enforcement: watch our own supervisor doc and
    // bail out if `activeSessionId` no longer matches the local copy
    // (someone else just signed in with these credentials elsewhere).
    effect(() => {
      const profile = this.profile();
      const uid = this.auth.user()?.uid;
      this.unsubSession?.();
      this.unsubSession = null;
      this.sessionConflictHandled = false;
      if (!uid || profile?.role !== 'supervisor') return;
      this.unsubSession = this.session.watchOwnSession(uid, (reason) => {
        if (this.sessionConflictHandled) return;
        this.sessionConflictHandled = true;
        void this.handleSessionKickOut(uid, reason);
      });
    });
  }

  ngOnInit(): void {
    this.greetingTimer = setInterval(() => this.nowMs.set(Date.now()), 60_000);
    // Belt-and-braces: even though login enforces IP, a supervisor with a
    // long-lived auth session might come back tomorrow on a different
    // network. Re-evaluate once on shell init and sign them out if their
    // current network is no longer in the allowlist.
    void this.reverifyIpAllowlist();
  }

  /**
   * Re-run the IP allowlist evaluation against the supervisor's CURRENT
   * public IP. We only enforce the `'blocked'` outcome — `'cant-detect'`
   * here is treated as soft-pass because the user is already inside the
   * shell and a transient network blip on a refresh shouldn't kick a
   * legitimate supervisor out (login enforced it once already).
   */
  private async reverifyIpAllowlist(): Promise<void> {
    const profile = this.profile();
    const uid = this.auth.user()?.uid;
    if (!uid || profile?.role !== 'supervisor') return;
    try {
      const result = await this.ipRestriction.evaluate(uid);
      if (result.status === 'blocked') {
        this.toast.error(
          `Sign-in from this network is not authorised${
            result.detectedIp ? ` (IP ${result.detectedIp})` : ''
          }. Ask your owner to allow this network.`,
        );
        this.session.clearLocalSession(uid);
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
      }
    } catch {
      /* swallow — login already enforced once */
    }
  }

  ngOnDestroy(): void {
    this.unsubInApp?.();
    this.unsubInApp = null;
    this.unsubSession?.();
    this.unsubSession = null;
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer);
      this.greetingTimer = null;
    }
  }

  /**
   * Handle the "another device just signed in" event. We:
   *   1. Show a clear toast (Netflix-style: "signed in on another device").
   *   2. Wipe the local session claim so we don't try to re-claim it.
   *   3. Sign out via AuthService (which tears down listeners) and route
   *      to /login.
   *
   * `reason === 'kicked'`  → newer device took over.
   * `reason === 'no-local'` → we never had a local claim (page reload after
   *                            losing localStorage; treat as a fresh login
   *                            requirement so the supervisor reclaims).
   */
  private async handleSessionKickOut(
    uid: string,
    reason: 'kicked' | 'no-local',
  ): Promise<void> {
    if (reason === 'kicked') {
      this.toast.error(
        'You were signed out because this account just signed in on another device.',
      );
    } else {
      this.toast.error('Please sign in again.');
    }
    this.session.clearLocalSession(uid);
    try {
      await this.auth.signOut();
    } catch {
      /* ignore — we're navigating away anyway */
    }
    await this.router.navigateByUrl('/login');
  }

  /**
   * Best-effort fetch of the parent owner doc. Read access is granted by
   * `firestore.rules` for active supervisors of that owner. Failures are
   * silent — the projected `profile.businessName` will arrive shortly.
   */
  private async hydrateParentOwner(parentId: string): Promise<void> {
    try {
      const snap = await getDoc(doc(this.fb.db, 'owners', parentId));
      if (!snap.exists()) return;
      const data = snap.data() as Partial<Owner>;
      if (data.businessName) this.parentBusinessName.set(data.businessName);
      if (data.name) this.parentOwnerName.set(data.name);
    } catch {
      /* ignore — projected fields will catch up */
    }
  }

  openMobileMenu(): void {
    this.closeUserMenu();
    this.mobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    this.closeUserMenu();
    const uid = this.auth.user()?.uid;
    if (uid) this.session.clearLocalSession(uid);
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (el?.closest('[data-user-menu-root]')) return;
    this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) this.closeMobileMenu();
    if (this.userMenuOpen()) this.closeUserMenu();
  }
}
