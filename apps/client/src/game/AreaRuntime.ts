import { Container } from 'pixi.js';
import {
  AreaLayout, CELL_H, CELL_W, inward, isOwnedBy, tileKey,
  type DoorInfo, type MovementKind, type RoomInfo, type RoomState, type TrajectoryKind, type WorldState,
} from '@df/shared';
import { lineClear, type BlockedFn } from '../engine/collision';
import { RoomRenderer } from '../render/RoomRenderer';
import type { Enemy } from './entities/Enemy';
import type { GroundItemEntity } from './entities/GroundItemEntity';
import type { Projectile } from './entities/Projectile';
import type { TenantNpc } from './entities/TenantNpc';

const DIRS8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Runtime state of the area the player is in: a single dungeon room, or the whole estate (every
 * connected room you own, walked through seamlessly). Holds the live entities, collision queries,
 * pathing and visuals. Only *active* rooms (near the camera) have renderers and live monsters; the
 * game streams rooms in and out as the camera moves (`Game.updateStreaming`).
 */
export class AreaRuntime {
  readonly layout: AreaLayout;
  readonly renderers = new Map<string, RoomRenderer>();
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly items: GroundItemEntity[] = [];
  /** Tenants and applicants whose unit is in an active room. */
  readonly npcs: TenantNpc[] = [];
  /** Tiles just outside doors that lead out of the area (the partner door tiles) → door. */
  readonly exits = new Map<string, DoorInfo>();
  /** Decides whether the player may walk through a given exit (e.g. not while carrying into unowned rooms). */
  /** The room the player is in. */
  currentId: string;

  private flow: Int32Array = new Int32Array(1);
  private flowFrom = '';
  private flowAge = 0;
  private blockers = new Map<string, BlockedFn>();
  player!: { x: number; y: number };

  /** `viewerId`: the player this runtime is shown to (ownership checks are from their point of view). */
  constructor(
    private readonly world: WorldState, readonly floor: number, roomIds: string[], currentId: string,
    private readonly layers: { floor: Container; walls: Container; entities: Container }, readonly viewerId: string,
  ) {
    this.layout = new AreaLayout(world, floor, roomIds);
    this.currentId = currentId;
    for (const L of this.layout.layouts.values()) {
      for (const d of L.info.doors) {
        if (this.layout.layouts.has(d.toRoom)) continue;
        const [ix, iy] = inward(d.dir);
        this.exits.set(tileKey(d.x - ix, d.y - iy), d);
      }
    }
    this.layout.setActive([]);
  }

  /** More than one room, or your property: the camera roams instead of framing one room. */
  get isEstate(): boolean {
    return this.layout.layouts.size > 1 || !!this.state.ownerId;
  }

  /** The room the player is in. */
  get info(): RoomInfo {
    return this.layout.layouts.get(this.currentId)!.info;
  }

  get state(): RoomState {
    return this.world.rooms[this.currentId]!;
  }

  roomIdAt(x: number, y: number): string | undefined {
    return this.layout.roomAt(x, y)?.info.id;
  }

  /** The player's room is theirs (renovation, furnishing, the ambient light). */
  get owned(): boolean {
    return isOwnedBy(this.state, this.viewerId);
  }

  /** The player's room is unowned and empty. */
  get cleared(): boolean {
    return this.clearedRoom(this.currentId);
  }

  ownedAt(x: number, y: number): boolean {
    const id = this.roomIdAt(x, y);
    return !!id && isOwnedBy(this.world.rooms[id], this.viewerId);
  }

  /** The room at a tile is unowned with nothing in it: you may barricade it, claim it, and haul its furniture. */
  clearedAt(x: number, y: number): boolean {
    const id = this.roomIdAt(x, y);
    return !!id && this.clearedRoom(id);
  }

  private clearedRoom(id: string): boolean {
    const st = this.world.rooms[id];
    return !!st && !st.ownerId && st.monsters.length === 0 && !this.enemies.some((e) => !e.dead && e.roomId === id);
  }

  /** No live enemies in the room at a tile. */
  calmAt(x: number, y: number): boolean {
    const id = this.roomIdAt(x, y);
    return !this.enemies.some((e) => !e.dead && (!id || e.roomId === id));
  }

