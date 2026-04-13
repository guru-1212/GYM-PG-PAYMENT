/**
 * PG seat map: ground floor is stored as floorNumber === 0 with room labels G1, G2, ...
 * Upper floors use F + two-digit room (e.g. 101, 205).
 */
export function formatPgRoomLabel(floorNumber: number, roomNumber: number): string {
  const f = Math.trunc(Number(floorNumber));
  const r = Math.trunc(Number(roomNumber));
  if (!Number.isFinite(f) || !Number.isFinite(r) || r <= 0) return '';
  if (f === 0) return `G${r}`;
  return `${f}${r.toString().padStart(2, '0')}`;
}

export function sharingLabelForBeds(beds: unknown): string {
  const n = Math.max(1, Math.trunc(Number(beds) || 1));
  if (n === 1) return 'Single sharing';
  if (n === 2) return 'Double sharing';
  if (n === 3) return 'Triple sharing';
  return `${n} sharing`;
}