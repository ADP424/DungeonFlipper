import { CELL_H, CELL_W } from '../core/constants';
import { Rng, deriveSeed } from '../core/rng';
import { furniture as furnitureReg, roomTemplates } from '../content/registry';
import { legendFor } from '../content';
import type { CellCoord, RoomTag, RoomTemplateDef } from '../content/types';
import { APARTMENT_FLOOR, BOSS_CHANCE, LOBBY_CELL, depthAt, templateWeight } from './difficulty';
import { RoomLayout, cellKey, footprint, mirrorCells, templateToGlobal } from './layout';
import { mirrorFacing } from './furniture';
import { createItem } from './items';
import { WORLD_OWNER } from './ownership';
import type { Dir, FloorState, MonsterRecord, RoomInfo, RoomState } from './types';

export interface GeneratedFloor {
  floor: FloorState;
  rooms: RoomState[];
}

/** Result of expanding a room: every RoomInfo created or changed (new doors), plus the new rooms' states. */
export interface Expansion {
  infos: RoomInfo[];
  states: RoomState[];
}

const DIRS: { dir: Dir; dx: number; dy: number; back: Dir }[] = [
  { dir: 'n', dx: 0, dy: -1, back: 's' },
  { dir: 's', dx: 0, dy: 1, back: 'n' },
  { dir: 'e', dx: 1, dy: 0, back: 'w' },
  { dir: 'w', dx: -1, dy: 0, back: 'e' },
];

/** Chance of opening another exit while expanding a room that already has 0, 1, 2, 3+ doors. */
const EXIT_CHANCE = [1, 0.7, 0.4, 0.15];
/** Chance of a door into an adjacent, still unexpanded room (loops). */
const LOOP_CHANCE = 0.2;
/** The lobby stays cosy: at most this many neighbours. */
const LOBBY_MAX_EXITS = 2;

/**
 * Seeded floor generator. Rooms are polyominoes of cells on a sparse, unbounded grid. Floors are
 * never finished: entering a room *expands* it (its door list becomes final and the rooms behind
 * its new doors are created), so the floor grows one room ahead of the player, forever.
 */
export class FloorBuilder {
  readonly rng: Rng;
  readonly cells = new Map<string, string>();
  readonly rooms = new Map<string, RoomInfo>();
  /** Rooms created or modified by this builder, in creation order. */
  private readonly touched = new Set<string>();
  private readonly created = new Set<string>();
  private counter = 0;

