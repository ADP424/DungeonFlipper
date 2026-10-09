import { CELL_H, CELL_W } from '../core/constants';
import { tileKey } from '../core/geometry';
import { furniture as furnitureReg } from '../content/registry';
import { openings } from './area';
import { RoomLayout, footprint } from './layout';
import { isSecure } from './securing';
import { fixtureSupplied, tilesSupplied, utilityNets } from './utilities';
import type { FurniturePlacement, RoomInfo, WorldState } from './types';

/**
 * Units: once rooms are yours their original boundaries stop mattering. A unit is any connected
 * stretch of floor in rooms with the same owner, bounded by walls and doorways (knocked-through
 * walls join rooms into one unit). A unit with a For Rent sign in it is a listing.
 */
export interface Unit {
  /** Stable id: the unit's first tile (top-left most). */
  key: string;
  floor: number;
  ownerId: string;
  tiles: Set<string>;
  rooms: string[];
  /** Furniture whose anchor tile is in the unit, with its room. */
  furniture: { f: FurniturePlacement; roomId: string }[];
}

export const SIGN = 'for_rent_sign';
const MAX_TILES = 6000;
const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Builds RoomLayouts on demand while flood-filling (one per room touched). */
class Layouts {
  private cache = new Map<string, RoomLayout | null>();
  constructor(private state: WorldState, private floor: number) {}
  roomIdAt(x: number, y: number): string | undefined {
    return this.state.floors[this.floor]?.cells[`${Math.floor(x / CELL_W)},${Math.floor(y / CELL_H)}`];
  }
  get(id: string): RoomLayout | null {
    if (!this.cache.has(id)) {
      const info = this.state.floors[this.floor]?.rooms[id];
      const st = this.state.rooms[id];
      this.cache.set(id, info && st ? new RoomLayout(info, st) : null);
    }
    return this.cache.get(id)!;
  }
}

/** Part of a unit: floor (not a doorway), not a wall. Furniture and minor obstacles don't divide units. */
function unitTile(L: RoomLayout, x: number, y: number): boolean {
  if (L.kindAt(x, y) !== 'floor') return false;
  return !L.obstacleAt(x, y)?.isWall;
}

/** The unit containing a tile, if it's floor in an owned room. */
export function unitAt(state: WorldState, floor: number, x: number, y: number): Unit | null {
  const ls = new Layouts(state, floor);
  const startId = ls.roomIdAt(x, y);
  const owner = startId ? state.rooms[startId]?.ownerId : null;
  const startL = startId ? ls.get(startId) : null;
  if (!owner || !startL || !unitTile(startL, x, y)) return null;
  const tiles = new Set<string>([tileKey(x, y)]);
  const rooms = new Set<string>([startId!]);
  const qx = [x], qy = [y];
  for (let i = 0; i < qx.length && tiles.size < MAX_TILES; i++) {
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = qx[i]! + dx, ny = qy[i]! + dy;
      const k = tileKey(nx, ny);
      if (tiles.has(k)) continue;
      const rid = ls.roomIdAt(nx, ny);
      if (!rid || state.rooms[rid]?.ownerId !== owner) continue;
      const L = ls.get(rid);
      if (!L || !unitTile(L, nx, ny)) continue;
      tiles.add(k);
      rooms.add(rid);
      qx.push(nx);
      qy.push(ny);
    }
  }
  const furniture: Unit['furniture'] = [];
  for (const id of rooms) for (const f of state.rooms[id]!.furniture) if (tiles.has(tileKey(f.x, f.y))) furniture.push({ f, roomId: id });
  const key = [...tiles].map((k) => k.split(',').map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]!.join(',');
  return { key, floor, ownerId: owner, tiles, rooms: [...rooms], furniture };
}

/** For Rent signs on a floor (owned rooms), with whether their listing is open. */
export function signs(state: WorldState, floor: number): { f: FurniturePlacement; roomId: string; open: boolean }[] {
  const out: { f: FurniturePlacement; roomId: string; open: boolean }[] = [];
  for (const info of Object.values(state.floors[floor]?.rooms ?? {})) {
    const st = state.rooms[info.id];
    if (!st?.ownerId) continue;
    for (const f of st.furniture) if (f.defId === SIGN) out.push({ f, roomId: info.id, open: f.data?.closed !== true });
  }
  return out;
}