  /** A door tile whose other side is in this area (walkable straight through). */
  isInternalDoor(x: number, y: number): boolean {
    const d = this.layout.roomAt(x, y)?.info.doors.find((o) => o.x === x && o.y === y);
    return !!d && this.layout.layouts.has(d.toRoom);
  }

  /**
   * Switch the active rooms (those near the camera): renderers are created and destroyed to match,
   * and pathing covers the new bounds. Returns which rooms came and went; the game spawns and parks
   * their entities.
   */
  setActive(ids: string[]): { added: string[]; removed: string[] } {
    const want = new Set(ids);
    const removed = [...this.renderers.keys()].filter((id) => !want.has(id));
    const added = ids.filter((id) => !this.renderers.has(id));
    for (const id of removed) {
      this.renderers.get(id)!.destroy();
      this.renderers.delete(id);
    }
    for (const id of added) {
      const r = new RoomRenderer(this.layout.layouts.get(id)!, this.layers.entities);
      this.layers.floor.addChild(r.floor);
      this.layers.walls.addChild(r.walls);
      this.renderers.set(id, r);
    }
    if (added.length || removed.length) {
      this.layout.setActive(ids);
      this.flow = new Int32Array(this.layout.w * this.layout.h);
      this.flowFrom = '';
    }
    return { added, removed };
  }

  /** Rooms whose cells come within a cell of the view rectangle (in tiles). */
  roomsNear(view: { x: number; y: number; w: number; h: number }): string[] {
    const out: string[] = [];
    const x0 = view.x - CELL_W, y0 = view.y - CELL_H, x1 = view.x + view.w + CELL_W, y1 = view.y + view.h + CELL_H;
    for (const L of this.layout.layouts.values()) {
      const hit = L.info.cells.some((c) => {
        const cx = c.cx * CELL_W, cy = c.cy * CELL_H;
        return cx < x1 && cx + CELL_W > x0 && cy < y1 && cy + CELL_H > y0;
      });
      if (hit || L.info.id === this.currentId) out.push(L.info.id);
    }
    return out;
  }

  /** Redraw one room's tiles (after renovation), if it's active. */
  rebuildRoom(id: string): void {
    this.renderers.get(id)?.rebuild();
  }

  syncFurniture(): void {
    for (const r of this.renderers.values()) r.syncFurniture();
  }

  /**
   * Collision function for a movement kind. Exits (door thresholds out of the area) are only passable
   * to the player. Monsters walk through doors inside the area.
   */
  blockerFor(kind: MovementKind, who: 'player' | 'enemy'): BlockedFn {
    const key = `${kind}:${who}`;
    let fn = this.blockers.get(key);
    if (!fn) {
      fn = (tx, ty) => {
        const k = this.layout.kindAt(tx, ty);
        if (k === 'void') {
          const door = this.exits.get(tileKey(tx, ty));
          return !(door && who === 'player');
        }
        if (who === 'enemy' && k === 'door' && !this.isInternalDoor(tx, ty)) return true;
        return this.layout.blocksMovement(tx, ty, kind);
      };
      this.blockers.set(key, fn);
    }
    return fn;
  }

  projectileBlocked(x: number, y: number, t: TrajectoryKind): boolean {
    return this.layout.blocksProjectile(Math.floor(x), Math.floor(y), t);
  }

  lineClear(ax: number, ay: number, bx: number, by: number, mode: TrajectoryKind | MovementKind): boolean {
    const blocked: BlockedFn =
      mode === 'straight' || mode === 'lobbed'
        ? (tx, ty) => this.layout.blocksProjectile(tx, ty, mode)
        : (tx, ty) => this.walkBlocked(tx, ty, mode);
    return lineClear(ax, ay, bx, by, blocked);
  }

  /** Walkers path around hazards too. */
  private walkBlocked(tx: number, ty: number, kind: MovementKind): boolean {
    if (this.layout.blocksMovement(tx, ty, kind)) return true;
    const o = this.layout.obstacleAt(tx, ty);
    return !!o?.hazard?.affects.includes(kind);
  }

