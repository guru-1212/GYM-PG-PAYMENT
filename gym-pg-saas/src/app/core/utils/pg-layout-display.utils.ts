/**
 * PG seat map: ground floor is stored as floorNumber 0; rooms show as G1, G2, ...
 * Other floors use F + two-digit room (e.g. 101, 205).
 */
export function formatPgRoomLabel(floorNumber: number, roomNumber: number): string {
  const f = Math.trunc(Number(floorNumber));
  const r = Math.trunc(Number(roomNumber));
  if (!Number.isFinite(f) || !Number.isFinite(r) || r <= 0) return '';
  if (f === 0) return `G${r}`;
  return `${f}${r.toString().padStart(2, '0')}`;
}