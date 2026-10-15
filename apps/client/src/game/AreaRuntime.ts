import { Container } from 'pixi.js';
import {
  AreaLayout, CELL_H, CELL_W, RoomLayout, inward, isOwnedBy, tileKey,
  type DoorInfo, type FurniturePlacement, type MovementKind, type RoomInfo, type RoomState, type TrajectoryKind, type WorldState,
} from '@df/shared';
import { lineClear, type PointBlockedFn, type Solid, type SolidsFn } from '../engine/collision';
import { RoomRenderer, furnitureArtHit, furnitureDepth } from '../render/RoomRenderer';
import type { Enemy } from './entities/Enemy';
import { Pathing } from './Pathing';

const TRAJECTORIES: ReadonlySet<string> = new Set<TrajectoryKind>(['straight', 'high', 'lobbed']);
/** Whether a mode `lineClear` asks about is a shot rather than a way of moving. */
const isTrajectory = (mode: TrajectoryKind | MovementKind): mode is TrajectoryKind => TRAJECTORIES.has(mode);
import type { GroundItemEntity } from './entities/GroundItemEntity';
import type { Projectile } from './entities/Projectile';
import type { Puddle } from './entities/Puddle';
import type { StaffNpc } from './entities/StaffNpc';
import type { TenantNpc } from './entities/TenantNpc';

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
  /** Patches on the floor that slow the player. */
  readonly puddles: Puddle[] = [];
  /** Tenants and applicants whose unit is in an active room. */
  readonly npcs: TenantNpc[] = [];
  /** Staff at work in the area (P7). */
  readonly staff: StaffNpc[] = [];
  /** Tiles just outside doors that lead out of the area (the partner door tiles) → door. */
  readonly exits = new Map<string, DoorInfo>();
  private beyond = new Map<string, RoomLayout>();
  /** The room the player is in. */
  currentId: string;

  /** How monsters find their way around the active rooms. */
  readonly paths = new Pathing(this);
  private blockers = new Map<string, SolidsFn>();

  /** `viewerId`: the player this runtime is shown to (ownership checks are from their point of view). */
  constructor(
    private readonly world: WorldState, readonly floor: number, roomIds: string[], currentId: string,
    private readonly layers: { floor: Container; entities: Container }, readonly viewerId: string,
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
   * The door out of the area whose doorway a tile outside it is in: the tile past the door, or the
   * one south of that, where the wall beside the doorway leaves floor to stand on behind it.
   */
  exitAt(tx: number, ty: number): DoorInfo | undefined {
    return this.exits.get(tileKey(tx, ty)) ?? this.exits.get(tileKey(tx, ty - 1));
  }

  /** The layout of a room behind an exit, for what is solid on the far side of its doorway. */
  private beyondLayout(roomId: string): RoomLayout | undefined {
    let L = this.beyond.get(roomId);
    const info = this.world.floors[this.floor]?.rooms[roomId], state = this.world.rooms[roomId];
    if (!L && info && state) this.beyond.set(roomId, (L = new RoomLayout(info, state)));
    return L;
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
      this.renderers.set(id, r);
    }
    if (added.length || removed.length) {
      this.layout.setActive(ids);
      this.paths.invalidate();
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
   * The solid boxes on a tile for a movement kind (whole tiles for walls, a piece's boxes for furniture).
   * Exits (door thresholds out of the area) are only passable to the player. Monsters walk through
   * doors inside the area.
   */
  blockerFor(kind: MovementKind, who: 'player' | 'enemy'): SolidsFn {
    const key = `${kind}:${who}`;
    let fn = this.blockers.get(key);
    if (!fn) {
      const whole = (tx: number, ty: number): Solid[] => [{ x: tx, y: ty, w: 1, h: 1 }];
      fn = (tx, ty) => {
        const k = this.layout.kindAt(tx, ty);
        if (k === 'void') {
          if (who !== 'player') return whole(tx, ty);
          if (this.exits.has(tileKey(tx, ty))) return [];
          // South of an exit the doorway is as open as the wall there leaves it: the room beyond says.
          const d = this.exits.get(tileKey(tx, ty - 1));
          return d ? this.beyondLayout(d.toRoom)?.solidsAt(tx, ty, kind) ?? whole(tx, ty) : whole(tx, ty);
        }
        if (who === 'enemy' && k === 'door' && !this.isInternalDoor(tx, ty)) return whole(tx, ty);
        return this.layout.solidsAt(tx, ty, kind);
      };
      this.blockers.set(key, fn);
    }
    return fn;
  }

  /** The front-most piece of furniture whose art is drawn at a world point (tiles), if any. */
  furnitureAtPoint(x: number, y: number): FurniturePlacement | undefined {
    let best: FurniturePlacement | undefined, bestZ = -Infinity;
    for (const f of this.layout.furniture()) {
      const base = this.layout.onTopOf(f);
      const z = furnitureDepth(f, base);
      if (z > bestZ && furnitureArtHit(f, base, x, y)) [best, bestZ] = [f, z];
    }
    return best;
  }

  /** Whether a point (tiles) is inside something solid for a mover. */
  blockedAt(x: number, y: number, kind: MovementKind, who: 'player' | 'enemy'): boolean {
    return this.blockerFor(kind, who)(Math.floor(x), Math.floor(y)).some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  }

  projectileBlocked(x: number, y: number, t: TrajectoryKind): boolean {
    return this.layout.blocksProjectileAt(x, y, t);
  }

  lineClear(ax: number, ay: number, bx: number, by: number, mode: TrajectoryKind | MovementKind): boolean {
    const blocked: PointBlockedFn =
      isTrajectory(mode)
        ? (x, y) => this.layout.blocksProjectileAt(x, y, mode)
        : (x, y) => this.blockedAt(x, y, mode, 'enemy') || !!this.layout.obstacleAt(Math.floor(x), Math.floor(y))?.hazard?.affects.includes(mode);
    return lineClear(ax, ay, bx, by, blocked);
  }

  /**
   * Whether a monster moving this way may stand on a tile, for pathing and spawn spots: inside the area
   * (not past a door out of it), not blocked for its kind, and not a hazard to it (walkers go round
   * broken glass; flyers cross it, and holes, and short walls).
   */
  passable(tx: number, ty: number, kind: MovementKind): boolean {
    const k = this.layout.kindAt(tx, ty);
    if (k === 'void' || (k === 'door' && !this.isInternalDoor(tx, ty))) return false;
    if (this.layout.blocksMovement(tx, ty, kind)) return false;
    return !this.layout.obstacleAt(tx, ty)?.hazard?.affects.includes(kind);
  }

  /** Move-speed multiplier for the player at a point: the worst puddle they're standing in. */
  slowAt(x: number, y: number): number {
    let slow = 1;
    for (const p of this.puddles) if (p.contains(x, y)) slow = Math.min(slow, p.def.slow);
    return slow;
  }

  randomOpenTile(filter: (x: number, y: number) => boolean, kind: MovementKind = 'walk'): { x: number; y: number } | null {
    const tiles: { x: number; y: number }[] = [];
    for (const t of this.layout.tiles()) {
      if (t.kind !== 'floor' || !this.passable(t.x, t.y, kind)) continue;
      if (filter(t.x, t.y)) tiles.push(t);
    }
    return tiles.length ? tiles[Math.floor(Math.random() * tiles.length)]! : null;
  }

  destroy(): void {
    for (const r of this.renderers.values()) r.destroy();
    this.renderers.clear();
    for (const e of this.enemies) e.view.destroy({ children: true });
    for (const p of this.projectiles) p.view.destroy({ children: true });
    for (const p of this.puddles) p.view.destroy({ children: true });
    for (const i of this.items) i.view.destroy({ children: true });
    for (const n of this.npcs) n.view.destroy({ children: true });
    for (const s of this.staff) s.view.destroy({ children: true });
  }
}
