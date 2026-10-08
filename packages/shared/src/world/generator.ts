import { CELL_H, CELL_W } from '../core/constants';
import { Rng, deriveSeed } from '../core/rng';
import { tileKey } from '../core/geometry';
import { roomTemplates, furniture as furnitureReg } from '../content/registry';
import { legendFor, templateMapSize } from '../content';
import type { CellCoord, RoomTag, RoomTemplateDef } from '../content/types';
import { RoomLayout, cellKey, footprint, mirrorCells, templateToGlobal } from './layout';
import { createItem } from './items';
import type { Dir, FloorState, RoomInfo, RoomState } from './types';

export interface GeneratedFloor {
  floor: FloorState;
  rooms: RoomState[];
}

export interface GenerateOptions {
  /** Normal rooms to place (excluding entry, boss and stairs rooms). */
  minRooms?: number;
  maxRooms?: number;
}

const DIRS: { dir: Dir; dx: number; dy: number; back: Dir }[] = [
  { dir: 'n', dx: 0, dy: -1, back: 's' },
  { dir: 's', dx: 0, dy: 1, back: 'n' },
  { dir: 'e', dx: 1, dy: 0, back: 'w' },
  { dir: 'w', dx: -1, dy: 0, back: 'e' },
];

/**
 * Seeded floor generator. Rooms are polyominoes of cells on a sparse, unbounded grid, so floors can
 * hold any number of rooms and can be expanded later by attaching more rooms to free cells.
 */
export class FloorBuilder {
  readonly rng: Rng;
  readonly cells = new Map<string, string>();
  readonly rooms = new Map<string, RoomInfo>();
  private counter = 0;

  constructor(readonly floorIndex: number, readonly seed: number, existing?: FloorState) {
    this.rng = new Rng(deriveSeed(seed, `floor${floorIndex}:${existing ? Object.keys(existing.rooms).length : 0}`));
    if (existing) {
      for (const [k, v] of Object.entries(existing.cells)) this.cells.set(k, v);
      for (const r of Object.values(existing.rooms)) this.rooms.set(r.id, structuredClone(r));
      this.counter = Object.keys(existing.rooms).length;
    }
  }

  nextRoomId(): string {
    return `f${this.floorIndex}r${this.counter++}`;
  }

  fits(cells: CellCoord[]): boolean {
    return cells.every((c) => !this.cells.has(cellKey(c.cx, c.cy)));
  }

  place(t: RoomTemplateDef, mirrorX: boolean, mirrorY: boolean, cells: CellCoord[]): RoomInfo {
    const id = this.nextRoomId();
    const info: RoomInfo = { id, floor: this.floorIndex, templateId: t.id, mirrorX, mirrorY, cells, doors: [], tags: [...t.tags] };
    for (const c of cells) this.cells.set(cellKey(c.cx, c.cy), id);
    this.rooms.set(id, info);
    return info;
  }

  /** Add a door pair between two orthogonally adjacent cells of different rooms. */
  connect(a: CellCoord, b: CellCoord): boolean {
    const ra = this.rooms.get(this.cells.get(cellKey(a.cx, a.cy))!);
    const rb = this.rooms.get(this.cells.get(cellKey(b.cx, b.cy))!);
    if (!ra || !rb || ra === rb) return false;
    const d = DIRS.find((d) => d.dx === b.cx - a.cx && d.dy === b.cy - a.cy);
    if (!d) return false;
    const pa = doorTile(a, d.dir);
    const pb = doorTile(b, d.back);
    if (ra.doors.some((x) => x.x === pa.x && x.y === pa.y)) return false;
    ra.doors.push({ ...pa, dir: d.dir, toRoom: rb.id });
    rb.doors.push({ ...pb, dir: d.back, toRoom: ra.id });
    return true;
  }

