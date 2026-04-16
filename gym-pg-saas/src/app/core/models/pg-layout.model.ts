export interface PgRoomLayout {
  roomNumber: number;
  beds: number;
  /** Optional monthly rent for this room/sharing setup. */
  rent?: number;
}

export interface PgFloorLayout {
  floorNumber: number;
  rooms: PgRoomLayout[];
}

export interface PgLayout {
  ownerId: string;
  floors: PgFloorLayout[];
  updatedAt?: unknown;
}
