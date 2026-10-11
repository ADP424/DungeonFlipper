import { CELL_H, CELL_W } from '../core/constants';
import { tileKey } from '../core/geometry';
import type { FurnitureDef, MovementKind, ObstacleDef, TrajectoryKind } from '../content/types';
import { BOUNDARY_WALL, RoomLayout, cellKey, type TileKind } from './layout';
import type { Barricade, Dir, FurniturePlacement, RoomInfo, WorldState } from './types';
import type { Box } from './furniture';

/**
 * Areas: what the runtime simulates and draws at once. In the dungeon an area is a single room; your
 * property is one area too: every room you own that connects to others through doors or knocked-
 * through walls, walked through seamlessly.
 */

const OUT: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/** A knocked-through boundary tile: passable on both sides of the wall line between two rooms. */
export interface Opening { x: number; y: number; dir: Dir; toRoom: string; px: number; py: number }

/** Which side of its cell a boundary tile of `info` faces outward, if it's on the room's edge. */
function boundarySide(info: RoomInfo, cells: Set<string>, x: number, y: number): Dir | null {
  const cx = Math.floor(x / CELL_W), cy = Math.floor(y / CELL_H);
  const lx = x - cx * CELL_W, ly = y - cy * CELL_H;
  if (lx === 0 && !cells.has(cellKey(cx - 1, cy))) return 'w';
  if (lx === CELL_W - 1 && !cells.has(cellKey(cx + 1, cy))) return 'e';
  if (ly === 0 && !cells.has(cellKey(cx, cy - 1))) return 'n';
  if (ly === CELL_H - 1 && !cells.has(cellKey(cx, cy + 1))) return 's';
  return null;
}

/** The tile across the wall line from a boundary tile of `info`, and the room it belongs to. */
export function boundaryPartner(state: WorldState, info: RoomInfo, x: number, y: number): { x: number; y: number; dir: Dir; roomId: string } | null {
  const cells = new Set(info.cells.map((c) => cellKey(c.cx, c.cy)));
  const dir = boundarySide(info, cells, x, y);
  if (!dir) return null;
  const [dx, dy] = OUT[dir];
  const px = x + dx, py = y + dy;
  const roomId = state.floors[info.floor]?.cells[cellKey(Math.floor(px / CELL_W), Math.floor(py / CELL_H))];
  return roomId ? { x: px, y: py, dir, roomId } : null;
}

/** Knocked-through boundary tiles of a room (both its wall tile and the neighbour's are gone). */
export function openings(state: WorldState, info: RoomInfo): Opening[] {
  const room = state.rooms[info.id];
  if (!room) return [];
  const out: Opening[] = [];
  for (const [k, v] of Object.entries(room.tileOverrides)) {
    if (v !== null) continue;
    const [x, y] = k.split(',').map(Number) as [number, number];
    const p = boundaryPartner(state, info, x, y);
    if (!p || state.rooms[p.roomId]?.tileOverrides[tileKey(p.x, p.y)] !== null) continue;
    out.push({ x, y, dir: p.dir, toRoom: p.roomId, px: p.x, py: p.y });
  }
  return out;
}

/**
 * Whether a structural wall tile may be knocked through: a straight stretch of the wall line between
 * two rooms, whoever owns them (not a corner, not next to a doorway), with the wall still standing on
 * both sides. Returns the partner tile across the line.
 */
export function structuralWallTarget(state: WorldState, info: RoomInfo, x: number, y: number): { x: number; y: number; roomId: string } | null {
  const room = state.rooms[info.id];
  if (!room || tileKey(x, y) in room.tileOverrides) return null;
  const p = boundaryPartner(state, info, x, y);
  if (!p) return null;
  const other = state.rooms[p.roomId];
  const otherInfo = state.floors[info.floor]?.rooms[p.roomId];
  if (!other || !otherInfo || tileKey(p.x, p.y) in other.tileOverrides) return null;
  const lx = ((x % CELL_W) + CELL_W) % CELL_W, ly = ((y % CELL_H) + CELL_H) % CELL_H;
  const along = p.dir === 'e' || p.dir === 'w' ? ly : lx;
  const len = p.dir === 'e' || p.dir === 'w' ? CELL_H : CELL_W;
  if (along === 0 || along === len - 1) return null;
  const nearDoor = (r: RoomInfo, tx: number, ty: number) => r.doors.some((d) => Math.abs(d.x - tx) + Math.abs(d.y - ty) <= 1);
  if (nearDoor(info, x, y) || nearDoor(otherInfo, p.x, p.y)) return null;
  return { x: p.x, y: p.y, roomId: p.roomId };
}

