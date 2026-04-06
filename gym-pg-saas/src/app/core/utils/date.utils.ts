import { Timestamp } from 'firebase/firestore';
import type { SubscriptionType } from '../models/member.model';

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Normalize to local midnight for calendar-day comparisons. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function timestampToDate(ts: Timestamp | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate();
}

/**
 * Firestore may return a `Timestamp`, a plain `{ seconds, nanoseconds }`, or (rarely) a `Date`.
 * Use this when reading payment/member dates from snapshots so month filters stay correct after reload.
 */
export function coerceFirestoreDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const o = value as { seconds?: unknown; nanoseconds?: unknown; _seconds?: unknown; _nanoseconds?: unknown };
    const sec = Number(o.seconds ?? o._seconds);
    if (!Number.isFinite(sec)) return null;
    const nano = Number(o.nanoseconds ?? o._nanoseconds ?? 0);
    return new Timestamp(sec, Number.isFinite(nano) ? nano : 0).toDate();
  }
  return null;
}

export function isDateInCalendarMonth(d: Date, ref: Date = new Date()): boolean {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function dateToTimestamp(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

/** Due status for UI: overdue | dueToday | paid (ahead) */
export type DueUiStatus = 'overdue' | 'dueToday' | 'paid';

export function dueUiStatus(due: Date): DueUiStatus {
  const today = startOfToday();
  const endToday = endOfToday();
  if (due < today) return 'overdue';
  if (isSameCalendarDay(due, today) || (due >= today && due <= endToday)) return 'dueToday';
  return 'paid';
}

/** Grouping for member lists (active members only; use `inactive` bucket otherwise). */
export type DueBucket =
  | 'overdue'
  | 'dueToday'
  | 'oneDayLeft'
  | 'twoDaysLeft'
  | 'future'
  | 'inactive'
  | 'unknown';

export function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = startOfDay(earlier).getTime();
  const b = startOfDay(later).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Days overdue (positive). 0 if not overdue.
 */
export function overdueCalendarDays(due: Date, ref: Date = new Date()): number {
  const diff = calendarDaysBetween(due, ref);
  return diff < 0 ? -diff : 0;
}

export function memberDueBucket(due: Date | null, isActive: boolean): DueBucket {
  if (!isActive) return 'inactive';
  if (!due) return 'unknown';
  const diff = calendarDaysBetween(startOfToday(), startOfDay(due));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'dueToday';
  if (diff === 1) return 'oneDayLeft';
  if (diff === 2) return 'twoDaysLeft';
  return 'future';
}

/** User-facing line for due column (active members). */
export function dueRemainingOrOverdueLabel(due: Date | null, isActive: boolean): string {
  if (!isActive) return '—';
  if (!due) return '—';
  const b = memberDueBucket(due, true);
  if (b === 'overdue') {
    const n = overdueCalendarDays(due);
    return n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`;
  }
  if (b === 'dueToday') return 'Due today';
  if (b === 'oneDayLeft') return '1 day left';
  if (b === 'twoDaysLeft') return '2 days left';
  const diff = calendarDaysBetween(startOfToday(), startOfDay(due));
  return `${diff} days left`;
}

/** Next billing date after a payment, anchored to the current due date (not “today”). */
export function nextDueAfterPaid(currentDue: Date, subscription: SubscriptionType | undefined | null): Date {
  const sub = subscription || 'monthly';
  const months = sub === 'yearly' ? 12 : sub === 'quarterly' ? 3 : 1;
  const d = new Date(currentDue);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** First due date for a new member from join date. */
export function firstDueFromJoin(join: Date, subscription: SubscriptionType | undefined | null): Date {
  return nextDueAfterPaid(join, subscription);
}
