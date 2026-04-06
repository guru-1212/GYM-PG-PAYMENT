import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Optional field: if anything is entered, value must be exactly `len` digits (after stripping non-digits). */
export function optionalDigitsLen(len: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (v === null || v === undefined || v === '') return null;
    const digits = String(v).replace(/\D/g, '');
    return digits.length === len ? null : { digitsLen: { requiredLen: len } };
  };
}

export function positiveAmount(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const n = Number(control.value);
    if (Number.isNaN(n) || n <= 0) return { positive: true };
    return null;
  };
}