  constructor(readonly floorIndex: number, readonly seed: number, existing?: FloorState, label = 'gen') {
    this.rng = new Rng(deriveSeed(seed, `floor${floorIndex}:${label}`));
    if (existing) {
      for (const [k, v] of Object.entries(existing.cells)) this.cells.set(k, v);
      for (const r of Object.values(existing.rooms)) {
        this.rooms.set(r.id, structuredClone(r));
        this.counter = Math.max(this.counter, Number(r.id.slice(r.id.lastIndexOf('r') + 1)) + 1);
      }
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
    const info: RoomInfo = {
      id, floor: this.floorIndex, templateId: t.id, mirrorX, mirrorY, cells, doors: [], tags: [...t.tags],
      difficulty: t.difficulty ?? 0, expanded: false,
    };
    for (const c of cells) this.cells.set(cellKey(c.cx, c.cy), id);
    this.rooms.set(id, info);
    this.touched.add(id);
    this.created.add(id);
    return info;
  }

  private remove(room: RoomInfo): void {
    for (const c of room.cells) this.cells.delete(cellKey(c.cx, c.cy));
    this.rooms.delete(room.id);
    this.created.delete(room.id);
    this.touched.delete(room.id);
    for (const r of this.rooms.values()) r.doors = r.doors.filter((d) => d.toRoom !== room.id);
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
    this.touched.add(ra.id);
    this.touched.add(rb.id);
    return true;
  }

  /** Place `t` so it covers the free cell beside `cell` in direction `d`, and connect the two. */
  attachAt(cell: CellCoord, d: (typeof DIRS)[number], t: RoomTemplateDef, tries = 16): RoomInfo | null {
    const nc = { cx: cell.cx + d.dx, cy: cell.cy + d.dy };
    if (this.cells.has(cellKey(nc.cx, nc.cy))) return null;
    for (let i = 0; i < tries; i++) {
      const mx = this.rng.chance(0.5);
      const my = this.rng.chance(0.5);
      const shape = mirrorCells(t.cells, mx, my);
      const anchor = this.rng.pick(shape);
      const cells = shape.map((c) => ({ cx: c.cx - anchor.cx + nc.cx, cy: c.cy - anchor.cy + nc.cy }));
      if (!this.fits(cells)) continue;
      const room = this.place(t, mx, my, cells);
      this.connect(cell, nc);
      return room;
    }
    return null;
  }

  /** Attach a room built from `t` to any free cell next to `parent`. */
  attach(parent: RoomInfo, t: RoomTemplateDef, tries = 24): RoomInfo | null {
    for (let i = 0; i < tries; i++) {
      const room = this.attachAt(this.rng.pick(parent.cells), this.rng.pick(DIRS), t, 1);
      if (room) return room;
    }
    return null;
  }

  /** Templates with a tag that may appear at a depth (those no harder than it). */
  templatesWithTag(tag: RoomTag, depth = Infinity): RoomTemplateDef[] {
    return roomTemplates.all().filter((t) => t.tags.includes(tag) && (t.difficulty ?? 0) <= depth);
  }

  /**
   * A template for a spot at `depth`, by `templateWeight`. Somewhere shallower than every template
   * with the tag gets the easiest ones.
   */
  pickTemplate(tag: RoomTag, depth: number): RoomTemplateDef | undefined {
    const fits = this.templatesWithTag(tag, depth);
    if (fits.length) return this.rng.weighted(fits, (t) => templateWeight(t, depth));
    const all = this.templatesWithTag(tag);
    const easiest = Math.min(...all.map((t) => t.difficulty ?? 0));
    return this.rng.weighted(all.filter((t) => (t.difficulty ?? 0) === easiest), (t) => t.weight ?? 1);
  }

  /** Free cell edges of a room, in random order. */
  private freeEdges(room: RoomInfo): { cell: CellCoord; d: (typeof DIRS)[number] }[] {
    const out: { cell: CellCoord; d: (typeof DIRS)[number] }[] = [];
    for (const cell of room.cells) {
      for (const d of DIRS) if (!this.cells.has(cellKey(cell.cx + d.dx, cell.cy + d.dy))) out.push({ cell, d });
    }
    return this.rng.shuffle(out);
  }

  /** A new room behind an edge: rarely a boss room (with its stairs room behind it), otherwise a normal one. */
  private attachNew(cell: CellCoord, d: (typeof DIRS)[number]): RoomInfo | null {
    const nc = { cx: cell.cx + d.dx, cy: cell.cy + d.dy };
    if (this.cells.has(cellKey(nc.cx, nc.cy))) return null;
    const depth = depthAt(this.floorIndex, [nc]);
    const bossTs = this.templatesWithTag('boss', depth);
    if (bossTs.length && this.rng.chance(BOSS_CHANCE)) {
      const boss = this.attachAt(cell, d, this.rng.weighted(bossTs, (t) => templateWeight(t, depth))!);
      if (boss) {
        if (this.attachExtras(boss)) return boss;
        this.remove(boss);
      }
    }
    for (let i = 0; i < 4; i++) {
      const t = this.pickTemplate('normal', depth);
      const room = t && this.attachAt(cell, d, t);
      if (room) return room;
    }
    return null;
  }

  /** Rooms a template brings along (`attach`), e.g. the stairs room behind a boss room. They are dead ends. */
  private attachExtras(room: RoomInfo): boolean {
    for (const tag of roomTemplates.get(room.templateId).attach ?? []) {
      const ts = this.templatesWithTag(tag);
      const extra = ts.length ? this.attach(room, this.rng.pick(ts), 60) : null;
      if (!extra) return false;
      extra.expanded = true;
    }
    return true;
  }

  /**
   * Finalise a room's doors: open new exits onto free cells (new rooms), and maybe connect to
   * adjacent rooms nobody has entered yet. Rooms already expanded never gain doors, so a room the
   * player has seen never changes. If the floor would run out of unexpanded rooms, an exit is forced.
   */
  expand(roomId: string): Expansion {
    const r = this.rooms.get(roomId);
    if (!r || r.expanded) return { infos: [], states: [] };
    r.expanded = true;
    this.touched.add(r.id);
    const lobby = r.tags.includes('lobby');
    const edges = this.freeEdges(r);
    let exits = r.doors.length;
    for (const { cell, d } of edges) {
      if (lobby && exits >= LOBBY_MAX_EXITS) break;
      if (!this.rng.chance(EXIT_CHANCE[Math.min(exits, EXIT_CHANCE.length - 1)]!)) continue;
      if (this.attachNew(cell, d)) exits++;
    }
    if (!lobby) {
      for (const cell of r.cells) {
        for (const d of DIRS) {
          const other = this.rooms.get(this.cells.get(cellKey(cell.cx + d.dx, cell.cy + d.dy)) ?? '');
          if (!other || other === r || other.expanded || other.tags.includes('lobby')) continue;
          if (r.doors.some((x) => x.toRoom === other.id)) continue;
          if (this.rng.chance(LOOP_CHANCE)) this.connect(cell, { cx: cell.cx + d.dx, cy: cell.cy + d.dy });
        }
      }
    }
    // Never strand the frontier: some room must remain that can still grow.
    if (![...this.rooms.values()].some((x) => !x.expanded)) {
      for (const { cell, d } of edges) if (this.attachNew(cell, d)) break;
    }
    return this.result();
  }

  /** Everything this builder created or changed, ready for a `roomsGenerated` command. */
  result(): Expansion {
    return {
      infos: [...this.touched].map((id) => structuredClone(this.rooms.get(id)!)),
      states: [...this.created].map((id) => initialRoomState(this.rooms.get(id)!)),
    };
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

/** A new floor: its lobby, already expanded (so its first neighbours exist). */
export function generateFloor(worldSeed: number, floorIndex: number): GeneratedFloor {
  const b = new FloorBuilder(floorIndex, worldSeed, undefined, 'lobby');
  const lobbyT = floorIndex === APARTMENT_FLOOR ? 'apartment' : floorIndex === 1 ? 'level1_lobby' : 'lower_lobby';
  const lobby = b.place(roomTemplates.get(lobbyT), false, false, [LOBBY_CELL]);
  // The apartment is one closed room in the real world: it never grows.
  if (floorIndex === APARTMENT_FLOOR) lobby.expanded = true;
  else b.expand(lobby.id);
  const { infos, states } = b.result();
  const floor: FloorState = {
    index: floorIndex,
    seed: deriveSeed(worldSeed, `floor${floorIndex}`),
    cells: Object.fromEntries(b.cells),
    rooms: Object.fromEntries(infos.map((r) => [r.id, r])),
    lobbyRoomId: lobby.id,
  };
  return { floor, rooms: states };
}

/** Expand a room of an existing floor (null when it's already expanded). */
export function expandRoom(floor: FloorState, worldSeed: number, roomId: string): Expansion | null {
  if (floor.rooms[roomId]?.expanded !== false) return null;
  return new FloorBuilder(floor.index, worldSeed, floor, `expand:${roomId}`).expand(roomId);
}

/** Stairs-down rooms generated so far on a floor. */
export function stairsDownRooms(floor: FloorState): RoomInfo[] {
  return Object.values(floor.rooms).filter((r) => r.tags.includes('stairsDown'));
}

/** A room's starting monsters: exactly the ones its template puts on its map. */
export function templateRoster(layout: RoomLayout): MonsterRecord[] {
  return layout.spawns.map((s) => ({ id: `s:${s.spawnId}`, defId: s.enemy, spawnId: s.spawnId }));
}

/** Build the initial persistent state for a freshly generated room. */
export function initialRoomState(info: RoomInfo): RoomState {
  const t = roomTemplates.get(info.templateId);
  const state: RoomState = {
    id: info.id,
    floor: info.floor,
    ownerId: t.startsOwned ? WORLD_OWNER : null,
    discovered: false,
    visited: false,
    monsters: [],
    barricades: {},
    tileOverrides: {},
    floorSurfaces: {},
    wallSurfaces: {},
    furniture: [],
    groundItems: [],
  };
  const layout = new RoomLayout(info, state);
  state.monsters = templateRoster(layout);
  placeMapFurniture(layout);
  return state;
}

/**
 * Add the furniture a template's map holds to a new room's state. A legend character marks the
 * footprint's top-left tile as the template is drawn; mirrored rooms mirror the spot and the facing.
 * Uids derive from the map coordinate (`<room>-map<mx>,<my>`).
 */
function placeMapFurniture(layout: RoomLayout): void {
  const { info, template: t, state } = layout;
  const legend = legendFor(t);
  let items = 0;
  const item = (id: string) => createItem(id, `${info.id}-item${items++}`);
  t.map.forEach((row, my) => {
    for (let mx = 0; mx < row.length; mx++) {
      const e = legend[row[mx]!];
      if (!e || !('furniture' in e)) continue;
      const def = furnitureReg.get(e.furniture);
      const { w, h } = footprint(def, e.rot ?? 0);
      const a = templateToGlobal(info, t, mx, my);
      const c = templateToGlobal(info, t, mx + w - 1, my + h - 1);
      state.furniture.push({
        uid: `${info.id}-map${mx},${my}`,
        defId: def.id,
        x: Math.min(a.x, c.x),
        y: Math.min(a.y, c.y),
        rot: mirrorFacing(e.rot ?? 0, info.mirrorX, info.mirrorY),
        contents: def.container
          ? Array.from({ length: def.container.slots }, (_, i) => {
              const entry = e.contents?.[i];
              if (!entry) return null;
              if (typeof entry === 'string') return item(entry);
              const kit = item(entry.id);
              if (kit.contents) entry.contents.forEach((id, j) => (kit.contents![j] = item(id)));
              return kit;
            })
          : undefined,
      });
    }
  });
  layout.rebuildFurniture();
}
