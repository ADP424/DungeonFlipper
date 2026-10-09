import type { DocKey, FloorState, RoomInfo } from './types';

/**
 * Floors are unbounded, so their generated rooms are persisted in fixed-size regions of cells
 * instead of one ever-growing `floor:N` document. A room belongs to the region of its first cell.
 * In memory, `FloorState.cells` / `rooms` stay complete maps; only persistence is split.
 */
export const REGION_CELLS = 8;

export function regionOf(cx: number, cy: number): string {
  return `${Math.floor(cx / REGION_CELLS)},${Math.floor(cy / REGION_CELLS)}`;
}

export function regionKeyOf(floor: number, info: RoomInfo): DocKey {
  const c = info.cells[0]!;
  return `region:${floor}:${regionOf(c.cx, c.cy)}`;
}

export function regionKeys(floor: FloorState): DocKey[] {
  return [...new Set(Object.values(floor.rooms).map((r) => regionKeyOf(floor.index, r)))];
}

/** The persisted part of a floor without its rooms and cells. */
export type FloorMeta = Omit<FloorState, 'cells' | 'rooms'>;

export interface RegionDoc {
  cells: Record<string, string>;
  rooms: Record<string, RoomInfo>;
}

export function floorMeta(floor: FloorState): FloorMeta {
  const { cells: _c, rooms: _r, ...meta } = floor;
  return meta;
}

/** The rooms (and their cells) of one region. */
export function regionDoc(floor: FloorState, region: string): RegionDoc {
  const doc: RegionDoc = { cells: {}, rooms: {} };
  for (const r of Object.values(floor.rooms)) {
    if (regionOf(r.cells[0]!.cx, r.cells[0]!.cy) !== region) continue;
    doc.rooms[r.id] = r;
    for (const c of r.cells) doc.cells[`${c.cx},${c.cy}`] = r.id;
  }
  return doc;
}
