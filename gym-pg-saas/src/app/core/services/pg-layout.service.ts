import { Injectable, inject } from '@angular/core';
import type { DocumentReference } from 'firebase/firestore';
import {
  collection,
  doc,
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
    await setDoc(
      ref,
      {
        ownerId,
        floors,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
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
        return {
          roomNumber: Number(row['roomNumber']) || idx + 1,
          beds: Math.max(1, Number(row['beds']) || 1),
        };
      });
      floors.push({ floorNumber, rooms });
    }
    return floors;
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
