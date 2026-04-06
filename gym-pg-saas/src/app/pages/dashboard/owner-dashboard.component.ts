import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Member, SubscriptionType } from '../../core/models/member.model';
import { Payment } from '../../core/models/payment.model';
import { PgFloorLayout, PgLayout } from '../../core/models/pg-layout.model';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../../core/services/member.service';
import { PaymentService } from '../../core/services/payment.service';
import { PgLayoutService } from '../../core/services/pg-layout.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import {
  coerceFirestoreDate,
  dueUiStatus,
  endOfToday,
  isDateInCalendarMonth,
  overdueCalendarDays,
  timestampToDate,
} from '../../core/utils/date.utils';

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule, ModalComponent],
  templateUrl: './owner-dashboard.component.html',
})
export class OwnerDashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  private readonly pgLayoutApi = inject(PgLayoutService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly loading = signal(true);
  readonly setupModalOpen = signal(false);
  readonly bedMapModalOpen = signal(false);
  readonly importModalOpen = signal(false);
  readonly importRows = signal<ImportPreviewRow[]>([]);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importDueDateForAll = this.fb.nonNullable.control(false);
  readonly importDueDate = this.fb.nonNullable.control('');
  readonly pgLayout = signal<PgLayout | null>(null);

  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');
  readonly hasPgLayout = computed(() => {
    if ((this.pgLayout()?.floors?.length ?? 0) > 0) return true;
    return this.formToLayoutFloors().some((f) => f.rooms.length > 0);
  });

  readonly dueLabel = computed(() =>
    this.auth.profile()?.businessType === 'pg' ? 'Rent due' : 'Plan expiry',
  );

  readonly totalMembers = computed(() => this.members().filter((m) => m.status === 'active').length);

  /** From a direct Firestore query — correct even before the live listener first fires (e.g. after login). */
  private readonly monthEarningsVerified = signal<number | null>(null);
  private readonly paymentsListenerReady = signal(false);

  readonly monthEarnings = computed(() => {
    const now = new Date();
    const list = this.payments();
    const verified = this.monthEarningsVerified();
    const fromListener = list.reduce((sum, p) => {
      const d = coerceFirestoreDate(p.date as unknown);
      if (!d || !isDateInCalendarMonth(d, now)) return sum;
      return sum + (Number(p.amount) || 0);
    }, 0);
    if (!this.paymentsListenerReady()) {
      return verified ?? 0;
    }
    // If the snapshot has rows but dates did not parse, keep the server sum from getDocs.
    if (list.length > 0 && fromListener === 0 && verified != null && verified > 0) {
      return verified;
    }
    return fromListener;
  });

  readonly pendingCount = computed(() => {
    const end = endOfToday();
    return this.members().filter(
      (m) => m.status === 'active' && timestampToDate(m.dueDate) && timestampToDate(m.dueDate)! <= end,
    ).length;
  });

  readonly dueTodayList = computed(() => {
    const today = new Date();
    return this.members().filter((m) => {
      const d = timestampToDate(m.dueDate);
      if (!d || m.status !== 'active') return false;
      return dueUiStatus(d) === 'dueToday';
    });
  });

  readonly overdueList = computed(() => {
    return this.members().filter((m) => {
      const d = timestampToDate(m.dueDate);
      if (!d || m.status !== 'active') return false;
      return dueUiStatus(d) === 'overdue';
    });
  });

  readonly partialPendingList = computed(() =>
    this.members().filter((m) => m.status === 'active' && (Number(m.pendingAmount) || 0) > 0),
  );

  readonly totalBeds = computed(() =>
    (this.pgLayout()?.floors ?? []).reduce(
      (sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + (Number(room.beds) || 0), 0),
      0,
    ),
  );

  readonly totalRooms = computed(() =>
    (this.pgLayout()?.floors ?? []).reduce((sum, floor) => sum + floor.rooms.length, 0),
  );

  readonly emptyBeds = computed(() => Math.max(0, this.totalBeds() - this.occupiedBedKeys().size));
  readonly occupiedBedKeys = computed(() => {
    const set = new Set<string>();
    for (const m of this.members()) {
      if (m.status !== 'active') continue;
      const key = this.bedKey(m.floorNumber, m.roomNumber, m.bedNumber);
      if (key) set.add(key);
    }
    return set;
  });
  readonly importValidCount = computed(() => this.importRows().filter((r) => r.valid).length);
  readonly importInvalidCount = computed(() => this.importRows().filter((r) => !r.valid).length);

  readonly setupForm = this.fb.nonNullable.group({
    floorCount: [1, [Validators.required, Validators.min(1), Validators.max(8)]],
    floors: this.fb.array([]),
  });

  private unsubM: (() => void) | null = null;
  private unsubP: (() => void) | null = null;
  private unsubLayout: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.paymentsListenerReady.set(false);
    this.monthEarningsVerified.set(null);
    this.payments.set([]);
    await this.auth.refreshProfile();
    const uid = this.auth.profile()?.ownerId;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    try {
      const sum = await this.paymentsApi.sumPaymentsForCalendarMonth(uid);
      this.monthEarningsVerified.set(sum);
    } catch {
      this.monthEarningsVerified.set(0);
    }
    this.attach(uid);
  }

  ngOnDestroy(): void {
    this.unsubM?.();
    this.unsubP?.();
    this.unsubLayout?.();
  }

  private attach(ownerId: string): void {
    this.unsubM?.();
    this.unsubP?.();
    this.unsubLayout?.();
    this.unsubM = this.membersApi.watchMembersForOwner(ownerId, (list) => {
      this.members.set(list);
      this.loading.set(false);
    });
    this.unsubP = this.paymentsApi.watchPaymentsForOwner(ownerId, (list) => {
      this.payments.set(list);
      this.paymentsListenerReady.set(true);
    });
    this.unsubLayout = this.pgLayoutApi.watchLayout(ownerId, (layout) => {
      this.pgLayout.set(layout);
    });
  }

  overdueByLine(m: Member): string {
    const d = coerceFirestoreDate(m.dueDate as unknown) ?? timestampToDate(m.dueDate);
    if (!d) return 'Overdue';
    const n = overdueCalendarDays(d);
    return n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`;
  }

  get floorGroups(): FormArray {
    return this.setupForm.controls.floors as FormArray;
  }

  roomGroupsAt(floorIndex: number): FormArray {
    return this.floorGroups.at(floorIndex).get('rooms') as FormArray;
  }

  openSetupModal(): void {
    const existing = this.pgLayout();
    if (existing?.floors?.length) {
      this.loadLayoutIntoForm(existing);
    } else {
      this.rebuildFloors(1);
    }
    this.setupModalOpen.set(true);
  }

  closeSetupModal(): void {
    this.setupModalOpen.set(false);
  }

  openBedMap(): void {
    if (!this.hasPgLayout()) return;
    this.bedMapModalOpen.set(true);
  }

  closeBedMap(): void {
    this.bedMapModalOpen.set(false);
  }

  openImportModal(): void {
    this.importRows.set([]);
    this.importFileName.set('');
    this.importDueDateForAll.setValue(false);
    this.importDueDate.setValue('');
    this.importModalOpen.set(true);
  }

  closeImportModal(): void {
    this.importModalOpen.set(false);
  }

  downloadSampleCsv(): void {
    const sample = [
      'name,mobile,plan,dueDate,subscriptionType,floor,room,bed',
      'Ravi Kumar,9876543210,2500,2026-04-30,monthly,1,101,1',
      'Anita Sharma,9988776655,3200,2026-05-15,quarterly,,,',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'members-import-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    try {
      const text = await file.text();
      this.parseImportCsv(text);
    } catch {
      this.toast.error('Could not read CSV file');
    } finally {
      input.value = '';
    }
  }

  private parseImportCsv(text: string): void {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      this.importRows.set([]);
      this.toast.error('CSV is empty');
      return;
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = {
      name: headers.indexOf('name'),
      mobile: headers.indexOf('mobile'),
      plan: headers.indexOf('plan'),
      dueDate: headers.indexOf('duedate'),
      subscriptionType: headers.indexOf('subscriptiontype'),
      floor: headers.indexOf('floor'),
      room: headers.indexOf('room'),
      bed: headers.indexOf('bed'),
    };
    if (idx.name < 0 || idx.plan < 0 || idx.dueDate < 0 || idx.subscriptionType < 0) {
      this.importRows.set([]);
      this.toast.error('CSV headers missing. Use sample format.');
      return;
    }

    const existingKeys = new Set<string>();
    for (const m of this.members()) {
      existingKeys.add(this.memberIdentityKey(m.firstName, m.lastName || '', m.mobile || '', m.floorNumber || '', m.roomNumber || '', m.bedNumber || ''));
    }
    const fileKeys = new Set<string>();
    const rows: ImportPreviewRow[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cols = this.parseCsvLine(lines[i]);
      const rawName = this.readCol(cols, idx.name);
      const [firstName, ...lastParts] = rawName.trim().split(/\s+/);
      const lastName = lastParts.join(' ');
      const mobile = this.readCol(cols, idx.mobile).replace(/\D/g, '');
      const planText = this.readCol(cols, idx.plan);
      const dueDateText = this.readCol(cols, idx.dueDate);
      const subText = this.readCol(cols, idx.subscriptionType).toLowerCase();
      const floor = this.readCol(cols, idx.floor);
      const room = this.readCol(cols, idx.room);
      const bed = this.readCol(cols, idx.bed);

      const errors: string[] = [];
      if (!firstName) errors.push('Name is required');
      const amount = Number(planText);
      if (!Number.isFinite(amount) || amount <= 0) errors.push('Plan should be a positive number');
      const subscriptionType = (subText || 'monthly') as SubscriptionType;
      if (!['monthly', 'quarterly', 'yearly'].includes(subscriptionType)) {
        errors.push('subscriptionType should be monthly/quarterly/yearly');
      }
      const dueDate = this.parseDateInput(dueDateText);
      if (!dueDate) errors.push('dueDate should be YYYY-MM-DD');
      if (mobile && mobile.length !== 10) errors.push('Mobile should be 10 digits');

      const key = this.memberIdentityKey(firstName, lastName, mobile, floor, room, bed);
      if (existingKeys.has(key)) errors.push('Member details already exist');
      if (fileKeys.has(key)) errors.push('Duplicate row in file');
      fileKeys.add(key);

      const assignedBed = this.resolveBedForImport(floor, room, bed);
      if (assignedBed.error) errors.push(assignedBed.error);

      rows.push({
        rowNo: i + 1,
        valid: errors.length === 0,
        errors,
        firstName,
        lastName,
        mobile,
        amount: Number.isFinite(amount) ? amount : 0,
        dueDate: dueDateText,
        subscriptionType,
        floorNumber: assignedBed.floorNumber,
        roomNumber: assignedBed.roomNumber,
        bedNumber: assignedBed.bedNumber,
      });
    }

    this.importRows.set(rows);
  }

  async importValidMembers(): Promise<void> {
    const owner = this.auth.profile();
    if (!owner?.ownerId) return;
    const rows = this.importRows();
    const dueForAll = this.importDueDateForAll.value ? this.parseDateInput(this.importDueDate.value) : null;
    if (this.importDueDateForAll.value && !dueForAll) {
      this.toast.error('Please select a valid due date for all');
      return;
    }
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) {
      this.toast.error('No valid rows to import');
      return;
    }
    this.importBusy.set(true);
    let imported = 0;
    for (const row of validRows) {
      const due = dueForAll || this.parseDateInput(row.dueDate);
      if (!due) continue;
      const join = new Date(due);
      join.setMonth(join.getMonth() - 1);
      try {
        await this.membersApi.addMember({
          firstName: row.firstName,
          lastName: row.lastName || undefined,
          mobile: row.mobile || undefined,
          floorNumber: row.floorNumber || '',
          roomNumber: row.roomNumber || '',
          bedNumber: row.bedNumber || '',
          joinDate: join,
          dueDate: due,
          amount: row.amount,
          status: 'active',
          subscriptionType: owner.businessType === 'gym' ? row.subscriptionType : 'monthly',
        });
        imported += 1;
      } catch {
        // Skip failed row, continue import.
      }
    }
    this.importBusy.set(false);
    this.toast.success(`Imported ${imported} members. Skipped ${validRows.length - imported}.`);
    this.closeImportModal();
  }

  onFloorCountChange(raw: unknown): void {
    const count = this.coerceCount(raw, 1, 8);
    this.setupForm.controls.floorCount.setValue(count);
    this.rebuildFloors(count);
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
    while (rooms.length > count) {
      rooms.removeAt(rooms.length - 1);
    }
    this.renumberRooms(floorIndex);
  }

  async saveDraft(stayOpen = true): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) return;
    const floors = this.formToLayoutFloors();
    try {
      await this.pgLayoutApi.saveLayout(ownerId, floors);
      // Optimistic local update so dashboard actions enable immediately.
      this.pgLayout.set({ ownerId, floors });
      this.toast.success('Layout draft saved');
      if (!stayOpen) this.closeSetupModal();
    } catch {
      this.toast.error('Could not save layout draft');
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

  private renumberRooms(floorIndex: number): void {
    const rooms = this.roomGroupsAt(floorIndex);
    for (let i = 0; i < rooms.length; i += 1) {
      rooms.at(i).get('roomNumber')?.setValue(i + 1);
    }
  }

  private formToLayoutFloors(): PgFloorLayout[] {
    return this.floorGroups.controls.map((floorCtrl, floorIdx) => {
      const rooms = (floorCtrl.get('rooms') as FormArray).controls.map((roomCtrl, roomIdx) => ({
        roomNumber: roomIdx + 1,
        beds: Math.max(1, Number(roomCtrl.get('beds')?.value) || 1),
      }));
      return {
        floorNumber: floorIdx + 1,
        rooms,
      };
    });
  }

  private coerceCount(v: unknown, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  isBedOccupied(floor: unknown, room: unknown, bed: unknown): boolean {
    const key = this.bedKey(floor, room, bed);
    if (!key) return false;
    return this.occupiedBedKeys().has(key);
  }

  private bedKey(floor: unknown, room: unknown, bed: unknown): string {
    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b)) return '';
    if (f <= 0 || r <= 0 || b <= 0) return '';
    return `${Math.trunc(f)}-${Math.trunc(r)}-${Math.trunc(b)}`;
  }

  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  private readCol(cols: string[], index: number): string {
    if (index < 0 || index >= cols.length) return '';
    return String(cols[index] || '').trim();
  }

  private parseDateInput(v: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return dt;
  }

  private memberIdentityKey(
    firstName: string,
    lastName: string,
    mobile: string,
    floorNumber: string,
    roomNumber: string,
    bedNumber: string,
  ): string {
    return [
      firstName.trim().toLowerCase(),
      lastName.trim().toLowerCase(),
      (mobile || '').replace(/\D/g, ''),
      (floorNumber || '').trim().toLowerCase(),
      (roomNumber || '').trim().toLowerCase(),
      (bedNumber || '').trim().toLowerCase(),
    ].join('|');
  }

  private resolveBedForImport(
    floorRaw: string,
    roomRaw: string,
    bedRaw: string,
  ): { floorNumber: string; roomNumber: string; bedNumber: string; error?: string } {
    const floor = String(floorRaw || '').trim();
    const room = String(roomRaw || '').trim();
    const bed = String(bedRaw || '').trim();
    if (!this.isPg()) return { floorNumber: '', roomNumber: '', bedNumber: '' };
    if (!floor || !room || !bed) return { floorNumber: '', roomNumber: '', bedNumber: '' };

    const f = Number(floor);
    const r = Number(room);
    const b = Number(bed);
    if (!Number.isFinite(f) || !Number.isFinite(r) || !Number.isFinite(b) || f <= 0 || r <= 0 || b <= 0) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Invalid floor/room/bed values' };
    }
    const fl = (this.pgLayout()?.floors || []).find((x) => Number(x.floorNumber) === Math.trunc(f));
    const rm = fl?.rooms.find((x) => Number(x.roomNumber) === Math.trunc(r));
    if (!fl || !rm) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Floor/room not found in layout' };
    }
    if (Math.trunc(b) > Number(rm.beds || 0)) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Bed not found in layout' };
    }
    if (this.isBedOccupied(f, r, b)) {
      return { floorNumber: '', roomNumber: '', bedNumber: '', error: 'Bed already occupied' };
    }
    return { floorNumber: String(Math.trunc(f)), roomNumber: String(Math.trunc(r)), bedNumber: String(Math.trunc(b)) };
  }
}

type ImportPreviewRow = {
  rowNo: number;
  valid: boolean;
  errors: string[];
  firstName: string;
  lastName: string;
  mobile: string;
  amount: number;
  dueDate: string;
  subscriptionType: SubscriptionType;
  floorNumber: string;
  roomNumber: string;
  bedNumber: string;
};
