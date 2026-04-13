import {
  afterNextRender,
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { merge } from 'rxjs';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { normalizeOwnerPhone } from '../../core/utils/phone-auth.util';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
// import { LanguageSwitcherComponent } from '../../shared/language-switcher.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { TranslationService } from '../../core/services/translation.service';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, BrandLogoComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  private readonly cache = inject(DataCacheService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly busy = signal(false);
  /** Inline sign-in failure (e.g. wrong email/password), shown above the submit button. */
  readonly signInError = signal('');
  readonly showSignInPassword = signal(false);
  readonly showSignUpPassword = signal(false);
  readonly showForgotPassword = signal(false);
  /** `'details'` → send SMS; `'otp'` → verify code then create account. */
  readonly signUpPhase = signal<'details' | 'otp'>('details');
  readonly signUpOtp = signal('');
  /** PG-only sign-up for now; restore `'gym'` when gym onboarding returns. */
  readonly businessTypeSignal = signal<'gym' | 'pg'>('pg');

  /** After `auth/too-many-requests`, block Send until this time (epoch ms). */
  private readonly signUpSmsBlockedUntilMs = signal(0);
  /** Bumped every second while blocked so the template countdown updates. */
  private readonly signUpSmsCooldownPulse = signal(0);
  private signUpSmsCooldownIntervalId: ReturnType<typeof setInterval> | null = null;
  readonly showInstallHintPopup = signal(false);
  private installHintTimerId: ReturnType<typeof setTimeout> | null = null;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private beforeInstallPromptHandler: ((event: Event) => void) | null = null;
  private appInstalledHandler: (() => void) | null = null;
  private readonly installHintStorageKey = 'pgt.install.completed';

  readonly signInForm = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, signInIdentifierValidator]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly forgotForm = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, signInIdentifierValidator]],
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

  ngOnDestroy(): void {
    this.clearSignUpSmsCooldownTimer();
    this.clearInstallHintTimer();
    this.detachInstallPromptListeners();
  }

  ngOnInit(): void {
    this.attachInstallPromptListeners();
    this.notifications.requestPermissionOnce();
    const requestedMode = (this.route.snapshot.queryParamMap.get('mode') || '').toLowerCase().trim();
    if (requestedMode === 'signup') this.setMode('signup');
    else if (requestedMode === 'signin') this.setMode('signin');
    this.scheduleInstallHintPopupIfNeeded();
    // Re-enable when gym / PG toggle is shown again on sign-up.
    // this.signUpForm.controls.businessType.valueChanges.subscribe((value) => {
    //   this.businessTypeSignal.set(value);
    // });
    merge(
      this.signInForm.controls.identifier.valueChanges,
      this.signInForm.controls.password.valueChanges,
    ).subscribe(() => this.signInError.set(''));
  }

  closeInstallHintPopup(): void {
    this.showInstallHintPopup.set(false);
  }

  async installAppFromPopup(): Promise<void> {
    if (this.isInstalled()) {
      this.showInstallHintPopup.set(false);
      return;
    }
    if (!this.deferredInstallPrompt) {
      this.toast.success('Use browser menu → Add to Home Screen to install the app.');
      return;
    }
    try {
      await this.deferredInstallPrompt.prompt();
      const choice = await this.deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        this.showInstallHintPopup.set(false);
      }
    } finally {
      this.deferredInstallPrompt = null;
    }
  }

  setMode(m: 'signin' | 'signup'): void {
    this.mode.set(m);
    this.signInError.set('');
    this.showForgotPassword.set(false);
    this.auth.disposeOwnerSignUpPhone();
    if (m === 'signup') {
      this.signUpPhase.set('details');
      this.signUpOtp.set('');
      this.scheduleOwnerSignupRecaptchaMount();
    } else {
      this.clearSignUpSmsCooldownTimer();
      this.signUpSmsBlockedUntilMs.set(0);
    }
  }

  /**
   * Mount reCAPTCHA once the sign-up template exists (same intent as ngOnInit + initRecaptcha, but the
   * `#recaptcha-container` node is absent until `mode === 'signup'`). Never create the verifier inside `sendOtp`.
   */
  private scheduleOwnerSignupRecaptchaMount(): void {
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        if (this.mode() !== 'signup' || this.signUpPhase() !== 'details') return;
        void this.auth.ensurePhoneAuthRecaptcha(this.auth.phoneAuthRecaptchaContainerId).catch(() => {
          /* ignore — user can retry on Send */
        });
      });
    });
  }

  /** E.164 preview for SMS (10-digit India → +91…). */
  normalizedSignUpPhoneDisplay(): string | null {
    return normalizeOwnerPhone(this.signUpForm.controls.phone.value);
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
      // Low-cost notification check on login (uses one-time loaded members from existing cache flow).
      if (p.role === 'owner' && p.status === 'approved' && p.ownerId) {
        await this.cache.loadMembers(p.ownerId);
        this.notifications.checkDueMembers(this.cache.members());
      }
      await this.redirectAfterProfile(p);
    } catch (e: unknown) {
      this.signInError.set(this.signInErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Seconds left before Send SMS is allowed again (0 = not blocked). */
  signUpSmsCooldownSecondsLeft(): number {
    this.signUpSmsCooldownPulse();
    const until = this.signUpSmsBlockedUntilMs();
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  signUpSendSmsDisabledByCooldown(): boolean {
    return this.signUpSmsCooldownSecondsLeft() > 0;
  }

  /** Step 1: SMS OTP to the mobile on the form (Firebase Phone Auth + invisible reCAPTCHA). */
  async onSendSignUpOtp(): Promise<void> {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    if (this.signUpSendSmsDisabledByCooldown()) {
      this.toast.error(
        this.i18n.t('login.smsCooldownActive', { seconds: this.signUpSmsCooldownSecondsLeft() }),
      );
      return;
    }
    this.busy.set(true);
    try {
      const phone = normalizeOwnerPhone(this.signUpForm.controls.phone.value);
      if (!phone) {
        this.toast.error('Enter a valid mobile number (10 digits or +country code).');
        return;
      }
      await this.auth.ensurePhoneAuthRecaptcha(this.auth.phoneAuthRecaptchaContainerId);
      await this.auth.sendOtp(phone);
      this.signUpPhase.set('otp');
      this.signUpOtp.set('');
      this.toast.success('Verification code sent to your mobile.');
    } catch (e: unknown) {
      this.auth.disposeOwnerSignUpPhone();
      this.scheduleOwnerSignupRecaptchaMount();
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'auth/too-many-requests') {
        this.startSignUpSmsCooldown(120);
      }
      if (code === 'auth/invalid-app-credential' || code === 'auth/captcha-check-failed') {
        this.logInvalidAppCredentialHelp(code);
      }
      this.toast.error(this.signUpOtpErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Step 2: confirm OTP, link password, create Firestore owner profile. */
  async onVerifySignUpOtp(): Promise<void> {
    const otp = this.signUpOtp().trim();
    if (!/^\d{4,8}$/.test(otp)) {
      this.toast.error('Enter the verification code from the SMS (usually 6 digits).');
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
      await this.auth.completeOwnerSignUpWithOtp(otp, {
        contactEmail: emailTrimmed,
        password: this.signUpForm.controls.password.value,
        name: this.signUpForm.controls.name.value,
        businessName: this.signUpForm.controls.businessName.value,
        businessType: this.signUpForm.controls.businessType.value,
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
      } else if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') {
        this.toast.error('Invalid or expired code. Check the SMS and try again.');
      } else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        this.toast.error('This mobile or email is already registered. Try signing in instead.');
      } else {
        this.toast.error(this.msg(e, 'Sign up failed'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  backToSignUpDetails(): void {
    this.signUpPhase.set('details');
    this.signUpOtp.set('');
    this.auth.disposeOwnerSignUpPhone();
    this.scheduleOwnerSignupRecaptchaMount();
  }

  async onForgotPasswordSubmit(): Promise<void> {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.sendOwnerPasswordReset(this.forgotForm.controls.identifier.value);
      this.toast.success(this.i18n.t('login.resetEmailSentToast'), 14_000);
      this.showForgotPassword.set(false);
      this.forgotForm.reset();
    } catch (e: unknown) {
      this.toast.error(this.forgotPasswordErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
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

  private signUpOtpErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    const serverHint = this.identityToolkitErrorHint(e);
    switch (code) {
      case 'auth/captcha-check-failed':
      case 'auth/invalid-app-credential': {
        const base = this.i18n.t('login.recaptchaOrApiRejected');
        return serverHint ? `${base} ${serverHint}` : base;
      }
      case 'auth/missing-client-identifier':
        return 'Phone auth could not verify this app. Check Firebase Console → Authentication → Settings → Authorized domains includes localhost.';
      case 'auth/too-many-requests':
        return this.i18n.t('login.smsTooManyRequestsToast', { minutes: 2 });
      case 'auth/invalid-phone-number':
      case 'auth/missing-phone-number':
        return (
          'Invalid mobile number for SMS. Use +country code or a valid 10-digit India mobile (sent as +91…). ' +
          serverHint
        ).trim();
      case 'auth/quota-exceeded':
        return 'SMS quota exceeded. Try again later or contact support.';
      case 'auth/missing-verification':
        return 'Please send the verification code first.';
      case 'auth/operation-not-allowed':
        return 'Phone sign-in is disabled for this Firebase project. Enable Phone in Authentication → Sign-in method.';
      default: {
        const base = this.msg(e, 'Could not send verification code.');
        return serverHint ? `${base} ${serverHint}` : base;
      }
    }
  }

  /** Extra detail from Identity Toolkit REST body when present (helps interpret HTTP 400). */
  /** Long checklist only in dev console so the toast stays short. */
  private logInvalidAppCredentialHelp(code: string): void {
    void code;
  }

  private identityToolkitErrorHint(e: unknown): string {
    if (!e || typeof e !== 'object') return '';
    const customData = (e as { customData?: Record<string, unknown> }).customData;
    const sr = customData?.['_serverResponse'];
    if (sr && typeof sr === 'object') {
      const nested = (sr as { error?: { message?: string; errors?: { message?: string }[] } }).error;
      if (nested && typeof nested === 'object') {
        if (typeof nested.message === 'string' && nested.message.trim()) {
          return `(${nested.message.trim()})`;
        }
        const first = nested.errors?.[0]?.message;
        if (typeof first === 'string' && first.trim()) {
          return `(${first.trim()})`;
        }
      }
    }
    return '';
  }

  private startSignUpSmsCooldown(totalSeconds: number): void {
    this.clearSignUpSmsCooldownTimer();
    this.signUpSmsBlockedUntilMs.set(Date.now() + totalSeconds * 1000);
    this.signUpSmsCooldownPulse.update((n) => n + 1);
    this.signUpSmsCooldownIntervalId = setInterval(() => {
      if (Date.now() >= this.signUpSmsBlockedUntilMs()) {
        this.signUpSmsBlockedUntilMs.set(0);
        this.clearSignUpSmsCooldownTimer();
      }
      this.signUpSmsCooldownPulse.update((n) => n + 1);
    }, 1000);
  }

  private clearSignUpSmsCooldownTimer(): void {
    if (this.signUpSmsCooldownIntervalId !== null) {
      clearInterval(this.signUpSmsCooldownIntervalId);
      this.signUpSmsCooldownIntervalId = null;
    }
  }

  private forgotPasswordErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/invalid-phone-number':
        return 'Enter a valid email or mobile number.';
      case 'auth/user-not-found':
        return 'No account found for this email or mobile.';
      default:
        return this.msg(e, 'Could not send reset email.');
    }
  }

  private scheduleInstallHintPopupIfNeeded(): void {
    const fromHome = this.route.snapshot.queryParamMap.get('installHint') === '1';
    if (!fromHome || this.isInstalled()) return;
    this.clearInstallHintTimer();
    const delayMs = 2000 + Math.floor(Math.random() * 3001); // 2-5 seconds
    this.installHintTimerId = setTimeout(() => {
      if (!this.isInstalled()) {
        this.showInstallHintPopup.set(true);
      }
    }, delayMs);
  }

  private clearInstallHintTimer(): void {
    if (this.installHintTimerId !== null) {
      clearTimeout(this.installHintTimerId);
      this.installHintTimerId = null;
    }
  }

  private attachInstallPromptListeners(): void {
    if (typeof window === 'undefined') return;
    this.beforeInstallPromptHandler = (event: Event) => {
      event.preventDefault();
      this.deferredInstallPrompt = event as BeforeInstallPromptEvent;
    };
    this.appInstalledHandler = () => {
      try {
        localStorage.setItem(this.installHintStorageKey, '1');
      } catch {
      }
      this.showInstallHintPopup.set(false);
      this.deferredInstallPrompt = null;
    };
    window.addEventListener('beforeinstallprompt', this.beforeInstallPromptHandler as EventListener);
    window.addEventListener('appinstalled', this.appInstalledHandler as EventListener);
  }

  private detachInstallPromptListeners(): void {
    if (typeof window === 'undefined') return;
    if (this.beforeInstallPromptHandler) {
      window.removeEventListener('beforeinstallprompt', this.beforeInstallPromptHandler as EventListener);
      this.beforeInstallPromptHandler = null;
    }
    if (this.appInstalledHandler) {
      window.removeEventListener('appinstalled', this.appInstalledHandler as EventListener);
      this.appInstalledHandler = null;
    }
  }

  private isInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem(this.installHintStorageKey) === '1') return true;
    } catch {
    }
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const standaloneNavigator = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    return Boolean(standaloneMedia || standaloneNavigator);
  }
}

function signInIdentifierValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  if (raw.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : { email: true };
  }
  return normalizeOwnerPhone(raw) ? null : { phone: true };
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
