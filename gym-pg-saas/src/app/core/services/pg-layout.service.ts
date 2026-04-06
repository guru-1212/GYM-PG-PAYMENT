import { Injectable, inject } from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc, Unsubscribe } from 'firebase/firestore';
import { PgFloorLayout, PgLayout } from '../models/pg-layout.model';
import { FirebaseAppService } from './firebase-app.service';

@Injectable({ providedIn: 'root' })
export class PgLayoutService {
  private readonly fb = inject(FirebaseAppService);

  watchLayout(ownerId: string, callback: (layout: PgLayout | null) => void): Unsubscribe {
    const ref = doc(this.fb.db, 'pgLayouts', ownerId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      callback({
        ownerId,
        floors: this.normalizeFloors(raw['floors']),
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
      const floorNumber = Number(floor['floorNumber']) || i + 1;
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
}
