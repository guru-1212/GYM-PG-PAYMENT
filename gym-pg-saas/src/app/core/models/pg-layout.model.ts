export interface PgRoomLayout {
  roomNumber: number;
  beds: number;
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