  /**
   * Try to attach a room built from `t` to a free cell next to `parent`.
   * Returns the new room or null if no fit was found.
   */
  attach(parent: RoomInfo, t: RoomTemplateDef, tries = 24): RoomInfo | null {
    for (let i = 0; i < tries; i++) {
      const pc = this.rng.pick(parent.cells);
      const d = this.rng.pick(DIRS);
      const nc = { cx: pc.cx + d.dx, cy: pc.cy + d.dy };
      if (this.cells.has(cellKey(nc.cx, nc.cy))) continue;
      const mx = this.rng.chance(0.5);
      const my = this.rng.chance(0.5);
      const shape = mirrorCells(t.cells, mx, my);
      const anchor = this.rng.pick(shape);
      const cells = shape.map((c) => ({ cx: c.cx - anchor.cx + nc.cx, cy: c.cy - anchor.cy + nc.cy }));
      if (!this.fits(cells)) continue;
      const room = this.place(t, mx, my, cells);
      this.connect(pc, nc);
      return room;
    }
    return null;
  }

  templatesWithTag(tag: RoomTag): RoomTemplateDef[] {
    return roomTemplates.all().filter((t) => t.tags.includes(tag) && (t.minFloor ?? 1) <= this.floorIndex);
  }

  /** Breadth-first room distances from a room through doors. */
  distancesFrom(startId: string): Map<string, number> {
    const dist = new Map<string, number>([[startId, 0]]);
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const door of this.rooms.get(id)!.doors) {
        if (!dist.has(door.toRoom)) {
          dist.set(door.toRoom, dist.get(id)! + 1);
          queue.push(door.toRoom);
        }
      }
    }
    return dist;
  }

  /** Occasionally connect adjacent rooms that aren't connected yet, to create loops. */
  addLoops(chance: number, exclude: Set<string>): void {
    for (const [k, id] of this.cells) {
      const [cx, cy] = k.split(',').map(Number) as [number, number];
      for (const d of DIRS.slice(1, 3)) {
        const other = this.cells.get(cellKey(cx + d.dx, cy + d.dy));
        if (!other || other === id || exclude.has(id) || exclude.has(other)) continue;
        const a = this.rooms.get(id)!;
        if (a.doors.some((x) => x.toRoom === other)) continue;
        if (this.rng.chance(chance)) this.connect({ cx, cy }, { cx: cx + d.dx, cy: cy + d.dy });
      }
    }
  }
}

/** Global tile of the door in cell `c` on side `dir`. */
export function doorTile(c: CellCoord, dir: Dir): { x: number; y: number } {
  const midX = c.cx * CELL_W + Math.floor(CELL_W / 2);
  const midY = c.cy * CELL_H + Math.floor(CELL_H / 2);
  switch (dir) {
    case 'n': return { x: midX, y: c.cy * CELL_H };
    case 's': return { x: midX, y: c.cy * CELL_H + CELL_H - 1 };
    case 'e': return { x: c.cx * CELL_W + CELL_W - 1, y: midY };
    case 'w': return { x: c.cx * CELL_W, y: midY };
  }
}

export function generateFloor(worldSeed: number, floorIndex: number, opts: GenerateOptions = {}): GeneratedFloor {
  const b = new FloorBuilder(floorIndex, worldSeed);
  const rng = b.rng;

  const entryT = roomTemplates.get(floorIndex === 1 ? 'safe_room' : 'stairs_up_room');
  const entry = b.place(entryT, false, false, [{ cx: 0, cy: 0 }]);

  const normals = b.templatesWithTag('normal');
  const target = rng.int(opts.minRooms ?? 10, opts.maxRooms ?? 14);
  let placed = 0;
  for (let guard = 0; placed < target && guard < 4000; guard++) {
    const list = [...b.rooms.values()];
    // The entry room gets at most two neighbours so the home stays cosy.
    const parent = rng.pick(list);
    if (parent.id === entry.id && parent.doors.length >= 2) continue;
    const t = rng.weighted(normals, (x) => x.weight ?? 1)!;
    if (b.attach(parent, t)) placed++;
  }
  b.addLoops(0.15, new Set([entry.id]));

  // Boss room hangs off the farthest room possible; the stairs down hang off the boss room.
  const dist = b.distancesFrom(entry.id);
  const byDistance = [...dist.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => b.rooms.get(id)!);
  const bossT = rng.pick(b.templatesWithTag('boss'));
  const stairsT = rng.pick(b.templatesWithTag('stairsDown'));
  let stairsRoom: RoomInfo | null = null;
  for (const parent of byDistance) {
    if (parent.id === entry.id) continue;
    const boss = b.attach(parent, bossT, 60);
    if (!boss) continue;
    stairsRoom = b.attach(boss, stairsT, 60);
    if (stairsRoom) break;
    // Undo the boss room if stairs couldn't fit, then keep looking.
    for (const c of boss.cells) b.cells.delete(cellKey(c.cx, c.cy));
    b.rooms.delete(boss.id);
    parent.doors = parent.doors.filter((d) => d.toRoom !== boss.id);
  }

  const floor: FloorState = {
    index: floorIndex,
    seed: deriveSeed(worldSeed, `floor${floorIndex}`),
    cells: Object.fromEntries(b.cells),
    rooms: Object.fromEntries(b.rooms),
    entryRoomId: entry.id,
    stairsDownRoomId: stairsRoom?.id,
  };
  const rooms = [...b.rooms.values()].map((info) => initialRoomState(info));
  return { floor, rooms };
}

