import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { Member } from '../../core/models/member.model';
import { PgLayout } from '../../core/models/pg-layout.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { formatYyyyMmDdAsDdMmYyyy, yyyyMmDdFromLocalDate } from '../../core/utils/date.utils';
import { formatPgRoomLabel, sharingLabelForBeds } from '../../core/utils/pg-layout-display.utils';
import { ModalComponent } from '../modal.component';
import { TranslatePipe } from '../pipes/translate.pipe';

type BedMapSearchTarget =
  | { kind: 'bed'; floor: number; room: number; bed: number }
  | { kind: 'room'; floor: number; room: number }
  | { kind: 'floor'; floor: number };

@Component({
  selector: 'app-bed-map-seat-grid',
  standalone: true,
  imports: [ModalComponent, TranslatePipe],
  templateUrl: './bed-map-seat-grid.component.html',
  styles: [
    `
      .seat-tooltip-panel {
        width: min(17.5rem, calc(100vw - 2rem));
        max-width: min(17.5rem, calc(100vw - 2rem));
      }
      .seat-tooltip-pos-left {
        left: 0;
        right: auto;
        transform: translateX(0);
      }
      .seat-tooltip-pos-center {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
      }
      .seat-tooltip-pos-right {
        left: auto;
        right: 0;
        transform: translateX(0);
      }
      .seat-tooltip-arrow-left.seat-tooltip-arrow-dir-down {
        top: 100%;
        bottom: auto;
        left: 1.25rem;
        right: auto;
        transform: translate(-50%, -50%) rotate(45deg);
      }
      .seat-tooltip-arrow-center.seat-tooltip-arrow-dir-down {
        top: 100%;
        bottom: auto;
        left: 50%;
        right: auto;
        transform: translate(-50%, -50%) rotate(45deg);
      }
      .seat-tooltip-arrow-right.seat-tooltip-arrow-dir-down {
        top: 100%;
        bottom: auto;
        left: auto;
        right: 1.25rem;
        transform: translate(50%, -50%) rotate(45deg);
      }
      .seat-tooltip-arrow-left.seat-tooltip-arrow-dir-up {
        top: auto;
        bottom: 100%;
        left: 1.25rem;
        right: auto;
        transform: translate(-50%, 50%) rotate(45deg);
      }
      .seat-tooltip-arrow-center.seat-tooltip-arrow-dir-up {
        top: auto;
        bottom: 100%;
        left: 50%;
        right: auto;
        transform: translate(-50%, 50%) rotate(45deg);
      }
      .seat-tooltip-arrow-right.seat-tooltip-arrow-dir-up {
        top: auto;
        bottom: 100%;
        left: auto;
        right: 1.25rem;
        transform: translate(50%, 50%) rotate(45deg);
      }
      @keyframes bedmap-search-blink {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
        }
        50% {
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.88);
        }
      }
      .bedmap-search-flash {
        animation: bedmap-search-blink 0.34s ease-in-out 3;
      }
      @keyframes sharing-filter-glow {
        0%,
        100% {
          box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.4), 0 0 15px rgba(250, 204, 21, 0.6);
        }
        50% {
          box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.8), 0 0 25px rgba(250, 204, 21, 0.9);
        }
      }
      .sharing-filter-highlight {
        animation: sharing-filter-glow 1.5s ease-in-out infinite;
        border-color: rgb(250, 204, 21) !important;
      }
    `,
  ],
})
export class BedMapSeatGridComponent {
  private readonly auth = inject(AuthService);
  private readonly membersApi = inject(MemberService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  readonly layout = input<PgLayout | null>(null);
  readonly members = input<Member[]>([]);
  readonly showOccupantActions = input(false);

  readonly canEditMembers = computed(() => this.auth.hasPermission('canEditMembers'));
  readonly showActionsStrip = computed(() => this.showOccupantActions() && this.canEditMembers());

  readonly occupiedBedKeys = computed(() => {
    const set = new Set<string>();
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const key = this.bedKey(m.floorNumber, m.roomNumber, m.bedNumber);
      if (key) set.add(key);
    }
    return set;
  });

