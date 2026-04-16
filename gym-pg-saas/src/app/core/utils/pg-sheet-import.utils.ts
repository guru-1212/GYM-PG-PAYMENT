import { formatPgRoomLabel } from './pg-layout-display.utils';

export type ParsedPgSeat = {
  floorNumber: string;
  roomNumber: string;
  bedNumber: string;
  errors: string[];
};

export function pgSheetSubscriptionError(isPg: boolean, subRaw: string): string | null {
  const raw = String(subRaw ?? '').trim();
  const s = raw.toLowerCase();
  if (isPg) {
    if (s && s !== 'monthly') {
      return `subscriptionType must be "monthly" for PG (found "${raw}"). Quarterly/yearly are not allowed in the import sheet.`;
    }
    return null;
  }
  if (s && !['monthly', 'quarterly', 'yearly'].includes(s)) {
    return 'subscriptionType must be monthly, quarterly, or yearly.';
  }
  return null;
}

/**
 * Parse floor / room / bed from a PG import row.
 * Room >= 100: floor = floor(room/100), unit = room % 100 (204 -> floor 2, unit 4).
 * If floor column is set with a full room number, it must match derived floor.
 * Room < 100: requires floor column; unit is the room index on that floor (floor 2 + room 4 -> 204).
 * Leave all three empty for no seat on that row.
 */
export function parsePgImportSeat(floorStr: string, roomStr: string, bedStr: string): ParsedPgSeat {
  const errors: string[] = [];
  const floorRaw = String(floorStr ?? '').trim();
  const roomRaw = String(roomStr ?? '').trim();
  const bedRaw = String(bedStr ?? '').trim();
  const any = floorRaw.length > 0 || roomRaw.length > 0 || bedRaw.length > 0;
  if (!any) {
    return { floorNumber: '', roomNumber: '', bedNumber: '', errors: [] };
  }
  if (!roomRaw) {
    errors.push('Room is required when assigning a seat (use a full number like 204, or set floor + room on that floor).');
  }
  if (!bedRaw) {
    errors.push('Bed is required when assigning a seat (or clear floor, room, and bed for no seat).');
  }

  const bedNum = Number(bedRaw);
  if (bedRaw && (!Number.isFinite(bedNum) || bedNum <= 0 || !Number.isInteger(bedNum))) {
    errors.push('Bed must be a positive whole number.');
  }

  const roomNum = Number(roomRaw);
  if (!roomRaw || !Number.isFinite(roomNum) || roomNum <= 0 || !Number.isInteger(roomNum)) {
    errors.push('Room must be a positive whole number (e.g. 204 or 4 with floor set).');
    return { floorNumber: '', roomNumber: '', bedNumber: '', errors };
  }

  let f: number;
  let rUnit: number;

  if (roomNum >= 100) {
    f = Math.floor(roomNum / 100);
    rUnit = roomNum % 100;
    if (f < 0) {
      errors.push('Could not read floor from the room number.');
    }
    if (rUnit <= 0 || rUnit > 99) {
      errors.push(
        `Room number ${roomNum} is invalid: after the floor part, the room must be 01-99 (e.g. 201, 204).`,
      );
    }
    if (floorRaw) {
      const fCol = Number(floorRaw);
      if (Number.isFinite(fCol) && Math.trunc(fCol) !== f) {
        const label = formatPgRoomLabel(f, rUnit) || String(roomNum);
        errors.push(
          `Floor column (${Math.trunc(fCol)}) does not match room ${roomNum}: that room is on floor ${f} (seat ${label}). Clear the floor column or set it to ${f}.`,
        );
      }
    }
  } else {
    if (!floorRaw) {
      errors.push(
        `Room "${roomRaw}" is too small to infer the floor. Use a full room number (e.g. 204) or set the floor column (e.g. floor 2 + room 4 -> 204).`,
      );
      return { floorNumber: '', roomNumber: '', bedNumber: '', errors };
    }
    const fCol = Number(floorRaw);
    if (!Number.isFinite(fCol) || fCol < 0 || !Number.isInteger(fCol)) {
      errors.push('Floor must be a whole number (0 = ground, 1+ = upper floors).');
      return { floorNumber: '', roomNumber: '', bedNumber: '', errors };
    }
    f = Math.trunc(fCol);
    rUnit = Math.trunc(roomNum);
    if (rUnit <= 0 || rUnit > 99) {
      errors.push('When using the floor column, room must be between 1 and 99 (the room index on that floor).');
    }
  }

  if (errors.length) {
    return { floorNumber: '', roomNumber: '', bedNumber: '', errors };
  }

  return {
    floorNumber: String(Math.trunc(f)),
    roomNumber: String(Math.trunc(rUnit)),
    bedNumber: String(Math.trunc(bedNum)),
    errors: [],
  };
}