/**
 * The rooms that form one walkable area with `roomId`: rooms joined by openings (knocked-through walls)
 * are one space whoever owns them, and doors join rooms with the same owner (your estate). An unowned
 * room with no openings is on its own.
 */
export function areaRooms(state: WorldState, roomId: string): string[] {
  const start = state.rooms[roomId];
  const floor = start && state.floors[start.floor];
  if (!floor) return [roomId];
  const seen = new Set([roomId]);
  const queue = [roomId];
  while (queue.length) {
    const id = queue.shift()!;
    const info = floor.rooms[id]!;
    const owner = state.rooms[id]?.ownerId;
    const byDoor = owner ? info.doors.map((d) => d.toRoom).filter((n) => state.rooms[n]?.ownerId === owner) : [];
    for (const n of [...byDoor, ...openings(state, info).map((o) => o.toRoom)]) {
      if (seen.has(n) || !state.rooms[n]) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return [...seen];
}

/** The tile queries walls autotile against (a single room or a whole area). */
export interface TileQueries {
  kindAt(x: number, y: number): TileKind;
  obstacleAt(x: number, y: number): ObstacleDef | undefined;
}

/**
 * Several rooms' layouts behind one query API, by global tile. Tiles belong to the room whose cell
 * contains them. The *active* rooms (those near the camera) set the bounds pathing and shadows cover.
 */
export class AreaLayout implements TileQueries {
  readonly layouts = new Map<string, RoomLayout>();
  private byCell = new Map<string, RoomLayout>();
  private active: RoomLayout[] = [];
  originX = 0;
  originY = 0;
  w = 1;
  h = 1;

  constructor(state: WorldState, floor: number, roomIds: string[]) {
    const f = state.floors[floor]!;
    for (const id of roomIds) {
      const L = new RoomLayout(f.rooms[id]!, state.rooms[id]!);
      this.layouts.set(id, L);
      for (const c of L.info.cells) this.byCell.set(cellKey(c.cx, c.cy), L);
    }
    this.setActive(roomIds);
  }

  get roomIds(): string[] {
    return [...this.layouts.keys()];
  }

  get activeIds(): string[] {
    return this.active.map((L) => L.info.id);
  }

  /** Make these rooms active; the area's bounds become theirs. */
  setActive(ids: string[]): void {
    this.active = ids.map((id) => this.layouts.get(id)!).filter(Boolean);
    const minX = Math.min(...this.active.map((L) => L.originX)), minY = Math.min(...this.active.map((L) => L.originY));
    const maxX = Math.max(...this.active.map((L) => L.originX + L.w)), maxY = Math.max(...this.active.map((L) => L.originY + L.h));
    this.originX = minX;
    this.originY = minY;
    this.w = maxX - minX;
    this.h = maxY - minY;
  }

  /** Bounds of every room of the area (the camera's limits), in tiles. */
  fullBounds(): { x: number; y: number; w: number; h: number } {
    const all = [...this.layouts.values()];
    const x = Math.min(...all.map((L) => L.originX)), y = Math.min(...all.map((L) => L.originY));
    return { x, y, w: Math.max(...all.map((L) => L.originX + L.w)) - x, h: Math.max(...all.map((L) => L.originY + L.h)) - y };
  }

  roomAt(x: number, y: number): RoomLayout | undefined {
    const L = this.byCell.get(cellKey(Math.floor(x / CELL_W), Math.floor(y / CELL_H)));
    return L && L.kindAt(Math.floor(x), Math.floor(y)) !== 'void' ? L : undefined;
  }

  inBounds(x: number, y: number): boolean {
    return x >= this.originX && y >= this.originY && x < this.originX + this.w && y < this.originY + this.h;
  }

  kindAt(x: number, y: number): TileKind {
    return this.roomAt(x, y)?.kindAt(x, y) ?? 'void';
  }

  containsTile(x: number, y: number): boolean {
    return this.kindAt(x, y) !== 'void';
  }

  obstacleIdAt(x: number, y: number): string | null {
    return this.roomAt(x, y)?.obstacleIdAt(x, y) ?? null;
  }

  obstacleAt(x: number, y: number): ObstacleDef | undefined {
    return this.roomAt(x, y)?.obstacleAt(x, y);
  }

  isBoundary(x: number, y: number): boolean {
    return !!this.roomAt(x, y)?.isBoundary(x, y);
  }

  /** A room's own outer wall, still standing as generated (not one rebuilt in a gap). */
  isStructural(x: number, y: number): boolean {
    const L = this.roomAt(x, y);
    return !!L && L.isBoundary(x, y) && !(tileKey(x, y) in L.state.tileOverrides);
  }

  barricadeAt(x: number, y: number): Barricade | undefined {
    return this.roomAt(x, y)?.barricadeAt(x, y);
  }

  furnitureAtTile(x: number, y: number): FurniturePlacement | undefined {
    return this.roomAt(x, y)?.furnitureAtTile(x, y);
  }

  floorSurfaceAt(x: number, y: number): string | undefined {
    return this.roomAt(x, y)?.floorSurfaceAt(x, y);
  }

  wallSurfaceAt(x: number, y: number): string | undefined {
    return this.roomAt(x, y)?.wallSurfaceAt(x, y);
  }

  blocksMovement(x: number, y: number, kind: MovementKind): boolean {
    const L = this.roomAt(x, y);
    return L ? L.blocksMovement(x, y, kind) : true;
  }

  blocksProjectile(x: number, y: number, t: TrajectoryKind): boolean {
    const L = this.roomAt(x, y);
    return L ? L.blocksProjectile(x, y, t) : true;
  }

  solidsAt(x: number, y: number, kind: MovementKind): Box[] {
    const L = this.roomAt(x, y);
    return L ? L.solidsAt(x, y, kind) : [{ x, y, w: 1, h: 1 }];
  }

  blocksProjectileAt(px: number, py: number, t: TrajectoryKind): boolean {
    const L = this.roomAt(Math.floor(px), Math.floor(py));
    return L ? L.blocksProjectileAt(px, py, t) : true;
  }

  isOpenFloor(x: number, y: number): boolean {
    return !!this.roomAt(x, y)?.isOpenFloor(x, y);
  }

  isBuildable(x: number, y: number): boolean {
    return !!this.roomAt(x, y)?.isBuildable(x, y);
  }

  /** Furniture must sit entirely within one room. */
  canPlaceFurniture(def: FurnitureDef, x: number, y: number, rot: number): boolean {
    const L = this.roomAt(x, y);
    return !!L && L.canPlaceFurniture(def, x, y, rot);
  }

  findFurnitureSpot(def: FurnitureDef, nearX: number, nearY: number, rot = 0): { x: number; y: number } | null {
    return this.roomAt(nearX, nearY)?.findFurnitureSpot(def, nearX, nearY, rot) ?? null;
  }

  nearestOpenFloor(nearX: number, nearY: number): { x: number; y: number } | null {
    return this.roomAt(nearX, nearY)?.nearestOpenFloor(nearX, nearY) ?? null;
  }

  /** Non-void tiles of the active rooms. */
  *tiles(): Generator<{ x: number; y: number; kind: TileKind }> {
    for (const L of this.active) yield* L.tiles();
  }

  /** Furniture of the active rooms. */
  furniture(): FurniturePlacement[] {
    return this.active.flatMap((L) => L.state.furniture);
  }

  /** The tabletop a small piece stands on, if any (see `RoomLayout.onTopOf`). */
  onTopOf(f: FurniturePlacement): FurniturePlacement | undefined {
    return this.roomAt(f.x, f.y)?.onTopOf(f);
  }

  /** A placed piece of furniture anywhere in the area, with its room. */
  findFurniture(uid: string): { room: RoomLayout; f: FurniturePlacement } | undefined {
    for (const L of this.layouts.values()) {
      const f = L.state.furniture.find((x) => x.uid === uid);
      if (f) return { room: L, f };
    }
    return undefined;
  }

  rebuildFurniture(): void {
    for (const L of this.layouts.values()) L.rebuildFurniture();
  }

}
