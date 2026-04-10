import { Injectable } from '@angular/core';
import { Member } from '../models/member.model';
import { calendarDaysBetween, startOfDay, startOfToday, timestampToDate } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly permissionAskedKey = 'notify.permission.asked.v1';
  private readonly shownPrefix = 'notify.shown.v1';

  requestPermissionOnce(): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    if (localStorage.getItem(this.permissionAskedKey) === '1') return;
    localStorage.setItem(this.permissionAskedKey, '1');
    void Notification.requestPermission();
  }

  checkDueMembers(members: Member[]): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const today = startOfToday();
    const overdue: Member[] = [];
    const dueSoon: Member[] = [];

    for (const m of members) {
      if (m.status !== 'active') continue;
      const due = timestampToDate(m.dueDate);
      if (!due) continue;
      const daysLeft = calendarDaysBetween(today, startOfDay(due));
      if (daysLeft < 0) overdue.push(m);
      else if (daysLeft >= 1 && daysLeft <= 2) dueSoon.push(m);
    }

    if (overdue.length > 0) {
      this.showNotification(
        'Overdue Members',
        `${overdue.length} member(s) have overdue payment.`,
        this.buildDedupKey('overdue', overdue),
      );
    }

    if (dueSoon.length > 0) {
      this.showNotification(
        'Due Soon Members',
        `${dueSoon.length} member(s) due in 1-2 days.`,
        this.buildDedupKey('duesoon', dueSoon),
      );
    }
  }

  showNotification(title: string, body: string, dedupKey?: string): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (dedupKey && this.wasShown(dedupKey)) return;

    new Notification(title, { body, icon: '/favicon.ico' });
    if (dedupKey) this.markShown(dedupKey);
  }

  private buildDedupKey(type: 'overdue' | 'duesoon', members: Member[]): string {
    const today = new Date().toISOString().slice(0, 10);
    const ids = members.map((m) => m.memberId).sort().join(',');
    return `${this.shownPrefix}:${today}:${type}:${ids}`;
  }

  private wasShown(key: string): boolean {
    return localStorage.getItem(key) === '1';
  }

  private markShown(key: string): void {
    localStorage.setItem(key, '1');
  }
}