/** Find a placed sign anywhere on any floor. */
export function findSign(state: WorldState, uid: string): { f: FurniturePlacement; roomId: string; floor: number } | null {
  for (const st of Object.values(state.rooms)) {
    const f = st.furniture.find((x) => x.uid === uid);
    if (f) return { f, roomId: st.id, floor: st.floor };
  }
  return null;
}

/** What a tenant cares about in a unit. */
export interface UnitStats {
  area: number;
  beds: number;
  /** Furniture count per tag (seat, light, plant…). */
  tags: Record<string, number>;
  /** Share of floor tiles per surface family ('carpet', 'wood', …). */
  floors: Record<string, number>;
  secure: boolean;
  /** No room of the unit borders a room with monsters in it. */
  quiet: boolean;
  /** Neighbouring rooms (outside the unit) that aren't secure property, and how many of those have monsters in them. */
  borderUnsecured: number;
  borderUncleared: number;
  /** Reachable from the floor's lobby through secure rooms of the same owner (D24). */
  connected: boolean;
  /** A live wire / pipe reaches the unit (P6). */
  power: boolean;
  water: boolean;
}

export function unitStats(state: WorldState, unit: Unit): UnitStats {
  const tags: Record<string, number> = {};
  let beds = 0;
  const nets = utilityNets(state, unit.floor);
  for (const { f, roomId } of unit.furniture) {
    const def = furnitureReg.tryGet(f.defId);
    // A fixture that isn't supplied (a dark lamp) doesn't count for what it's meant to do.
    if (!fixtureSupplied(state, nets, roomId, f)) continue;
    for (const t of def?.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
    if (def?.tags?.includes('bed')) beds++;
  }
  const floors: Record<string, number> = {};
  const ls = new Layouts(state, unit.floor);
  for (const k of unit.tiles) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const id = ls.roomIdAt(x, y);
    const surf = id ? ls.get(id)?.floorSurfaceAt(x, y) : undefined;
    const fam = surf ? surf.split('_')[0]! : 'bare';
    floors[fam] = (floors[fam] ?? 0) + 1;
  }
  for (const fam of Object.keys(floors)) floors[fam] = floors[fam]! / unit.tiles.size;
  const floorState = state.floors[unit.floor]!;
  const neighbours = (info: RoomInfo) => [...info.doors.map((d) => d.toRoom), ...openings(state, info).map((o) => o.toRoom)];
  const quiet = unit.rooms.every((id) => neighbours(floorState.rooms[id]!).every((n) => !state.rooms[n]?.monsters.length));
  const border = new Set<string>();
  for (const id of unit.rooms) for (const n of neighbours(floorState.rooms[id]!)) if (!unit.rooms.includes(n)) border.add(n);
  const unsecured = [...border].filter((n) => !(state.rooms[n]?.ownerId === unit.ownerId && isSecure(state, n)));
  return {
    area: unit.tiles.size, beds, tags, floors,
    borderUnsecured: unsecured.length,
    borderUncleared: unsecured.filter((n) => !!state.rooms[n]?.monsters.length).length,
    secure: unit.rooms.every((id) => isSecure(state, id)),
    quiet,
    connected: lobbyConnected(state, unit),
    power: tilesSupplied(nets, 'power', unit.tiles),
    water: tilesSupplied(nets, 'water', unit.tiles),
  };
}

/** Can people walk in from the lobby through secure rooms of the unit's owner? */
export function lobbyConnected(state: WorldState, unit: Unit): boolean {
  const floor = state.floors[unit.floor];
  if (!floor) return false;
  const ok = (id: string) => state.rooms[id]?.ownerId === unit.ownerId && isSecure(state, id);
  const seen = new Set(unit.rooms.filter(ok));
  const queue = [...seen];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === floor.lobbyRoomId) return true;
    const info = floor.rooms[id]!;
    for (const n of [...info.doors.map((d) => d.toRoom), ...openings(state, info).map((o) => o.toRoom)]) {
      if (seen.has(n) || !ok(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return false;
}

/** Tiles of a furniture piece's footprint. */
export function footprintTiles(f: FurniturePlacement): string[] {
  const def = furnitureReg.get(f.defId);
  const { w, h } = footprint(def, f.rot);
  const out: string[] = [];
  for (let y = f.y; y < f.y + h; y++) for (let x = f.x; x < f.x + w; x++) out.push(tileKey(x, y));
  return out;
}
