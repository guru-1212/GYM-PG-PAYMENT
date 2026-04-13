import { Injectable, inject } from '@angular/core';
import type { DocumentReference } from 'firebase/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { PgFloorLayout, PgLayout } from '../models/pg-layout.model';
import { FirebaseAppService } from './firebase-app.service';

/** Firestore batch write limit; reserve one op for the layout doc. */
const LEGACY_MIGRATE_MAX_MEMBER_OPS = 498;

@Injectable({ providedIn: 'root' })
export class PgLayoutService {
  private readonly fb = inject(FirebaseAppService);
  /** One in-flight legacy (1-based → 0-based) migration per owner. */
  private readonly legacyFloorMigrate = new Map<string, Promise<void>>();

  watchLayout(ownerId: string, callback: (layout: PgLayout | null) => void): Unsubscribe {
    const ref = doc(this.fb.db, 'pgLayouts', ownerId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      const floors = this.normalizeFloors(raw['floors']);
      if (floors.length && this.isLegacyContiguousOneBased(floors)) {
        this.ensureLegacyFloorMigration(ownerId, floors);
      }
      callback({
        ownerId,
        floors,
        updatedAt: raw['updatedAt'],
      });
    });
  }

  async saveLayout(ownerId: string, floors: PgFloorLayout[]): Promise<void> {
    const ref = doc(this.fb.db, 'pgLayouts', ownerId);
    const sanitizedFloors = this.sanitizeFloorsForSave(floors);
    await setDoc(
      ref,
      {
        ownerId,
        floors: sanitizedFloors,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  /**
   * Extends pgLayouts so each (floor, room) exists with at least `minBeds` beds.
   * Used before bulk member import so the dashboard seat map and Rooms page stay in sync.
   */
  async ensureLayoutSeatsForImport(
    ownerId: string,
    needs: { floorNumber: number; roomNumber: number; minBeds: number }[],
  ): Promise<void> {
    if (!needs.length) return;
    const ref = doc(this.fb.db, 'pgLayouts', ownerId);
    const snap = await getDoc(ref);
    const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const floors: PgFloorLayout[] = this.normalizeFloors(raw['floors']).map((fl) => ({
      floorNumber: Math.trunc(Number(fl.floorNumber)),
      rooms: fl.rooms.map((rm) => ({
        roomNumber: Math.trunc(Number(rm.roomNumber)),
        beds: Math.max(1, Math.trunc(Number(rm.beds) || 1)),
          rent: Number(rm.rent) > 0 ? Math.round(Number(rm.rent)) : undefined,
      })),
    }));

    const floorByNum = (f: number) => floors.find((x) => Math.trunc(Number(x.floorNumber)) === f);
    for (const n of needs) {
      const f = Math.trunc(Number(n.floorNumber));
      const r = Math.trunc(Number(n.roomNumber));
      const minBeds = Math.max(1, Math.trunc(Number(n.minBeds)));
      if (!Number.isFinite(f) || !Number.isFinite(r) || r < 1) continue;
      let floorObj = floorByNum(f);
      if (!floorObj) {
        floorObj = { floorNumber: f, rooms: [] };
        floors.push(floorObj);
      }
      const rooms = floorObj.rooms;
      while (rooms.length < r) {
        const next = rooms.length + 1;
        rooms.push({ roomNumber: next, beds: 1 });
      }
      const roomObj = rooms[r - 1];
      if (roomObj) {
        roomObj.roomNumber = r;
        roomObj.beds = Math.max(Math.max(1, Math.trunc(Number(roomObj.beds) || 1)), minBeds);
      }
    }
    floors.sort((a, b) => Math.trunc(Number(a.floorNumber)) - Math.trunc(Number(b.floorNumber)));
    await this.saveLayout(ownerId, floors);
  }

  private normalizeFloors(raw: unknown): PgFloorLayout[] {
    if (!Array.isArray(raw)) return [];
    const floors: PgFloorLayout[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const floor = raw[i] as Record<string, unknown>;
      const rawFn = floor['floorNumber'];
      let floorNumber: number;
      if (rawFn === undefined || rawFn === null || rawFn === '') {
        floorNumber = i + 1;
      } else {
        const n = Number(rawFn);
        floorNumber = Number.isFinite(n) ? Math.trunc(n) : i + 1;
      }
      const roomsRaw = Array.isArray(floor['rooms']) ? floor['rooms'] : [];
      const rooms = roomsRaw.map((r, idx) => {
        const row = r as Record<string, unknown>;
        const rentRaw = Number(row['rent']);
        return {
          roomNumber: Number(row['roomNumber']) || idx + 1,
          beds: Math.max(1, Number(row['beds']) || 1),
          rent: Number.isFinite(rentRaw) && rentRaw > 0 ? Math.round(rentRaw) : undefined,
        };
      });
      floors.push({ floorNumber, rooms });
    }
    return floors;
  }

  /**
   * Firestore rejects `undefined` fields.
   * Keep rent only when valid positive number; otherwise omit the key.
   */
  private sanitizeFloorsForSave(floors: PgFloorLayout[]): PgFloorLayout[] {
    return (floors ?? []).map((floor) => ({
      floorNumber: Math.trunc(Number(floor.floorNumber)),
      rooms: (floor.rooms ?? []).map((room, idx) => {
        const normalized = {
          roomNumber: Math.max(1, Math.trunc(Number(room.roomNumber) || idx + 1)),
          beds: Math.max(1, Math.trunc(Number(room.beds) || 1)),
        };
        const rent = Number(room.rent);
        if (Number.isFinite(rent) && rent > 0) {
          return { ...normalized, rent: Math.round(rent) };
        }
        return normalized;
      }),
    }));
  }

  /**
   * Old layouts used lowest floor = 1 (101, 102…). New model uses 0 = ground (G1, G2…).
   * Detect strict 1..N contiguous floor numbers with no 0, then migrate layout + member floors in one batch.
   */
  private isLegacyContiguousOneBased(floors: PgFloorLayout[]): boolean {
    if (!floors.length) return false;
    const nums = floors.map((f) => Math.trunc(Number(f.floorNumber))).sort((a, b) => a - b);
    if (nums.some((n) => !Number.isFinite(n))) return false;
    if (nums.includes(0) || nums[0] !== 1) return false;
    for (let i = 1; i < nums.length; i += 1) {
      if (nums[i] !== nums[i - 1] + 1) return false;
    }
    return true;
  }

  private ensureLegacyFloorMigration(ownerId: string, floors: PgFloorLayout[]): void {
    if (this.legacyFloorMigrate.has(ownerId)) return;
    const p = this.runLegacyOneBasedToZeroMigration(ownerId, floors)
      .catch((e) => console.error('[PgLayoutService] legacy floor migration failed', e))
      .finally(() => this.legacyFloorMigrate.delete(ownerId));
    this.legacyFloorMigrate.set(ownerId, p);
  }

  private async runLegacyOneBasedToZeroMigration(ownerId: string, floors: PgFloorLayout[]): Promise<void> {
    const db = this.fb.db;
    const newFloors: PgFloorLayout[] = floors.map((f) => ({
      ...f,
      floorNumber: Math.trunc(Number(f.floorNumber)) - 1,
    }));
    const membersSnap = await getDocs(query(collection(db, 'members'), where('ownerId', '==', ownerId)));
    const updates: { ref: DocumentReference; nextFloor: number }[] = [];
    membersSnap.forEach((d) => {
      const f = Number((d.data() as Record<string, unknown>)['floorNumber']);
      if (Number.isFinite(f) && f >= 1) {
        updates.push({ ref: d.ref, nextFloor: Math.trunc(f) - 1 });
      }
    });
    if (updates.length > LEGACY_MIGRATE_MAX_MEMBER_OPS) {
      console.error(
        `[PgLayoutService] Legacy floor migration skipped: ${updates.length} member updates exceed safe batch size (${LEGACY_MIGRATE_MAX_MEMBER_OPS}).`,
      );
      return;
    }
    const batch = writeBatch(db);
    for (const u of updates) {
      batch.update(u.ref, { floorNumber: String(u.nextFloor) });
    }
    const layoutRef = doc(db, 'pgLayouts', ownerId);
    batch.set(
      layoutRef,
      { ownerId, floors: newFloors, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
  }
}
