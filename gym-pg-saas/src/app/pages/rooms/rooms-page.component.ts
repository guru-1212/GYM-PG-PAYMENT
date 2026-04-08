import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Member } from '../../core/models/member.model';
import { PgFloorLayout, PgLayout } from '../../core/models/pg-layout.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, TranslatePipe],
  templateUrl: './rooms-page.component.html',
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

  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');
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

  /**
   * Validation: Check if proposed beds >= occupied beds
   */
  readonly isValidCapacity = computed(() => {
    return this.proposedTotalBeds() >= this.occupiedBedCount();
  });

  /**
   * Get validation error message
   */
  readonly getValidationError = computed(() => {
    if (this.isValidCapacity()) return null;
    const occupied = this.occupiedBedCount();
    const proposed = this.proposedTotalBeds();
    return `You have ${occupied} occupied bed${occupied !== 1 ? 's' : ''}. Cannot reduce capacity to ${proposed} bed${proposed !== 1 ? 's' : ''}. Please move or remove tenants first.`;
  });

  readonly setupForm = this.fb.nonNullable.group({
    floorCount: [1, [Validators.required, Validators.min(1), Validators.max(8)]],
    floors: this.fb.array([]),
  });

  private unsubLayout: (() => void) | null = null;
  private unsubMembers: (() => void) | null = null;

  ngOnInit(): void {
    const ownerId = this.auth.profile()?.ownerId;
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
    const count = this.coerceCount(raw, 1, 8);
    this.setupForm.controls.floorCount.setValue(count);
    this.rebuildFloors(count);
    this.validationError.set(null); // Clear error on user change
  }

  onRoomCountChange(floorIndex: number, raw: unknown): void {
    const rooms = this.roomGroupsAt(floorIndex);
    const count = this.coerceCount(raw, 1, 100);
    const floorGroup = this.floorGroups.at(floorIndex);
    floorGroup.get('roomCount')?.setValue(count);
    while (rooms.length < count) {
      rooms.push(
        this.fb.nonNullable.group({
          roomNumber: rooms.length + 1,
          beds: [1, [Validators.required, Validators.min(1)]],
        }),
      );
    }
    while (rooms.length > count) rooms.removeAt(rooms.length - 1);
    for (let i = 0; i < rooms.length; i += 1) rooms.at(i).get('roomNumber')?.setValue(i + 1);
    this.validationError.set(null); // Clear error on user change
  }

  async saveDraft(stayOpen = true): Promise<void> {
    // Validate capacity before saving
    if (!this.isValidCapacity()) {
      const error = this.getValidationError();
      this.validationError.set(error);
      this.toast.error(error || 'Invalid bed capacity');
      return;
    }

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
    const floorCount = Math.min(8, Math.max(1, layout.floors.length || 1));
    this.setupForm.controls.floorCount.setValue(floorCount);
    this.floorGroups.clear();
    for (let i = 0; i < floorCount; i += 1) {
      const floor = layout.floors[i] ?? { floorNumber: i + 1, rooms: [{ roomNumber: 1, beds: 1 }] };
      const rooms = this.fb.array(
        (floor.rooms.length ? floor.rooms : [{ roomNumber: 1, beds: 1 }]).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: i + 1,
          roomCount: rooms.length,
          rooms,
        }),
      );
    }
  }

  private rebuildFloors(targetCount: number): void {
    const current = this.formToLayoutFloors();
    this.floorGroups.clear();
    for (let i = 0; i < targetCount; i += 1) {
      const floor = current[i] ?? { floorNumber: i + 1, rooms: [{ roomNumber: 1, beds: 1 }] };
      const rooms = this.fb.array(
        (floor.rooms.length ? floor.rooms : [{ roomNumber: 1, beds: 1 }]).map((room, idx) =>
          this.fb.nonNullable.group({
            roomNumber: idx + 1,
            beds: [Math.max(1, Number(room.beds) || 1), [Validators.required, Validators.min(1)]],
          }),
        ),
      );
      this.floorGroups.push(
        this.fb.nonNullable.group({
          floorNumber: i + 1,
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
      }));
      return { floorNumber: floorIdx + 1, rooms };
    });
  }

  private coerceCount(v: unknown, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f <= 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }

  formatRoomNumber(floorNumber: number, roomNumber: number): string {
    return `${floorNumber}${roomNumber.toString().padStart(2, '0')}`;
  }
}
