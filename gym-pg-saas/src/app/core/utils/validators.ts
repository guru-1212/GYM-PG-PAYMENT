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