  readonly occupiedMembersByBed = computed(() => {
    const map = new Map<string, Member>();
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const key = this.bedKey(m.floorNumber, m.roomNumber, m.bedNumber);
      if (key) map.set(key, m);
    }
    return map;
  });

  readonly deactivateOpen = signal(false);
  readonly deactivateMember = signal<Member | null>(null);
  readonly deactivateBusy = signal(false);

  readonly scheduleOpen = signal(false);
  readonly scheduleMember = signal<Member | null>(null);
  readonly scheduleDateRaw = signal('');
  readonly scheduleBusy = signal(false);

  readonly mobileBedDetailsOpen = signal(false);
  readonly mobileBedDetails = signal<{
    floorNumber: number;
    roomNumber: number;
    bedNumber: number;
    totalBeds: number;
    member: Member;
  } | null>(null);

  /** Viewport-aware tooltip: 'above' (default) or 'below' the bed cell. */
  private readonly seatTooltipVertical = signal<Map<string, 'above' | 'below'>>(new Map());

  /** Track pointer movements to detect scroll vs click */
  private pointerStartX = 0;
  private pointerStartY = 0;
  private isScrolling = false;
  private readonly SCROLL_THRESHOLD = 10; // pixels

  readonly searchDraft = signal('');
  /** DOM id of element to show the 3× blink highlight (#scroll target). */
  readonly searchFlashId = signal<string | null>(null);

  /** Sharing filter: selected sharing type (e.g., 2, 3, 8, etc.) */
  readonly sharingFilter = signal<number | null>(null);

  /** Available sharing options derived from the layout */
  readonly sharingOptions = computed(() => {
    const pg = this.layout();
    if (!pg?.floors?.length) return [];
    const sharingSet = new Set<number>();
    for (const floor of pg.floors) {
      for (const room of floor.rooms) {
        const beds = Math.trunc(Number(room.beds) || 0);
        if (beds > 0) sharingSet.add(beds);
      }
    }
    return Array.from(sharingSet).sort((a, b) => a - b);
  });

  /** Cached map of room bed counts for faster filtering */
  private readonly roomBedCountMap = computed(() => {
    const pg = this.layout();
    if (!pg?.floors?.length) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const floor of pg.floors) {
      const floorNum = Math.trunc(Number(floor.floorNumber));
      for (const room of floor.rooms) {
        const roomNum = Math.trunc(Number(room.roomNumber));
        const beds = Math.trunc(Number(room.beds) || 0);
        const key = `${floorNum}-${roomNum}`;
        map.set(key, beds);
      }
    }
    return map;
  });

  /** Cancels overlapping search highlight timers when a new search runs. */
  private searchHighlightToken = 0;

  readonly todayYyyyMmDd = computed(() => yyyyMmDdFromLocalDate(new Date()));

  tooltipPlacementAboveBed(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return true;
    return (this.seatTooltipVertical().get(key) ?? 'above') === 'above';
  }

  onSeatPointerDown(event: PointerEvent): void {
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.isScrolling = false;
  }

  onSeatPointerMove(event: PointerEvent): void {
    // Only track if pointer has moved significantly
    const deltaX = Math.abs(event.clientX - this.pointerStartX);
    const deltaY = Math.abs(event.clientY - this.pointerStartY);
    
    if (deltaX > this.SCROLL_THRESHOLD || deltaY > this.SCROLL_THRESHOLD) {
      this.isScrolling = true;
    }
  }

  onSeatPointerEnter(event: Event, floor: unknown, room: unknown, bed: unknown): void {
    // Don't open popup on hover/pointer enter - only allow on explicit click
    // This prevents popups from opening during scroll gestures
  }

  onSeatClick(event: Event, floor: unknown, room: unknown, bed: unknown): void {
    // Only proceed if this wasn't a scroll gesture
    if (this.isScrolling) {
      this.isScrolling = false;
      return;
    }

    // Check if mobile and bed is occupied
    if (this.isMobile() && this.isBedOccupied(floor, room, bed)) {
      this.openMobileBedDetails(floor, room, bed);
      return;
    }

    const key = this.bedKey(floor, room, bed);
    if (!key) return;
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const estimateH = Math.min(320, Math.max(180, window.innerHeight * 0.42));
    const spaceAbove = rect.top - margin;
    const spaceBelow = window.innerHeight - rect.bottom - margin;

    let placement: 'above' | 'below' = 'above';
    if (spaceAbove >= estimateH) {
      placement = 'above';
    } else if (spaceBelow >= estimateH) {
      placement = 'below';
    } else {
      placement = spaceBelow >= spaceAbove ? 'below' : 'above';
    }

    this.seatTooltipVertical.update((m) => {
      const next = new Map(m);
      next.set(key, placement);
      return next;
    });
  }

  onSeatPointerLeave(floor: unknown, room: unknown, bed: unknown): void {
    const key = this.bedKey(floor, room, bed);
    if (!key) return;
    this.seatTooltipVertical.update((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }

  bedmapFloorDomId(floorNum: unknown): string {
    return `bedmap-floor-${Math.trunc(Number(floorNum))}`;
  }

  bedmapRoomDomId(floorNum: unknown, roomNum: unknown): string {
    return `bedmap-room-${Math.trunc(Number(floorNum))}-${Math.trunc(Number(roomNum))}`;
  }

  bedmapSeatDomId(floorNum: unknown, roomNum: unknown, bedNum: unknown): string {
    const k = this.bedKey(floorNum, roomNum, bedNum);
    return k ? `bedmap-seat-${k}` : '';
  }

  isSearchFlashing(elId: string): boolean {
    return this.searchFlashId() === elId;
  }

  /** Check if a room matches the selected sharing filter */
  isRoomFiltered(floor: unknown, room: unknown): boolean {
    const filter = this.sharingFilter();
    if (!filter) return false;
    const floorNum = Math.trunc(Number(floor));
    const roomNum = Math.trunc(Number(room));
    const key = `${floorNum}-${roomNum}`;
    return this.roomBedCountMap().get(key) === filter;
  }

  /** Set the sharing filter */
  setSharingFilter(sharing: number | null): void {
    this.sharingFilter.set(sharing);
  }

  /** Handle sharing filter change from dropdown */
  onSharingFilterChange(value: string): void {
    if (value && value.trim()) {
      this.sharingFilter.set(parseInt(value, 10));
      // Scroll to first filtered room after a short delay to let the UI update
      requestAnimationFrame(() => {
        setTimeout(() => this.scrollToFirstFilteredRoom(), 50);
      });
    } else {
      this.sharingFilter.set(null);
    }
  }

  /** Scroll to the first room that matches the sharing filter */
  private scrollToFirstFilteredRoom(): void {
    const filter = this.sharingFilter();
    if (!filter) return;

    const pg = this.layout();
    if (!pg?.floors?.length) return;

    // Find the first room that matches the filter
    for (const floor of pg.floors) {
      const floorNum = Math.trunc(Number(floor.floorNumber));
      for (const room of floor.rooms) {
        const roomNum = Math.trunc(Number(room.roomNumber));
        const beds = Math.trunc(Number(room.beds) || 0);
        if (beds === filter) {
          const elId = this.bedmapRoomDomId(floorNum, roomNum);
          const el = document.getElementById(elId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            return;
          }
        }
      }
    }
  }

  /** Clear the sharing filter */
  clearSharingFilter(): void {
    this.sharingFilter.set(null);
  }

  onSearchInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.searchDraft.set(v);
  }

  runBedMapSearch(): void {
    const pg = this.layout();
    const raw = this.searchDraft().trim();
    if (!pg?.floors?.length) {
      this.toast.error('No layout loaded');
      return;
    }
    if (!raw) {
      return;
    }
    const target = this.parseBedSearchQuery(raw, pg);
    if (!target) {
      this.toast.error(this.i18n.t('members.bedMapSearchNotFound'));
      return;
    }
    let elId: string;
    if (target.kind === 'bed') {
      elId = `bedmap-seat-${this.bedKey(target.floor, target.room, target.bed)}`;
    } else if (target.kind === 'room') {
      elId = this.bedmapRoomDomId(target.floor, target.room);
    } else {
      elId = this.bedmapFloorDomId(target.floor);
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(elId);
      if (!el) {
        this.toast.error(this.i18n.t('members.bedMapSearchNotFound'));
        return;
      }
      this.startSearchFlashAfterScrollSettles(el, elId);
    });
  }

  /** Wait until smooth `scrollIntoView` finishes, then run the 3× blink (see `bedmap-search-blink` CSS). */
  private startSearchFlashAfterScrollSettles(el: HTMLElement, elId: string): void {
    const token = ++this.searchHighlightToken;
    let settled = false;

    const scrollRoots = this.collectScrollEndTargets(el);
    let fallbackTimer = 0;

    const runFlash = (): void => {
      if (settled || token !== this.searchHighlightToken) return;
      settled = true;
      for (const t of scrollRoots) {
        t.removeEventListener('scrollend', runFlash);
      }
      window.clearTimeout(fallbackTimer);
      this.searchFlashId.set(null);
      requestAnimationFrame(() => {
        if (token !== this.searchHighlightToken) return;
        this.searchFlashId.set(elId);
        window.setTimeout(() => {
          if (token === this.searchHighlightToken) this.searchFlashId.set(null);
        }, 1200);
      });
    };

    for (const t of scrollRoots) {
      t.addEventListener('scrollend', runFlash);
    }
    fallbackTimer = window.setTimeout(runFlash, 1500);

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  /** Elements that may emit `scrollend` when `scrollIntoView` runs inside nested modals / panels. */
  private collectScrollEndTargets(el: HTMLElement): EventTarget[] {
    const targets: EventTarget[] = [window];
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const st = getComputedStyle(node);
      const scrollableY = /(auto|scroll)/.test(st.overflowY) || /(auto|scroll)/.test(st.overflow);
      if (scrollableY && node.scrollHeight > node.clientHeight + 1) {
        targets.push(node);
      }
      node = node.parentElement;
    }
    return targets;
  }

  private parseBedSearchQuery(raw: string, layout: PgLayout): BedMapSearchTarget | null {
    const q = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, ' ');
    if (!q) return null;

    let m = q.match(/^(\d+)\D+(\d+)\D+(\d+)$/);
    if (m) {
      const floor = Math.trunc(+m[1]);
      const room = Math.trunc(+m[2]);
      const bed = Math.trunc(+m[3]);
      if (this.roomBedExists(layout, floor, room, bed)) return { kind: 'bed', floor, room, bed };
      return null;
    }

    m = q.match(/^(?:floor|fl|f)\s*(\d+)$/i);
    if (m) {
      const floor = Math.trunc(+m[1]);
      if (this.floorExists(layout, floor)) return { kind: 'floor', floor };
    }

    m = q.match(/^g\s*(\d+)(?:\s+(?:b(?:ed)?\s*)?(\d+))?$/i);
    if (m) {
      const room = Math.trunc(+m[1]);
      const bedPart = m[2] != null ? Math.trunc(+m[2]) : null;
      if (bedPart != null) {
        if (this.roomBedExists(layout, 0, room, bedPart)) return { kind: 'bed', floor: 0, room, bed: bedPart };
        return null;
      }
      if (this.roomExists(layout, 0, room)) return { kind: 'room', floor: 0, room };
    }

    m = q.match(/^(\d{3,})\D+(\d+)$/);
    if (m) {
      const pr = this.parseCompactRoomDigits(m[1]);
      const bed = Math.trunc(+m[2]);
      if (pr && this.roomBedExists(layout, pr.floor, pr.room, bed)) {
        return { kind: 'bed', floor: pr.floor, room: pr.room, bed };
      }
    }

    if (/^\d{3,}$/.test(q)) {
      const pr = this.parseCompactRoomDigits(q);
      if (pr && this.roomExists(layout, pr.floor, pr.room)) {
        return { kind: 'room', floor: pr.floor, room: pr.room };
      }
    }

    if (/^\d{1,2}$/.test(q)) {
      const room = Math.trunc(+q);
      if (this.roomExists(layout, 0, room)) return { kind: 'room', floor: 0, room };
    }

    const hits: { label: string; floor: number; room: number }[] = [];
    for (const fl of layout.floors) {
      for (const rm of fl.rooms) {
        const floor = Math.trunc(Number(fl.floorNumber));
        const room = Math.trunc(Number(rm.roomNumber));
        const label = formatPgRoomLabel(floor, room).toLowerCase();
        hits.push({ label, floor, room });
      }
    }
    hits.sort((a, b) => b.label.length - a.label.length);
    for (const h of hits) {
      if (q === h.label && this.roomExists(layout, h.floor, h.room)) {
        return { kind: 'room', floor: h.floor, room: h.room };
      }
      if (
        (q.startsWith(h.label + ' ') || q.startsWith(h.label + '-') || q.startsWith(h.label + ' b')) &&
        q.length > h.label.length
      ) {
        const rest = q.slice(h.label.length).trim().replace(/^[-/\s]+/, '').replace(/^(?:bed|b)\s*/i, '');
        const bedM = rest.match(/^(\d+)$/);
        if (bedM) {
          const bed = Math.trunc(+bedM[1]);
          if (this.roomBedExists(layout, h.floor, h.room, bed)) {
            return { kind: 'bed', floor: h.floor, room: h.room, bed };
          }
        }
      }
    }

    return null;
  }

  private parseCompactRoomDigits(digits: string): { floor: number; room: number } | null {
    if (digits.length < 3 || !/^\d+$/.test(digits)) return null;
    const room = Math.trunc(parseInt(digits.slice(-2), 10));
    const floor = Math.trunc(parseInt(digits.slice(0, -2), 10));
    if (room <= 0 || floor < 0) return null;
    return { floor, room };
  }

  private floorExists(layout: PgLayout, f: number): boolean {
    const floor = Math.trunc(f);
    return layout.floors.some((fl) => Math.trunc(Number(fl.floorNumber)) === floor);
  }

  private roomExists(layout: PgLayout, f: number, r: number): boolean {
    const floor = Math.trunc(f);
    const room = Math.trunc(r);
    const fl = layout.floors.find((x) => Math.trunc(Number(x.floorNumber)) === floor);
    if (!fl) return false;
    return fl.rooms.some((x) => Math.trunc(Number(x.roomNumber)) === room);
  }

  private roomBedExists(layout: PgLayout, f: number, r: number, b: number): boolean {
    const floor = Math.trunc(f);
    const room = Math.trunc(r);
    const bed = Math.trunc(b);
    const fl = layout.floors.find((x) => Math.trunc(Number(x.floorNumber)) === floor);
    if (!fl) return false;
    const rm = fl.rooms.find((x) => Math.trunc(Number(x.roomNumber)) === room);
    if (!rm) return false;
    const maxBeds = Math.max(1, Math.trunc(Number(rm.beds) || 0));
    return bed >= 1 && bed <= maxBeds;
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  viewMemberDetails(member: Member | null | undefined): void {
    if (!member) return;
    const displayName = this.memberDisplayName(member);
    this.router.navigate(['/members'], {
      queryParams: { search: displayName },
      queryParamsHandling: 'merge',
    });
  }

  getOccupiedMember(floor: unknown, room: unknown, bed: unknown): Member | null {
    const key = this.bedKey(floor, room, bed);
    if (!key) return null;
    return this.occupiedMembersByBed().get(key) ?? null;
  }

  formatRoomNumber(floorNumber: number, roomNumber: number): string {
    return formatPgRoomLabel(floorNumber, roomNumber);
  }

  sharingLabel(beds: unknown): string {
    return sharingLabelForBeds(beds);
  }

  roomRentText(rent: unknown): string {
    const n = Number(rent);
    if (!Number.isFinite(n) || n <= 0) return 'Price not mentioned';
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
  }

  roomHasValidRent(rent: unknown): boolean {
    const n = Number(rent);
    return Number.isFinite(n) && n > 0;
  }

  memberDisplayName(member: Member | null): string {
    if (!member) return 'N/A';
    const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
    return fullName || 'N/A';
  }

  /** Last 10 digits for India (+91) when at least 10 digit chars are present. */
  private mobile10Digits(raw: unknown): string | null {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    const ten = digits.slice(-10);
    return ten.length === 10 ? ten : null;
  }

  telHref(mobile: unknown): string | null {
    const ten = this.mobile10Digits(mobile);
    return ten ? `tel:+91${ten}` : null;
  }

  whatsappHrefMobile(mobileRaw: unknown): string | null {
    const ten = this.mobile10Digits(mobileRaw);
    if (!ten) return null;
    return `https://wa.me/91${ten}?text=${encodeURIComponent('Hi')}`;
  }
  memberConfirmDisplayName(m: Member): string {
    const n = `${m.firstName} ${m.lastName}`.trim();
    return n || this.i18n.t('members.thisMember');
  }

  formatCurrency(value: unknown): string {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatDateTime(value: unknown): string {
    const date = this.toDate(value);
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  formatScheduledVacateDisplay(ymd: string | undefined): string {
    if (!ymd) return '';
    return formatYyyyMmDdAsDdMmYyyy(ymd);
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object' && value && 'toDate' in value) {
      const d = (value as Timestamp).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f < 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }

  isMobile(): boolean {
    return window.innerWidth <= 768;
  }

  openMobileBedDetails(floor: unknown, room: unknown, bed: unknown): void {
    const member = this.getOccupiedMember(floor, room, bed);
    if (!member) return;

    const floorNum = Math.trunc(Number(floor));
    const roomNum = Math.trunc(Number(room));
    const bedNum = Math.trunc(Number(bed));

    // Get total beds for this room
    const pgLayout = this.layout();
    let totalBeds = 1;
    if (pgLayout?.floors) {
      const floor = pgLayout.floors.find(f => Math.trunc(Number(f.floorNumber)) === floorNum);
      if (floor?.rooms) {
        const room = floor.rooms.find(r => Math.trunc(Number(r.roomNumber)) === roomNum);
        if (room?.beds) {
          totalBeds = Math.trunc(Number(room.beds));
        }
      }
    }

    this.mobileBedDetails.set({
      floorNumber: floorNum,
      roomNumber: roomNum,
      bedNumber: bedNum,
      totalBeds,
      member
    });
    this.mobileBedDetailsOpen.set(true);
  }

  onMobileBedDetailsDismiss(): void {
    this.mobileBedDetailsOpen.set(false);
    this.mobileBedDetails.set(null);
  }

  openDeactivateConfirm(m: Member): void {
    this.deactivateMember.set(m);
    this.deactivateOpen.set(true);
  }

  cancelDeactivate(): void {
    if (this.deactivateBusy()) return;
    this.deactivateMember.set(null);
    this.deactivateOpen.set(false);
  }

  onDeactivateModalDismiss(): void {
    this.cancelDeactivate();
  }

  async confirmDeactivate(): Promise<void> {
    const m = this.deactivateMember();
    if (!m || this.deactivateBusy()) return;
    this.deactivateBusy.set(true);
    try {
      await this.membersApi.updateMemberStatus(m.memberId, 'inactive');
      this.toast.success('Member marked as inactive');
      this.deactivateMember.set(null);
      this.deactivateOpen.set(false);
    } catch {
      this.toast.error('Could not update member status');
    } finally {
      this.deactivateBusy.set(false);
    }
  }

  openScheduleModal(m: Member): void {
    this.i18n.lang();
    this.scheduleMember.set(m);
    this.scheduleDateRaw.set(m.scheduledVacateYyyyMmDd?.trim() || '');
    this.scheduleOpen.set(true);
  }

  cancelSchedule(): void {
    if (this.scheduleBusy()) return;
    this.scheduleMember.set(null);
    this.scheduleDateRaw.set('');
    this.scheduleOpen.set(false);
  }

  onScheduleModalDismiss(): void {
    this.cancelSchedule();
  }

  async saveSchedule(): Promise<void> {
    const m = this.scheduleMember();
    if (!m || this.scheduleBusy()) return;
    const ymd = String(this.scheduleDateRaw() || '').trim();
    if (!ymd) {
      this.toast.error('Select a date');
      return;
    }
    if (ymd < this.todayYyyyMmDd()) {
      this.toast.error('Date must be today or later');
      return;
    }
    this.scheduleBusy.set(true);
    try {
      await this.membersApi.setMemberScheduledVacate(m.memberId, ymd);
      this.toast.success('Planned vacate saved');
      this.scheduleMember.set(null);
      this.scheduleDateRaw.set('');
      this.scheduleOpen.set(false);
    } catch {
      this.toast.error('Could not save date');
    } finally {
      this.scheduleBusy.set(false);
    }
  }

  async clearSchedule(): Promise<void> {
    const m = this.scheduleMember();
    if (!m || this.scheduleBusy()) return;
    this.scheduleBusy.set(true);
    try {
      await this.membersApi.setMemberScheduledVacate(m.memberId, null);
      this.toast.success('Planned vacate cleared');
      this.scheduleDateRaw.set('');
      this.scheduleMember.set(null);
      this.scheduleOpen.set(false);
    } catch {
      this.toast.error('Could not clear date');
    } finally {
      this.scheduleBusy.set(false);
    }
  }
}
