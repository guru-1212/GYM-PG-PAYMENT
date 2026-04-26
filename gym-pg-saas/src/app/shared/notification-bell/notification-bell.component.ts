import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  Component,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { AppNotification } from '../../core/models/app-notification.model';
import type { OwnerBroadcast } from '../../core/services/member-broadcast.service';
import { InAppNotificationService } from '../../core/services/in-app-notification.service';
import { MemberBroadcastService } from '../../core/services/member-broadcast.service';
import { playNotificationChime } from '../../core/utils/notification-sound.util';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit, OnChanges, OnDestroy {
  @HostBinding('class.nb-host--page')
  get hostPageLayout(): boolean {
    return this.pageMode && this.mode === 'owner';
  }

  @Input() mode: 'owner' | 'member' = 'owner';
  @Input() ownerId: string | null = null;
  /** When true (e.g. Notify members page), show a Notifications tab + bell; both open the same right drawer. */
  @Input({ transform: booleanAttribute }) hub = false;
  /** Full-page owner layout (sidebar route): same tables, no drawer or bell chrome. */
  @Input({ transform: booleanAttribute }) pageMode = false;

  private readonly inApp = inject(InAppNotificationService);
  private readonly broadcasts = inject(MemberBroadcastService);

  readonly menuOpen = signal(false);
  readonly ownerRows = signal<AppNotification[]>([]);
  /** Owner: broadcasts this owner sent (history). */
  readonly ownerSentRows = signal<OwnerBroadcast[]>([]);
  readonly memberRows = signal<OwnerBroadcast[]>([]);
  private unsubInApp: (() => void) | null = null;
  private unsubBroadcasts: (() => void) | null = null;
  private lastUnreadSnapshot = -1;
  private skipNextSound = true;

  readonly unreadOwnerCount = computed(() => this.ownerRows().filter((n) => !n.read).length);

  readonly unreadMemberCount = computed(() => {
    const seen = this.readSeenBroadcastIds();
    return this.memberRows().filter((b) => !seen.has(b.id)).length;
  });

  readonly badgeCount = computed(() =>
    this.mode === 'member' ? this.unreadMemberCount() : this.unreadOwnerCount(),
  );

  previewText(text: string, maxLen: number): string {
    const t = (text || '').trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen - 1)}\u2026`;
  }

  ngOnInit(): void {
    this.bindWatch();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ownerId'] || changes['mode']) {
      this.bindWatch();
    }
  }

  private bindWatch(): void {
    this.clearSubs();
    this.ownerRows.set([]);
    this.ownerSentRows.set([]);
    this.memberRows.set([]);
    this.lastUnreadSnapshot = -1;
    this.skipNextSound = true;

    const oid = this.ownerId;
    if (!oid) return;

    if (this.mode === 'member') {
      this.unsubBroadcasts = this.broadcasts.watchBroadcasts(oid, (rows) => {
        const unread = this.unreadMemberCountFrom(rows);
        this.maybeChime(unread);
        this.memberRows.set(rows);
      });
      return;
    }

    this.unsubInApp = this.inApp.watchOwnerNotifications(oid, (rows) => {
      const unread = rows.filter((r) => !r.read).length;
      this.maybeChime(unread);
      this.ownerRows.set(rows);
    });

    this.unsubBroadcasts = this.broadcasts.watchBroadcasts(oid, (rows) => {
      this.ownerSentRows.set(rows);
    });
  }

  private clearSubs(): void {
    this.unsubInApp?.();
    this.unsubInApp = null;
    this.unsubBroadcasts?.();
    this.unsubBroadcasts = null;
  }

  private maybeChime(unread: number): void {
    if (this.skipNextSound) {
      this.skipNextSound = false;
      this.lastUnreadSnapshot = unread;
      return;
    }
    if (unread > this.lastUnreadSnapshot) {
      playNotificationChime();
    }
    this.lastUnreadSnapshot = unread;
  }

  private unreadMemberCountFrom(rows: OwnerBroadcast[]): number {
    const seen = this.readSeenBroadcastIds();
    return rows.filter((b) => !seen.has(b.id)).length;
  }

  ngOnDestroy(): void {
    this.clearSubs();
    this.setBodyScrollLocked(false);
  }

  private readSeenBroadcastIds(): Set<string> {
    const oid = this.ownerId || '';
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(`memberBroadcastSeen:${oid}`) : null;
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  private persistSeen(ids: string[]): void {
    const oid = this.ownerId || '';
    if (!oid) return;
    const set = this.readSeenBroadcastIds();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(`memberBroadcastSeen:${oid}`, JSON.stringify([...set]));
  }

  private setBodyScrollLocked(locked: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => {
      const next = !v;
      this.setBodyScrollLocked(next);
      return next;
    });
  }

  closeMenu(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      this.setBodyScrollLocked(false);
    }
  }

  async onPickOwner(n: AppNotification): Promise<void> {
    const oid = this.ownerId;
    if (!oid || n.read) return;
    await this.inApp.markRead(oid, n.id);
  }

  async markAllOwnerRead(): Promise<void> {
    const oid = this.ownerId;
    if (!oid) return;
    const ids = this.ownerRows().filter((r) => !r.read).map((r) => r.id);
    await this.inApp.markAllRead(oid, ids);
  }

  onPickMemberBroadcast(b: OwnerBroadcast): void {
    this.persistSeen([b.id]);
    this.memberRows.set([...this.memberRows()]);
  }

  markAllMemberRead(): void {
    this.persistSeen(this.memberRows().map((b) => b.id));
    this.memberRows.set([...this.memberRows()]);
  }

  trackOwner(_i: number, n: AppNotification): string {
    return n.id;
  }

  trackMember(_i: number, b: OwnerBroadcast): string {
    return b.id;
  }

  trackSent(_i: number, b: OwnerBroadcast): string {
    return b.id;
  }

  isMemberBroadcastUnread(b: OwnerBroadcast): boolean {
    return !this.readSeenBroadcastIds().has(b.id);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closeMenu();
  }
}
