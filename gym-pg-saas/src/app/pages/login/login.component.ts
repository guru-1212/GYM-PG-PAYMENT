import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { merge } from 'rxjs';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { normalizeOwnerPhone } from '../../core/utils/phone-auth.util';
import { AuditLogService } from '../../core/services/audit-log.service';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { IpRestrictionService } from '../../core/services/ip-restriction.service';
import { NotificationService } from '../../core/services/notification.service';
import { InAppNotificationService } from '../../core/services/in-app-notification.service';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { SupervisorSessionService } from '../../core/services/supervisor-session.service';
import { ToastService } from '../../core/services/toast.service';
// import { LanguageSwitcherComponent } from '../../shared/language-switcher.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { TranslationService } from '../../core/services/translation.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, BrandLogoComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly auditLog = inject(AuditLogService);
  private readonly i18n = inject(TranslationService);
  private readonly cache = inject(DataCacheService);
  private readonly notifications = inject(NotificationService);
  private readonly inAppNotifications = inject(InAppNotificationService);
  private readonly ipRestriction = inject(IpRestrictionService);
  private readonly supervisorSession = inject(SupervisorSessionService);
  private readonly pwa = inject(PwaInstallService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  /**
   * Login-page install nudge. Only renders when the PWA service confirms
   * the app is genuinely installable (Chromium fired `beforeinstallprompt`)
   * or the user is on iOS Safari. Hidden once installed or dismissed for
   * the current browser session.
   */
  readonly showInstallPopup = signal(false);
  readonly canInstall = this.pwa.canInstall;
  readonly isInstalled = this.pwa.isInstalled;
  readonly isIosSafari = this.pwa.isIosSafari;
  private installPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly installDismissedKey = 'pgt.install.dismissed.session';

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly busy = signal(false);
  /** Inline sign-in failure (e.g. wrong email/password), shown above the submit button. */
  readonly signInError = signal('');
  readonly showSignInPassword = signal(false);
  readonly showSignUpPassword = signal(false);
  /** PG-only sign-up for now; restore `'gym'` when gym onboarding returns. */
  readonly businessTypeSignal = signal<'gym' | 'pg'>('pg');

  readonly signInForm = this.fb.nonNullable.group({
    // Free-text identifier: email, mobile, or supervisor user ID. Only the
    // forgot-password flow needs a strict email/phone (it sends a real email).
    identifier: ['', [Validators.required, signInIdentifierValidator]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly signUpForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    businessName: ['', Validators.required],
    phone: ['', [Validators.required, ownerSignUpPhoneValidator]],
    email: ['', ownerSignUpEmailValidator],
    password: ['', [Validators.required, strongSignupPasswordValidator]],
    businessType: this.fb.nonNullable.control<'gym' | 'pg'>('pg', Validators.required),
  });

  readonly businessNameLabel = computed(() => {
    return this.businessTypeSignal() === 'pg' ? 'login.pgName' : 'login.gymName';
  });

  readonly businessNamePlaceholder = computed(() => {
    return this.businessTypeSignal() === 'pg' ? 'login.enterPgName' : 'login.enterGymName';
  });

  ngOnInit(): void {
    this.notifications.requestPermissionOnce();
    const requestedMode = (this.route.snapshot.queryParamMap.get('mode') || '').toLowerCase().trim();
    if (requestedMode === 'signup') this.setMode('signup');
    else if (requestedMode === 'signin') this.setMode('signin');
    // Re-enable when gym / PG toggle is shown again on sign-up.
    // this.signUpForm.controls.businessType.valueChanges.subscribe((value) => {
    //   this.businessTypeSignal.set(value);
    // });
    merge(
      this.signInForm.controls.identifier.valueChanges,
      this.signInForm.controls.password.valueChanges,
    ).subscribe(() => this.signInError.set(''));
    this.scheduleInstallPopup();
  }

  ngOnDestroy(): void {
    if (this.installPopupTimer !== null) {
      clearTimeout(this.installPopupTimer);
      this.installPopupTimer = null;
    }
  }

  /**
   * Open the install nudge if (and only if):
   *  - we're in a browser context,
   *  - the app is not already installed,
   *  - the user hasn't dismissed it earlier in this session,
   *  - and the browser actually supports installing (Chromium prompt
   *    queued, or iOS Safari which goes through Add-to-Home-Screen).
   *
   * Runs after a short delay so `beforeinstallprompt` has a chance to fire.
   */
  private scheduleInstallPopup(): void {
    if (typeof window === 'undefined') return;
    if (this.isInstalled()) return;
    try {
      if (sessionStorage.getItem(this.installDismissedKey) === '1') return;
    } catch {
      /* sessionStorage unavailable — best-effort */
    }
    if (this.installPopupTimer !== null) clearTimeout(this.installPopupTimer);
    this.installPopupTimer = setTimeout(() => {
      this.installPopupTimer = null;
      if (this.isInstalled()) return;
      if (this.canInstall() || this.isIosSafari()) {
        this.showInstallPopup.set(true);
      }
    }, 2500);
  }

  closeInstallPopup(): void {
    this.showInstallPopup.set(false);
    try {
      sessionStorage.setItem(this.installDismissedKey, '1');
    } catch {
      /* ignore */
    }
  }

  /**
   * Trigger the same install flow as the home navbar button. On Chromium
   * this fires the native install dialog; on iOS Safari the service flips
   * its `showIosInstructions` signal which is rendered globally by
   * `AppComponent` (see app.component.html).
   */
  async installFromPopup(): Promise<void> {
    const outcome = await this.pwa.promptInstall();
    if (outcome === 'accepted') {
      this.toast.success('App installed. Open it from your home screen any time.');
      this.showInstallPopup.set(false);
    } else if (outcome === 'unavailable' && !this.isIosSafari()) {
      this.toast.success('Open your browser menu → "Install app" / "Add to Home Screen".');
    }
    if (this.isIosSafari()) {
      this.showInstallPopup.set(false);
    }
  }

  setMode(m: 'signin' | 'signup'): void {
    this.mode.set(m);
    this.signInError.set('');
    this.auth.disposeOwnerSignUpPhone();
  }

  /** For sign-up template: missing password rules when `strongPassword` error is set. */
  passwordStrongErrors(): Record<string, true> | null {
    const c = this.signUpForm.controls.password;
    if (!c.hasError('strongPassword')) return null;
    return c.getError('strongPassword') as Record<string, true>;
  }

  async onSignIn(): Promise<void> {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }
    this.signInError.set('');
    this.busy.set(true);
    try {
      await this.auth.signIn(this.signInForm.controls.identifier.value, this.signInForm.controls.password.value);
      const load = await this.auth.loadProfileOnce();
      const p = load.owner;
      if (!p) {
        if (load.problem === 'permission-denied') {
          this.toast.error(
            `Firestore blocked reading your profile. Deploy firestore.rules (Firebase project: ${environment.firebase.projectId}).`,
          );
        } else if (load.problem === 'no-firestore-document' && load.uid) {
          this.toast.error(
            `No owners/${load.uid} in Firestore. Console → Firestore → owners → Add doc → ID = ${load.uid}`,
          );
        } else if (load.problem === 'no-signed-in-user') {
          this.toast.error('Sign-in did not complete. Try again or clear site data for localhost.');
        } else {
          this.toast.error('Could not load profile. See browser console (filter: PayBook Auth).');
        }
        await this.auth.signOut();
        return;
      }
      // Supervisor-only post-login security: IP allowlist + single-device claim.
      // This MUST run before we warm the cache or redirect — otherwise a
      // disallowed-IP supervisor would briefly see members in transit.
      if (p.role === 'supervisor' && p.status === 'approved') {
        const supervisorOk = await this.runSupervisorPostLoginChecks();
        if (!supervisorOk) return;
      }
      if ((p.role === 'owner' || p.role === 'supervisor') && p.status === 'approved' && p.ownerId) {
        await this.cache.loadMembers(p.ownerId);
        this.notifications.checkDueMembers(this.cache.members());
        void this.inAppNotifications.syncDueAlertsFromMembers(p.ownerId, this.cache.members());
        // Stamp the login row in the audit trail so the owner can see
        // exactly when each supervisor (or themselves) signed in. Skipped
        // for admins since they don't have a parent owner scope.
        const actorLabel = p.role === 'supervisor'
          ? `${p.name?.trim() || 'Supervisor'} signed in.`
          : `${p.name?.trim() || 'Owner'} signed in.`;
        void this.auditLog.log({
          ownerId: p.ownerId,
          action: 'auth.login',
          entityType: 'auth',
          entityId: load.uid || undefined,
          entityLabel: p.name || p.email || undefined,
          description: actorLabel,
        });
      }
      await this.redirectAfterProfile(p);
    } catch (e: unknown) {
      this.signInError.set(this.signInErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Sign up with email + password (no OTP / reCAPTCHA). Phone and email are mandatory on the form. */
  async onSignUpSubmit(): Promise<void> {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    const emailTrimmed = this.signUpForm.controls.email.value.trim();
    const phoneE164 = normalizeOwnerPhone(this.signUpForm.controls.phone.value);
    if (!phoneE164) {
      this.toast.error(this.i18n.t('login.mobileRequired'));
      this.signUpForm.controls.phone.markAsTouched();
      return;
    }
    if (!emailTrimmed || this.signUpForm.controls.email.invalid) {
      this.toast.error(this.i18n.t('login.emailRequired'));
      this.signUpForm.controls.email.markAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.completeOwnerSignUpWithEmailPassword({
        contactEmail: emailTrimmed,
        password: this.signUpForm.controls.password.value,
        name: this.signUpForm.controls.name.value,
        businessName: this.signUpForm.controls.businessName.value,
        businessType: this.signUpForm.controls.businessType.value,
        phoneE164,
      });
      await this.auth.refreshProfile();
      this.auth.disposeOwnerSignUpPhone();
      this.toast.success('Account created. Waiting for admin approval.');
      await this.router.navigateByUrl('/pending-approval');
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'permission-denied') {
        this.toast.error(
          'Could not save your profile (Firestore blocked). Deploy firestore.rules in Firebase Console → Rules.',
        );
      } else if (code === 'auth/weak-password') {
        this.toast.error(
          'Password is too weak for Firebase. Use at least 8 characters with uppercase, lowercase, a number, and a symbol.',
        );
      } else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        this.toast.error('This mobile or email is already registered. Try signing in instead.');
      } else {
        this.toast.error(this.msg(e, 'Sign up failed'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Run the supervisor-only post-login security checks.
   *
   * Order matters:
   *   1. IP allowlist (cheap network call). If blocked, sign out and stop.
   *   2. Claim a fresh single-device session (writes to supervisors/{uid}).
   *      Owner has no IP restriction or single-device — the helper is only
   *      called for `role === 'supervisor'`.
   *
   * Returns `true` when the supervisor is cleared to proceed, `false`
   * when they were blocked / signed out (caller must abort the redirect).
   */
  private async runSupervisorPostLoginChecks(): Promise<boolean> {
    const uid = this.auth.user()?.uid;
    if (!uid) return false;

    // 1) IP allowlist check.
    let detectedIp: string | null = null;
    try {
      const result = await this.ipRestriction.evaluate(uid);
      detectedIp = result.detectedIp;
      if (result.status === 'blocked') {
        this.signInError.set(
          `Sign-in from this network is not authorised${
            detectedIp ? ` (IP ${detectedIp})` : ''
          }. Ask your owner to allow this network.`,
        );
        await this.auth.signOut();
        return false;
      }
      if (result.status === 'cant-detect') {
        // Fail-closed: if we can't detect the IP and restriction is on,
        // we cannot honour the policy — best to refuse.
        this.signInError.set(
          'Could not verify your network for sign-in. Check your internet and try again.',
        );
        await this.auth.signOut();
        return false;
      }
      // 'allowed' or 'not-supervisor' → continue.
    } catch {
      this.signInError.set(
        'Sign-in security check failed. Please try again in a moment.',
      );
      await this.auth.signOut();
      return false;
    }

    // 2) Claim a single-device session. Failure here is non-blocking — we
    // log to the console but let the supervisor in (the watcher in the
    // shell will retry on the next snapshot). We never want a transient
    // Firestore write hiccup to block legitimate logins.
    try {
      await this.supervisorSession.claimSession(uid, detectedIp);
    } catch (e) {
      console.warn('[supervisor-session] claimSession failed at login', e);
    }
    return true;
  }

  private async redirectAfterProfile(p: { role: string; status: string }): Promise<void> {
    const role = p.role.toLowerCase().trim();
    const status = p.status.toLowerCase().trim();

    if (role === 'admin' && status === 'approved') {
      await this.router.navigateByUrl('/admin/dashboard');
      return;
    }
    if (role === 'owner') {
      if (status === 'pending') {
        await this.router.navigateByUrl('/pending-approval');
        return;
      }
      if (status === 'rejected') {
        await this.router.navigateByUrl('/account-rejected');
        return;
      }
      if (status === 'approved') {
        await this.router.navigateByUrl('/dashboard');
        return;
      }
    }
    if (role === 'supervisor') {
      // Supervisors live under their own /supervisor/* shell — completely
      // independent from the owner routes. Disabled supervisors land on
      // the rejected screen so they get a clear "ask your owner" message
      // instead of being silently signed out.
      if (status === 'disabled' || status === 'inactive') {
        await this.router.navigateByUrl('/account-rejected');
        return;
      }
      await this.router.navigateByUrl('/supervisor/dashboard');
      return;
    }

    this.toast.error('Profile role or status is invalid. Check Firestore fields role and status.');
    await this.auth.signOut();
  }

  private msg(e: unknown, fallback: string): string {
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string') {
      return (e as { message: string }).message;
    }
    return fallback;
  }

  /** Friendly copy for Firebase Auth failures on sign-in (wrong email/password, etc.). */
  private signInErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Mobile/email or password is incorrect. Please check and try again.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
           case 'auth/invalid-phone-number':
        return 'Please enter a valid mobile number (with country code, e.g. +91…).';
      case 'auth/phone-not-registered':
        return 'This mobile number is not registered. Sign up first or sign in with your email.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact support if you need help.';
      case 'auth/too-many-requests':
        return 'Too many sign-in attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return this.msg(e, 'Sign in failed. Please try again.');
    }
  }

}

/**
 * Sign-in identifier accepts three shapes:
 *   1. Email — must look like an email when '@' is present.
 *   2. Mobile — any string `normalizeOwnerPhone` can parse.
 *   3. Supervisor user ID — free-text fallback (letters, digits, _, -, .).
 *
 * `auth.signIn` decides which lookup to use, so the validator only blocks
 * obviously broken email shapes and obvious whitespace garbage.
 */
function signInIdentifierValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  if (raw.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : { email: true };
  }
  return null;
}

function ownerSignUpPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  return normalizeOwnerPhone(raw) ? null : { phone: true };
}

/** Mandatory, trim-aware email (same shape as sign-in identifier email check). */
function ownerSignUpEmailValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : { email: true };
}

/** Sign-up only: ≥8 chars, uppercase, lowercase, digit, special symbol. */
function strongSignupPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const raw = control.value;
  if (raw === null || raw === undefined || String(raw).length === 0) {
    return null;
  }
  const v = String(raw);
  const missing: Record<string, true> = {};
  if (v.length < 8) missing['minLen'] = true;
  if (!/[A-Z]/.test(v)) missing['uppercase'] = true;
  if (!/[a-z]/.test(v)) missing['lowercase'] = true;
  if (!/\d/.test(v)) missing['digit'] = true;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(v)) missing['special'] = true;
  return Object.keys(missing).length ? { strongPassword: missing } : null;
}