/** Build the initial persistent state for a freshly generated room. */
export function initialRoomState(info: RoomInfo): RoomState {
  const t = roomTemplates.get(info.templateId);
  const state: RoomState = {
    id: info.id,
    floor: info.floor,
    owned: !!t.startsOwned,
    discovered: false,
    visited: false,
    deadSpawnIds: [],
    tileOverrides: {},
    floorSurfaces: {},
    wallSurfaces: {},
    furniture: [],
    groundItems: [],
  };
  const layout = new RoomLayout(info, state);
  if (t.floorSurface) {
    for (const tile of layout.tiles()) {
      if (tile.kind !== 'void' && !layout.isBoundary(tile.x, tile.y)) state.floorSurfaces[tileKey(tile.x, tile.y)] = t.floorSurface;
    }
  }
  let n = 0;
  const { w: mw, h: mh } = templateMapSize(t);
  for (const f of t.furniture ?? []) {
    const def = furnitureReg.get(f.def);
    const rot = f.rot ?? 0;
    const { w, h } = footprint(def, rot);
    const a = templateToGlobal(info, t, f.x, f.y);
    const c = templateToGlobal(info, t, Math.min(mw - 1, f.x + w - 1), Math.min(mh - 1, f.y + h - 1));
    state.furniture.push({
      uid: `${info.id}-furn${n++}`,
      defId: f.def,
      x: Math.min(a.x, c.x),
      y: Math.min(a.y, c.y),
      rot,
      contents: def.container
        ? Array.from({ length: def.container.slots }, (_, i) => {
            const id = f.contents?.[i];
            return id ? createItem(id, `${info.id}-item${n++}`) : null;
          })
        : undefined,
    });
  }
  layout.rebuildFurniture();
  placeMapFurniture(layout);
  return state;
}

/**
 * Add the furniture drawn into a template's ASCII map (e.g. `*` braziers) to a room's state.
 * Uids derive from the map coordinate, so this is idempotent; tiles that are overridden, reserved
 * or already furnished are skipped. Also used by the save migration that turned braziers into furniture.
 */
export function placeMapFurniture(layout: RoomLayout): void {
  const { info, template: t, state } = layout;
  const legend = legendFor(t);
  t.map.forEach((row, my) => {
    for (let mx = 0; mx < row.length; mx++) {
      const e = legend[row[mx]!];
      if (!e || !('furniture' in e)) continue;
      const uid = `${info.id}-map${mx},${my}`;
      if (state.furniture.some((f) => f.uid === uid)) continue;
      const { x, y } = templateToGlobal(info, t, mx, my);
      if (tileKey(x, y) in state.tileOverrides || !layout.isBuildable(x, y)) continue;
      state.furniture.push({ uid, defId: e.furniture, x, y, rot: 0 });
      layout.rebuildFurniture();
    }
  });
}
