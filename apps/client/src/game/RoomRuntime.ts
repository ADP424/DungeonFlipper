import { Container } from 'pixi.js';
import {
  RoomLayout, inward, tileKey, type DoorInfo, type MovementKind, type RoomInfo, type RoomState, type TrajectoryKind,
} from '@df/shared';
import { lineClear, type BlockedFn } from '../engine/collision';
import { RoomRenderer } from '../render/RoomRenderer';
import type { Enemy } from './entities/Enemy';
import type { GroundItemEntity } from './entities/GroundItemEntity';
import type { Projectile } from './entities/Projectile';

const DIRS8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Runtime state of the room the player is in: entities, collision queries, pathing, visuals. */
export class RoomRuntime {
  readonly layout: RoomLayout;
  readonly renderer: RoomRenderer;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly items: GroundItemEntity[] = [];
  /** Tiles just outside this room's doors (the partner door tiles) → door. */
  readonly exits = new Map<string, DoorInfo>();
  /** Decides whether the player may walk through a given exit (e.g. not while carrying into unowned rooms). */
  exitAllowed: (door: DoorInfo) => boolean = () => true;

  private flow: Int32Array;
  private flowFrom = '';
  private flowAge = 0;
  private blockers = new Map<string, BlockedFn>();
  player!: { x: number; y: number };

  constructor(readonly info: RoomInfo, state: RoomState, readonly entityLayer: Container) {
    this.layout = new RoomLayout(info, state);
    for (const d of info.doors) {
      const [ix, iy] = inward(d.dir);
      this.exits.set(tileKey(d.x - ix, d.y - iy), d);
    }
    this.renderer = new RoomRenderer(this.layout, entityLayer);
    this.flow = new Int32Array(this.layout.w * this.layout.h);
  }

  get owned(): boolean {
    return this.layout.state.owned;
  }

  /**
   * Collision function for a movement kind. Exits (door thresholds into the next room) are only
   * passable to the player, and only when `exitAllowed` says so.
   */
  blockerFor(kind: MovementKind, who: 'player' | 'enemy'): BlockedFn {
    const key = `${kind}:${who}`;
    let fn = this.blockers.get(key);
    if (!fn) {
      fn = (tx, ty) => {
        if (!this.layout.inBounds(tx, ty) || this.layout.kindAt(tx, ty) === 'void') {
          const door = this.exits.get(tileKey(tx, ty));
          return !(door && who === 'player' && this.exitAllowed(door));
        }
        if (who === 'enemy' && this.layout.kindAt(tx, ty) === 'door') return true;
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

  /** BFS distance field to the player over walkable, hazard-free tiles. */
  updateFlow(dt: number): void {
    this.flowAge += dt;
    const px = Math.floor(this.player.x), py = Math.floor(this.player.y);
    const from = `${px},${py}`;
    if (from === this.flowFrom && this.flowAge < 0.5) return;
    this.flowFrom = from;
    this.flowAge = 0;
    this.flow.fill(-1);
    if (!this.layout.inBounds(px, py)) return;
    const L = this.layout;
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
      if (this.walkBlocked(nx, ny, e.movementKind) || this.layout.kindAt(nx, ny) !== 'floor') continue;
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
    this.renderer.destroy();
    for (const e of this.enemies) e.view.destroy({ children: true });
    for (const p of this.projectiles) p.view.destroy({ children: true });
    for (const i of this.items) i.view.destroy({ children: true });
  }
}
