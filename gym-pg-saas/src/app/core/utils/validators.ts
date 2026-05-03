import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { parseYyyyMmDdLocal, startOfToday } from './date.utils';

/**
 * Optional field: empty OK; if non-empty, value must be digits only (no spaces/symbols) and exactly `len` digits.
 */
export function optionalDigitsLen(len: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (s === '') return null;
    if (!/^\d+$/.test(s)) return { digitsOnly: true };
    return s.length === len ? null : { digitsLen: { requiredLen: len } };
  };
}

export function positiveAmount(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const n = Number(control.value);
    if (Number.isNaN(n) || n <= 0) return { positive: true };
    return null;
  };
}

/** Validator to ensure dueDate is not before joinDate. */
export function dueDateAfterJoinDate(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const dueDate = control.value;
    if (!dueDate) return null; // Allow empty/null values

    const parent = control.parent;
    if (!parent) return null;

    const joinDate = parent.get('joinDate')?.value;
    if (!joinDate) return null; // Allow if joinDate is not yet set

    const dueDateObj = parseYyyyMmDdLocal(String(dueDate));
    const joinDateObj = parseYyyyMmDdLocal(String(joinDate));
    if (!dueDateObj || !joinDateObj) return null;

    dueDateObj.setHours(0, 0, 0, 0);
    joinDateObj.setHours(0, 0, 0, 0);

    return dueDateObj >= joinDateObj ? null : { dueDateBeforeJoinDate: true };
  };
}

/** Join date must be today or later (local calendar). Expects `YYYY-MM-DD`. */
export function joinDateNotInPast(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (v === null || v === undefined || v === '') return null;
    const join = parseYyyyMmDdLocal(String(v));
    if (!join) return { joinDateInvalid: true };
    join.setHours(0, 0, 0, 0);
    const today = startOfToday();
    return join >= today ? null : { joinDateInPast: true };
  };
}

export function applyDigitsOnlyFromInput(control: AbstractControl, event: Event, maxLen?: number): void {
  const el = event.target as HTMLInputElement;
  let digits = el.value.replace(/\D/g, '');
  if (maxLen !== undefined && digits.length > maxLen) {
    digits = digits.slice(0, maxLen);
  }
  control.setValue(digits, { emitEvent: true });
  if (el.value !== digits) {
    el.value = digits;
  }
}

// --- Member mobile (India): forgiving paste/format, digits-only stored, friendly display -------------

/** Strips non-digits and normalizes pasted values like WhatsApp (+91 spaced). */
export function normalizeIndianMemberMobileDigits(raw: unknown): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

/**
 * Displays a digits-only stored value like `7467674876` as `74676 74876`.
 * Overflow digits (still invalid until user fixes) remain visible after the grouping.
 */
export function formatIndianMemberMobileDisplay(storedDigits: string): string {
  const digits = normalizeIndianMemberMobileDigits(storedDigits);
  if (!digits) return '';
  if (digits.length <= 5) return digits;
  const prefix = digits.slice(0, 5);
  const mid = digits.slice(5, 10);
  const tail = digits.slice(10);
  return tail.length > 0 ? `${prefix} ${mid} ${tail}` : `${prefix} ${mid}`;
}

/**
 * Parses the visible input (any spacing/symbols), updates the control with normalized digits-only,
 * and rewrites the field to spaced display after Angular sync (queueMicrotask).
 */
export function applyIndianMemberMobileFromInput(control: AbstractControl, event: Event): void {
  const el = event.target as HTMLInputElement;
  const stored = normalizeIndianMemberMobileDigits(el.value);
  control.setValue(stored, { emitEvent: true });
  const display = formatIndianMemberMobileDisplay(stored);
  queueMicrotask(() => {
    if (el !== event.target) return;
    if (el.value !== display) {
      el.value = display;
    }
  });
}

/**
 * Member mobile required; value is digits-only.
 * `- incomplete`: still typing (fewer than 10 digits); invalid but do not surface as "wrong number".
 * `- indianMobileInvalid`: 10 digits but not a valid Indian mobile, or more than 10 digits after normalization.
 */
export function indianMemberMobileValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const stored = normalizeIndianMemberMobileDigits(control.value);
    if (!stored) {
      return { required: true };
    }
    if (stored.length < 10) {
      return { incomplete: true };
    }
    if (stored.length > 10) {
      return { indianMobileInvalid: true };
    }
    if (!/^[6-9]\d{9}$/.test(stored)) {
      return { indianMobileInvalid: true };
    }
    return null;
  };
}
