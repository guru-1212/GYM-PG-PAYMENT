import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { merge } from 'rxjs';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
// import { LanguageSwitcherComponent } from '../../shared/language-switcher.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, BrandLogoComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
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
  /** PG-only sign-up for now; restore `'gym'` when gym onboarding returns. */
  readonly businessTypeSignal = signal<'gym' | 'pg'>('pg');

  readonly signInForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly signUpForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    businessName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
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
    if (requestedMode === 'signup') this.mode.set('signup');
    if (requestedMode === 'signin') this.mode.set('signin');
    // Re-enable when gym / PG toggle is shown again on sign-up.
    // this.signUpForm.controls.businessType.valueChanges.subscribe((value) => {
    //   this.businessTypeSignal.set(value);
    // });
    merge(
      this.signInForm.controls.email.valueChanges,
      this.signInForm.controls.password.valueChanges,
    ).subscribe(() => this.signInError.set(''));
  }

  setMode(m: 'signin' | 'signup'): void {
    this.mode.set(m);
    this.signInError.set('');
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
      console.log(
        '%c PayBook ',
        'background:#0369a1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
        'Sign-in submitted — if you see nothing below, open DevTools → Console and set level to "All" (not only Errors).',
      );
      await this.auth.signIn(this.signInForm.controls.email.value, this.signInForm.controls.password.value);
      const load = await this.auth.loadProfileOnce();
      const p = load.owner;
      if (!environment.production) {
        console.log('[Login] profile load:', p ? { role: p.role, status: p.status } : load);
      }
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

  async onSignUp(): Promise<void> {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.signUp(
        this.signUpForm.controls.email.value,
        this.signUpForm.controls.password.value,
        this.signUpForm.controls.name.value,
        this.signUpForm.controls.businessName.value,
        this.signUpForm.controls.businessType.value,
      );
      await this.auth.refreshProfile();
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
      } else {
        this.toast.error(this.msg(e, 'Sign up failed'));
      }
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

    if (!environment.production) {
      console.warn('[Login] redirectAfterProfile: unmatched role/status', { role, status });
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
        return 'Email or password is incorrect. Please check and try again.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
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
