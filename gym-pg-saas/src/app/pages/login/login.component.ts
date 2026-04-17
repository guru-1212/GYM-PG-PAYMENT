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
  /** PG-only sign-up for now; restore `'gym'` when gym onboarding returns. */
  readonly businessTypeSignal = signal<'gym' | 'pg'>('pg');

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
      console.debug('[Login] Signing in with identifier:', this.signInForm.controls.identifier.value.trim());
      await this.auth.signIn(this.signInForm.controls.identifier.value, this.signInForm.controls.password.value);
      console.debug('[Login] Sign in successful');
      
      // Check if worker login was successful
      if (this.auth.isWorker()) {
        console.debug('[Login] Worker login detected - redirecting to dashboard');
        // Worker login - redirect to dashboard
        await this.router.navigateByUrl('/dashboard');
        return;
      }

      console.debug('[Login] Owner login detected - loading profile');
      // Owner login - load profile
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
          this.toast.error('Could not load profile. See browser console (filter: [Login]).');
        }
        await this.auth.signOut();
        return;
      }
      if (p.role === 'owner' && p.status === 'approved' && p.ownerId) {
        await this.cache.loadMembers(p.ownerId);
        this.notifications.checkDueMembers(this.cache.members());
      }
      await this.redirectAfterProfile(p);
    } catch (e: unknown) {
      console.error('[Login] Sign in failed:', e);
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
    const message =
      e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
    
    // Log the full error for debugging
    if (e && typeof e === 'object') {
      const msg = (e as { message?: string }).message || String(e);
      console.debug('[Login] Error details - Code:', code, 'Message:', msg);
    }
    
    // Firestore permission errors
    if (code === 'firestore/permission-denied' || message?.includes('Firestore permissions error')) {
      return 'Firestore setup incomplete. Admin needs to deploy firestore.rules. Check admin console.';
    }
    
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Email or password is incorrect. Please check and try again. (If you are a worker, use your worker credentials.)';
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

  private forgotPasswordErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    // Temporary debug for reset-link troubleshooting.
    if (code) {
      console.info('[AuthDebug][PasswordReset][error]', {
        code,
        message: this.msg(e, ''),
      });
    }
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/invalid-phone-number':
        return 'Enter a valid email or mobile number.';
      case 'auth/user-not-found':
        return 'No account found for this email or mobile.';
      case 'auth/phone-not-registered':
        return 'This mobile number is not registered.';
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
