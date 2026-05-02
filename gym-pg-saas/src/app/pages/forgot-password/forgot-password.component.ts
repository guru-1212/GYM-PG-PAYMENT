import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ConfirmationResult } from 'firebase/auth';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { normalizeOwnerPhone } from '../../core/utils/phone-auth.util';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

type ResetStep = 'phone' | 'otp' | 'password' | 'done';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, BrandLogoComponent],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly step = signal<ResetStep>('phone');
  readonly busy = signal(false);
  readonly errorMsg = signal('');
  readonly resendCountdown = signal(0);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  /** Container id for the invisible reCAPTCHA used by Firebase Phone Auth. */
  readonly recaptchaId = 'fp-recaptcha-container';

  readonly phoneForm = this.fb.nonNullable.group({
    phone: ['', [Validators.required, phoneValidator]],
  });

  readonly otpForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, strongPasswordValidator]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchPasswordsValidator },
  );

  /** Verified E.164 phone number once Step 1 succeeds. Exposed for the template. */
  readonly phoneE164Display = signal<string>('');

  private confirmation: ConfirmationResult | null = null;
  private resendTimerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Page mount — nothing to do; OTP request happens on form submit.
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
    this.auth.disposePhoneResetRecaptcha();
  }

  /** Sign-up template helper for live password requirement display. */
  passwordStrongErrors(): Record<string, true> | null {
    const c = this.passwordForm.controls.newPassword;
    if (!c.hasError('strongPassword')) return null;
    return c.getError('strongPassword') as Record<string, true>;
  }

  async sendOtp(): Promise<void> {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }
    this.errorMsg.set('');
    this.busy.set(true);
    try {
      const raw = this.phoneForm.controls.phone.value;
      const normalized = normalizeOwnerPhone(raw);
      if (!normalized) {
        this.errorMsg.set('Please enter a valid mobile number.');
        return;
      }
      this.phoneE164Display.set(normalized);
      this.confirmation = await this.auth.startPhonePasswordReset(raw, this.recaptchaId);
      this.step.set('otp');
      this.startResendCountdown(45);
      this.toast.success(`OTP sent to ${this.maskedPhone(normalized)}`);
    } catch (e: unknown) {
      this.errorMsg.set(this.otpRequestErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async verifyOtp(): Promise<void> {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    if (!this.confirmation) {
      this.errorMsg.set('OTP session expired. Please request a new code.');
      this.step.set('phone');
      return;
    }
    this.errorMsg.set('');
    this.busy.set(true);
    try {
      await this.auth.confirmPhoneResetOtp(this.confirmation, this.otpForm.controls.code.value);
      this.step.set('password');
    } catch (e: unknown) {
      this.errorMsg.set(this.otpVerifyErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async submitNewPassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.errorMsg.set('');
    this.busy.set(true);
    try {
      await this.auth.finishPhonePasswordReset(this.passwordForm.controls.newPassword.value);
      this.confirmation = null;
      this.step.set('done');
      this.toast.success('Password reset successful. Please sign in with the new password.');
    } catch (e: unknown) {
      this.errorMsg.set(this.resetErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async resendOtp(): Promise<void> {
    if (this.resendCountdown() > 0 || this.busy()) return;
    this.otpForm.reset({ code: '' });
    this.errorMsg.set('');
    this.busy.set(true);
    try {
      this.confirmation = await this.auth.startPhonePasswordReset(
        this.phoneE164Display(),
        this.recaptchaId,
      );
      this.startResendCountdown(45);
      this.toast.success('New OTP sent.');
    } catch (e: unknown) {
      this.errorMsg.set(this.otpRequestErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  changeNumber(): void {
    this.confirmation = null;
    this.phoneE164Display.set('');
    this.otpForm.reset({ code: '' });
    this.errorMsg.set('');
    this.clearResendTimer();
    this.auth.disposePhoneResetRecaptcha();
    this.step.set('phone');
  }

  async goToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login');
  }

  maskedPhone(phoneE164: string): string {
    if (!phoneE164 || phoneE164.length < 4) return phoneE164;
    return `${phoneE164.slice(0, phoneE164.length - 7)}*****${phoneE164.slice(-2)}`;
  }

  private startResendCountdown(seconds: number): void {
    this.clearResendTimer();
    this.resendCountdown.set(seconds);
    this.resendTimerId = setInterval(() => {
      const v = this.resendCountdown();
      if (v <= 1) {
        this.clearResendTimer();
        this.resendCountdown.set(0);
      } else {
        this.resendCountdown.set(v - 1);
      }
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimerId !== null) {
      clearInterval(this.resendTimerId);
      this.resendTimerId = null;
    }
  }

  private otpRequestErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    switch (code) {
      case 'auth/invalid-phone-number':
        return 'Please enter a valid mobile number (e.g. +91 98xxxxxxxx).';
      case 'auth/phone-not-registered':
        return 'This mobile number is not registered. Please sign up first.';
      case 'auth/operation-not-allowed':
        return 'Phone sign-in is not enabled in Firebase Console. Enable Authentication → Phone provider.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'auth/quota-exceeded':
        return 'Daily OTP quota exceeded. Please try again later.';
      case 'auth/captcha-check-failed':
      case 'auth/argument-error':
        return 'Robot check failed. Please refresh the page and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return msg(e, 'Could not send OTP. Please try again.');
    }
  }

  private otpVerifyErrorMessage(e: unknown): string {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    switch (code) {
      case 'auth/invalid-verification-code':
      case 'auth/invalid-otp':
      case 'auth/code-expired':
        return 'Incorrect or expired OTP. Please try again or request a new code.';
      case 'auth/session-expired':
        return 'OTP session expired. Please request a new code.';
      default:
        return msg(e, 'Could not verify OTP. Please try again.');
    }
  }

  private resetErrorMessage(e: unknown): string {
    const rawCode =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    const code = rawCode.replace(/^functions\//, '');
    const serverMsg = callableServerMessage(e);

    if (code === 'unauthenticated' || rawCode === 'auth/unauthenticated') {
      return 'Your OTP session expired. Please verify the OTP again.';
    }
    if (code === 'invalid-argument') {
      return serverMsg ?? 'Password does not meet the strength requirements.';
    }
    if (code === 'not-found') {
      return serverMsg ?? 'No account found for this mobile number.';
    }
    if (code === 'permission-denied') {
      return serverMsg ?? 'OTP verification missing. Please restart the reset flow.';
    }
    if (code === 'failed-precondition') {
      return (
        serverMsg ??
        'This step cannot be completed right now. Please complete the OTP step again or refresh the page.'
      );
    }
    if (code === 'unavailable' || code === 'resource-exhausted') {
      return 'The reset service is busy. Please wait a moment and try again.';
    }
    if (
      code === 'deadline-exceeded' ||
      /deadline exceeded/i.test(serverMsg ?? '')
    ) {
      return 'The reset service took too long to respond (slow network or server busy). Please try again in a moment.';
    }
    // Firebase client uses HTTP status -> code "unknown" with message "unknown" when the response
    // is unexpected (proxy, Hosting rewrite, blocked cloudfunctions.net on some networks, etc.).
    if (code === 'unknown' || code === 'internal') {
      return 'Could not complete password reset (network or server error). Try again in a moment. If you are testing on localhost, open the same screen on your live site or ask your admin to check the reset function URL.';
    }
    if (serverMsg) {
      return serverMsg;
    }
    return 'Could not reset password. Please try again.';
  }
}

/** Non-empty server message from a callable error, or null if it is a generic SDK placeholder. */
function callableServerMessage(e: unknown): string | null {
  if (!e || typeof e !== 'object' || !('message' in e)) return null;
  const m = (e as { message: unknown }).message;
  if (typeof m !== 'string') return null;
  const t = m.trim();
  if (!t || /^unknown$/i.test(t) || /^internal$/i.test(t)) return null;
  return t;
}

function normalizeFunctionsCode(e: unknown): string {
  const raw =
    e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
  return raw.replace(/^functions\//, '');
}

function msg(e: unknown, fallback: string): string {
  const server = callableServerMessage(e);
  if (server) return server;
  const code = normalizeFunctionsCode(e);
  if (code === 'unknown' || code === 'internal') {
    return 'A network or server error occurred. Please try again.';
  }
  return fallback;
}

function phoneValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  return normalizeOwnerPhone(raw) ? null : { phone: true };
}

function strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
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

function matchPasswordsValidator(group: AbstractControl): ValidationErrors | null {
  const np = group.get('newPassword')?.value;
  const cp = group.get('confirmPassword')?.value;
  if (!np || !cp) return null;
  return np === cp ? null : { mismatch: true };
}
