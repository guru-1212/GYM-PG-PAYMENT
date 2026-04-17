import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { Member } from '../../core/models/member.model';
import { PgFloorLayout, PgLayout } from '../../core/models/pg-layout.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import { formatPgRoomLabel, sharingLabelForBeds } from '../../core/utils/pg-layout-display.utils';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, TranslatePipe],
  templateUrl: './rooms-page.component.html',
  styles: [`
    input[type='number']::-webkit-outer-spin-button,
    input[type='number']::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    input[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
    }

    /* Seat tooltip: avoid clipping when centered popover overflows narrow grid cells */
    .seat-tooltip-panel {
      width: min(16rem, calc(100vw - 2rem));
      max-width: min(16rem, calc(100vw - 2rem));
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

    .seat-tooltip-arrow-left {
      left: 1.25rem;
      right: auto;
      transform: translate(-50%, -50%) rotate(45deg);
    }

    .seat-tooltip-arrow-center {
      left: 50%;
      right: auto;
      transform: translate(-50%, -50%) rotate(45deg);
    }

    .seat-tooltip-arrow-right {
      left: auto;
      right: 1.25rem;
      transform: translate(50%, -50%) rotate(45deg);
    }
  `],
})
export class RoomsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly membersApi = inject(MemberService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly pgLayout = signal<PgLayout | null>(null);
  readonly members = signal<Member[]>([]);
  readonly setupModalOpen = signal(false);
  readonly validationError = signal<string | null>(null);

  readonly isPg = computed(() => this.auth.currentBusinessType() === 'pg');
  readonly hasLayout = computed(() => (this.pgLayout()?.floors?.length ?? 0) > 0);
  readonly totalRooms = computed(() => (this.pgLayout()?.floors ?? []).reduce((s, f) => s + f.rooms.length, 0));
  readonly totalBeds = computed(() =>
    (this.pgLayout()?.floors ?? []).reduce(
      (sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + (Number(room.beds) || 0), 0),
      0,
    ),
  );
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

  readonly occupiedBedCount = computed(() => this.occupiedBedKeys().size);

  /**
   * Calculate proposed total beds from current form state
   */
  readonly proposedTotalBeds = computed(() => {
    let total = 0;
    try {
      const floors = this.formToLayoutFloors();
      for (const floor of floors) {
        for (const room of floor.rooms) {
          total += Number(room.beds) || 0;
        }
      }
    } catch {
      // If form is invalid, return current total
      return this.totalBeds();
    }
    return total;
  });

  readonly setupForm = this.fb.nonNullable.group({
    floorCount: [1, [Validators.required, Validators.min(1)]],
    floors: this.fb.array([]),
  });

  private unsubLayout: (() => void) | null = null;
  private unsubMembers: (() => void) | null = null;

  ngOnInit(): void {
    const ownerId = this.auth.currentOwnerId();
    if (!ownerId) return;
    this.unsubLayout = this.pgLayoutApi.watchLayout(ownerId, (layout) => this.pgLayout.set(layout));
    this.unsubMembers = this.membersApi.watchMembersForOwner(ownerId, (list) => this.members.set(list));
  }

  ngOnDestroy(): void {
    this.unsubLayout?.();
    this.unsubMembers?.();
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  get floorGroups(): FormArray {
    return this.setupForm.controls.floors as FormArray;
  }

  roomGroupsAt(floorIndex: number): FormArray {
    return this.floorGroups.at(floorIndex).get('rooms') as FormArray;
  }

  openSetup(): void {
    const existing = this.pgLayout();
    if (existing?.floors?.length) this.loadLayoutIntoForm(existing);
    else this.rebuildFloors(1);
    this.validationError.set(null);
    this.setupModalOpen.set(true);
  }

  closeSetup(): void {
    this.validationError.set(null);
    this.setupModalOpen.set(false);
  }

  onFloorCountChange(raw: unknown): void {
    const current = this.floorGroups.length || 1;
    const count = this.coerceCount(raw, 1, 500);
    if (count < current) {
      const floors = this.formToLayoutFloors();
      const firstRemoved = Number(floors[count]?.floorNumber);
      if (Number.isFinite(firstRemoved) && this.hasAssignedOnOrAboveFloor(firstRemoved)) {
        this.setupForm.controls.floorCount.setValue(current);
        this.validationError.set('Cannot reduce floors: assigned seats exist on removed floor(s).');
        return;
      }
    }
    this.setupForm.controls.floorCount.setValue(count, { emitEvent: false });
    this.rebuildFloors(count);
    this.validationError.set(null);
  }

  onRoomCountChange(floorIndex: number, raw: unknown): void {
    const rooms = this.roomGroupsAt(floorIndex);
    const count = this.coerceCount(raw, 0, 500);
    const floorNumber = this.floorNumberAtFormIndex(floorIndex);
    if (count < rooms.length && this.hasAssignedOnOrAboveRoom(floorNumber, count + 1)) {
      this.validationError.set(`Cannot reduce rooms on floor ${floorNumber}: assigned seats exist in removed room(s).`);
      const floorGroup = this.floorGroups.at(floorIndex);
      floorGroup.get('roomCount')?.setValue(rooms.length, { emitEvent: false });
      return;
    }
    const floorGroup = this.floorGroups.at(floorIndex);
    floorGroup.get('roomCount')?.setValue(count, { emitEvent: false });
    while (rooms.length < count) {
      rooms.push(
        this.fb.nonNullable.group({
          roomNumber: rooms.length + 1,
          beds: [1, [Validators.required, Validators.min(1)]],
          rent: [null as number | null, [Validators.min(1)]],
        }),
      );
    }
    while (rooms.length > count) rooms.removeAt(rooms.length - 1);
    for (let i = 0; i < rooms.length; i += 1) rooms.at(i).get('roomNumber')?.setValue(i + 1);
    this.validationError.set(null);
  }

  onBedsCountChange(floorIndex: number, roomIndex: number, raw: unknown): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const currentBeds = Math.max(1, Number(room.get('beds')?.value) || 1);
    const nextBeds = this.coerceCount(raw, 1, 500);
    const floorNumber = this.floorNumberAtFormIndex(floorIndex);
    const roomNumber = roomIndex + 1;
    if (nextBeds < currentBeds && this.hasAssignedOnOrAboveBed(floorNumber, roomNumber, nextBeds + 1)) {
      room.get('beds')?.setValue(currentBeds, { emitEvent: false });
      this.validationError.set(
        `Cannot reduce beds in room ${this.formatRoomNumber(floorNumber, roomNumber)}: assigned seats exist in removed bed(s).`,
      );
      return;
    }
    room.get('beds')?.setValue(nextBeds, { emitEvent: false });
    this.validationError.set(null);
  }

  incrementFloorCount(): void {
    this.onFloorCountChange((this.floorGroups.length || 1) + 1);
  }

  decrementFloorCount(): void {
    this.onFloorCountChange((this.floorGroups.length || 1) - 1);
  }

  incrementRoomCount(floorIndex: number): void {
    this.onRoomCountChange(floorIndex, this.roomGroupsAt(floorIndex).length + 1);
  }

  decrementRoomCount(floorIndex: number): void {
    this.onRoomCountChange(floorIndex, this.roomGroupsAt(floorIndex).length - 1);
  }

  incrementBedsCount(floorIndex: number, roomIndex: number): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const current = Math.max(1, Number(room.get('beds')?.value) || 1);
    this.onBedsCountChange(floorIndex, roomIndex, current + 1);
  }

  decrementBedsCount(floorIndex: number, roomIndex: number): void {
    const room = this.roomGroupsAt(floorIndex).at(roomIndex);
    const current = Math.max(1, Number(room.get('beds')?.value) || 1);
    this.onBedsCountChange(floorIndex, roomIndex, current - 1);
  }

  async saveDraft(stayOpen = true): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) return;
    const floors = this.formToLayoutFloors();
    try {
      await this.pgLayoutApi.saveLayout(ownerId, floors);
      this.pgLayout.set({ ownerId, floors });
      this.validationError.set(null);
      this.toast.success('Layout saved successfully');
      if (!stayOpen) this.closeSetup();
    } catch {
      this.toast.error('Could not save layout');
    }
  }

  private loadLayoutIntoForm(layout: PgLayout): void {
    const floorCount = Math.max(1, layout.floors.length || 1);
    this.setupForm.controls.floorCount.setValue(floorCount);
    this.floorGroups.clear();
    for (let i = 0; i < floorCount; i += 1) {
      const floor = layout.floors[i] ?? { floorNumber: i + 1, rooms: [] };
      const stored = Math.trunc(Number(floor.floorNumber));
      const floorNumber = Number.isFinite(stored) ? stored : i + 1;
      const rooms = this.fb.array(
        (floor.rooms ?? []).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
            rent: [Number(room.rent) > 0 ? Math.round(Number(room.rent)) : null, [Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber,
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private defaultFloorNumberForIndex(i: number, current: PgFloorLayout[]): number {
    if (i < current.length) {
      const n = Math.trunc(Number(current[i].floorNumber));
      return Number.isFinite(n) ? n : i;
    }
    let maxF = -Infinity;
    for (const fl of current) {
      const n = Math.trunc(Number(fl.floorNumber));
      if (Number.isFinite(n) && n > maxF) maxF = n;
    }
    if (!Number.isFinite(maxF)) return i;
    return maxF + 1 + (i - current.length);
  }

  private rebuildFloors(targetCount: number): void {
    const current = this.formToLayoutFloors();
    this.floorGroups.clear();
    for (let i = 0; i < targetCount; i += 1) {
      const floor: PgFloorLayout =
        current[i] ??
        ({
          floorNumber: this.defaultFloorNumberForIndex(i, current),
          rooms: [],
        } as PgFloorLayout);
      const rooms = this.fb.array(
        (floor.rooms ?? []).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
            rent: [Number(room.rent) > 0 ? Math.round(Number(room.rent)) : null, [Validators.min(1)]],
          }),
        ),
      );
      const fn = Math.trunc(Number(floor.floorNumber));
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: Number.isFinite(fn) ? fn : this.defaultFloorNumberForIndex(i, current),
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private formToLayoutFloors(): PgFloorLayout[] {
    return this.floorGroups.controls.map((floorCtrl, floorIdx) => {
      const rooms = (floorCtrl.get('rooms') as FormArray).controls.map((roomCtrl, roomIdx) => ({
        roomNumber: roomIdx + 1,
        beds: Math.max(1, Number(roomCtrl.get('beds')?.value) || 1),
        rent: Number(roomCtrl.get('rent')?.value) > 0 ? Math.round(Number(roomCtrl.get('rent')?.value)) : undefined,
      }));
      const fromCtrl = Math.trunc(Number(floorCtrl.get('floorNumber')?.value));
      const floorNumber = Number.isFinite(fromCtrl) ? fromCtrl : floorIdx;
      return { floorNumber, rooms };
    });
  }

  floorNumberAtFormIndex(floorIndex: number): number {
    const raw = this.floorGroups.at(floorIndex)?.get('floorNumber')?.value;
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : floorIndex;
  }

  private coerceCount(v: unknown, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  private hasAssignedOnOrAboveFloor(startFloorNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      if (!Number.isFinite(floor)) continue;
      if (floor >= startFloorNumber) return true;
    }
    return false;
  }

  private hasAssignedOnOrAboveRoom(floorNumber: number, startRoomNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      const room = Number(m.roomNumber);
      if (!Number.isFinite(floor) || !Number.isFinite(room)) continue;
      if (floor === floorNumber && room >= startRoomNumber) return true;
    }
    return false;
  }

  private hasAssignedOnOrAboveBed(floorNumber: number, roomNumber: number, startBedNumber: number): boolean {
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const floor = Number(m.floorNumber);
      const room = Number(m.roomNumber);
      const bed = Number(m.bedNumber);
      if (!Number.isFinite(floor) || !Number.isFinite(room) || !Number.isFinite(bed)) continue;
      if (floor === floorNumber && room === roomNumber && bed >= startBedNumber) return true;
    }
    return false;
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f < 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
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
    return this.formatCurrency(n);
  }

  getOccupiedMember(floor: unknown, room: unknown, bed: unknown): Member | null {
    const key = this.bedKey(floor, room, bed);
    if (!key) return null;
    return this.occupiedMembersByBed().get(key) ?? null;
  }

  memberDisplayName(member: Member | null): string {
    if (!member) return 'N/A';
    const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
    return fullName || 'N/A';
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
}