  private idx(x: number, y: number): number {
    return (y - this.layout.originY) * this.layout.w + (x - this.layout.originX);
  }

  /** BFS distance field to the player over walkable, hazard-free tiles of the active rooms. */
  updateFlow(dt: number): void {
    this.flowAge += dt;
    const px = Math.floor(this.player.x), py = Math.floor(this.player.y);
    const from = `${px},${py}`;
    if (from === this.flowFrom && this.flowAge < 0.5) return;
    this.flowFrom = from;
    this.flowAge = 0;
    this.flow.fill(-1);
    const L = this.layout;
    if (!L.inBounds(px, py)) return;
    const qx: number[] = [px], qy: number[] = [py];
    this.flow[this.idx(px, py)] = 0;
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h]!, y = qy[h]!;
      const d = this.flow[this.idx(x, y)]!;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (!L.inBounds(nx, ny) || this.flow[this.idx(nx, ny)] !== -1) continue;
        if (this.walkBlocked(nx, ny, 'walk')) continue;
        if (dx && dy && (this.walkBlocked(x + dx, y, 'walk') || this.walkBlocked(x, y + dy, 'walk'))) continue;
        this.flow[this.idx(nx, ny)] = d + 1;
        qx.push(nx);
        qy.push(ny);
      }
    }
  }

  flowAt(x: number, y: number): number {
    return this.layout.inBounds(x, y) ? this.flow[this.idx(x, y)]! : -1;
  }

  /** Unit direction an enemy should move to reach the player. */
  pathDir(e: Enemy): { x: number; y: number } {
    const dx = this.player.x - e.x, dy = this.player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const direct = { x: dx / d, y: dy / d };
    if (e.movementKind === 'fly' || this.lineClear(e.x, e.y, this.player.x, this.player.y, 'walk')) return direct;
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    let best = this.flowAt(tx, ty);
    let bx = 0, by = 0;
    for (const [ox, oy] of DIRS8) {
      const v = this.flowAt(tx + ox, ty + oy);
      if (v < 0) continue;
      if (ox && oy && (this.flowAt(tx + ox, ty) < 0 || this.flowAt(tx, ty + oy) < 0)) continue;
      if (best < 0 || v < best) {
        best = v;
        bx = tx + ox;
        by = ty + oy;
      }
    }
    if (bx === 0 && by === 0) return direct;
    const vx = bx + 0.5 - e.x, vy = by + 0.5 - e.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: vx / l, y: vy / l };
  }

  /** Next orthogonal tile for grid-stepping enemies. */
  nextGridStep(e: Enemy): { x: number; y: number } | null {
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    const here = this.flowAt(tx, ty);
    const options: { x: number; y: number; v: number }[] = [];
    for (const [dx, dy] of DIRS8.slice(0, 4)) {
      const nx = tx + dx, ny = ty + dy;
      const k = this.layout.kindAt(nx, ny);
      if (this.walkBlocked(nx, ny, e.movementKind) || (k !== 'floor' && !(k === 'door' && this.isInternalDoor(nx, ny)))) continue;
      options.push({ x: nx, y: ny, v: this.flowAt(nx, ny) });
    }
    if (!options.length) return null;
    const better = options.filter((o) => o.v >= 0 && (here < 0 || o.v < here));
    const pool = better.length && Math.random() < 0.85 ? better : options;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  randomOpenTile(filter: (x: number, y: number) => boolean, kind: MovementKind = 'walk'): { x: number; y: number } | null {
    const tiles: { x: number; y: number }[] = [];
    for (const t of this.layout.tiles()) {
      if (t.kind !== 'floor' || this.walkBlocked(t.x, t.y, kind)) continue;
      if (filter(t.x, t.y)) tiles.push(t);
    }
    return tiles.length ? tiles[Math.floor(Math.random() * tiles.length)]! : null;
  }

  destroy(): void {
    for (const r of this.renderers.values()) r.destroy();
    this.renderers.clear();
    for (const e of this.enemies) e.view.destroy({ children: true });
    for (const p of this.projectiles) p.view.destroy({ children: true });
    for (const i of this.items) i.view.destroy({ children: true });
    for (const n of this.npcs) n.view.destroy({ children: true });
  }
}
