import { CELL_H, CELL_W, TILE_PX } from '../core/constants';
import { tileKey } from '../core/geometry';
import { legendFor, templateMapSize } from '../content';
import { BACKROOMS_SURFACES } from './difficulty';
import { furniture as furnitureReg, obstacles, roomTemplates } from '../content/registry';
import type { CellCoord, FurnitureDef, MovementKind, ObstacleDef, RoomTemplateDef, TrajectoryKind } from '../content/types';
import type { Barricade, Dir, FurniturePlacement, MonsterRecord, RoomInfo, RoomState } from './types';
import { solidBoxes, type Box } from './furniture';

/** Whether the player can walk through a barricade of each tier (mirrors securing.ts's BARRICADE_TIERS). */
const BARRICADE_PASSABLE: Record<number, boolean> = { 1: false, 2: true, 3: true, 4: true };

export type TileKind = 'void' | 'floor' | 'door';

export interface SpawnPoint {
  spawnId: string;
  /** The enemy the template puts here. */
  enemy: string;
  /** Global tile coords of the spawn tile centre. */
  x: number;
  y: number;
}

export const BOUNDARY_WALL = 'backrooms_wall';

export const cellKey = (cx: number, cy: number): string => `${cx},${cy}`;

/**
 * A placement's `rot` is its facing: quarter turns clockwise seen from above, starting from facing the
 * camera. South and north have their own art; east and west share a side view, mirrored (see the
 * client's `furnitureArt`). Odd facings swap the footprint.
 */
export const FACINGS = ['south', 'west', 'north', 'east'] as const;
export type Facing = (typeof FACINGS)[number];

export function footprint(def: FurnitureDef, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w: def.size.w, h: def.size.h } : { w: def.size.h, h: def.size.w };
}

export function mirrorCells(cells: CellCoord[], mx: boolean, my: boolean): CellCoord[] {
  const maxCx = Math.max(...cells.map((c) => c.cx));
  const maxCy = Math.max(...cells.map((c) => c.cy));
  return cells.map((c) => ({ cx: mx ? maxCx - c.cx : c.cx, cy: my ? maxCy - c.cy : c.cy }));
}

/** Map a template map coordinate to a global tile coordinate for a placed room. */
export function templateToGlobal(info: RoomInfo, t: RoomTemplateDef, mx: number, my: number): { x: number; y: number } {
  const { w, h } = templateMapSize(t);
  const tx = info.mirrorX ? w - 1 - mx : mx;
  const ty = info.mirrorY ? h - 1 - my : my;
  const minCx = Math.min(...info.cells.map((c) => c.cx));
  const minCy = Math.min(...info.cells.map((c) => c.cy));
  return { x: minCx * CELL_W + 1 + tx, y: minCy * CELL_H + 1 + ty };
}

/**
 * Effective tile grid of one room: template + boundary walls + doors + persistent overrides + furniture.
 * Everything is in global floor tile coordinates so rooms can later be merged by unioning cells.
 */
export class RoomLayout {
  readonly originX: number;
  readonly originY: number;
  readonly w: number;
  readonly h: number;
  readonly template: RoomTemplateDef;
  private kinds: TileKind[];
  private baseObstacles: (string | null)[];
  /** Tiles on the room's outer wall line (doors included). */
  private boundary = new Set<number>();
  readonly spawns: SpawnPoint[] = [];
  /** Door tile and the tile just inside it: nothing may be built there. */
  readonly reserved = new Set<string>();
  private furnitureAt = new Map<string, FurniturePlacement>();
  /** Floor-standing furniture's solid boxes (world tiles), clipped to each tile they cover. */
  private furnitureSolids = new Map<string, { def: FurnitureDef; box: Box }[]>();
  /** Small furniture standing on a tabletop, by tile (see `rebuildFurniture`). */
  private topAt = new Map<string, FurniturePlacement>();
  private cellSet: Set<string>;

  constructor(readonly info: RoomInfo, public state: RoomState) {
    this.template = roomTemplates.get(info.templateId);
    this.cellSet = new Set(info.cells.map((c) => cellKey(c.cx, c.cy)));
    const minCx = Math.min(...info.cells.map((c) => c.cx));
    const minCy = Math.min(...info.cells.map((c) => c.cy));
    const maxCx = Math.max(...info.cells.map((c) => c.cx));
    const maxCy = Math.max(...info.cells.map((c) => c.cy));
    this.originX = minCx * CELL_W;
    this.originY = minCy * CELL_H;
    this.w = (maxCx - minCx + 1) * CELL_W;
    this.h = (maxCy - minCy + 1) * CELL_H;
    this.kinds = new Array(this.w * this.h).fill('void');
    this.baseObstacles = new Array(this.w * this.h).fill(null);

    // 1. Cells → floor, with boundary walls on edges not shared with another cell of this room.
    for (const c of info.cells) {
      for (let ly = 0; ly < CELL_H; ly++) {
        for (let lx = 0; lx < CELL_W; lx++) {
          const gx = c.cx * CELL_W + lx;
          const gy = c.cy * CELL_H + ly;
          const i = this.idx(gx, gy);
          this.kinds[i] = 'floor';
          const wall =
            (lx === 0 && !this.hasCell(c.cx - 1, c.cy)) ||
            (lx === CELL_W - 1 && !this.hasCell(c.cx + 1, c.cy)) ||
            (ly === 0 && !this.hasCell(c.cx, c.cy - 1)) ||
            (ly === CELL_H - 1 && !this.hasCell(c.cx, c.cy + 1));
          if (wall) {
            this.baseObstacles[i] = BOUNDARY_WALL;
            this.boundary.add(i);
          }
        }
      }
    }

    // 2. Template map (ignored on boundary walls and void).
    const legend = legendFor(this.template);
    this.template.map.forEach((row, my) => {
      for (let mx = 0; mx < row.length; mx++) {
        const e = legend[row[mx]!];
        // Map furniture lives in the room state (placed by the generator), not in the layout.
        if (!e || 'floor' in e || 'furniture' in e) continue;
        const { x, y } = templateToGlobal(info, this.template, mx, my);
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.kinds[i] !== 'floor' || this.boundary.has(i)) continue;
        if ('obstacle' in e) this.baseObstacles[i] = e.obstacle;
        else this.spawns.push({ spawnId: `${mx},${my}`, enemy: e.enemy, x: x + 0.5, y: y + 0.5 });
      }
    });

    // 3. Doors: punch through boundary walls and keep their approach clear.
    for (const d of info.doors) {
      const i = this.idx(d.x, d.y);
      this.kinds[i] = 'door';
      this.baseObstacles[i] = null;
      const [ix, iy] = inward(d.dir);
      this.reserved.add(tileKey(d.x, d.y));
      this.reserved.add(tileKey(d.x + ix, d.y + iy));
      if (this.inBounds(d.x + ix, d.y + iy)) this.baseObstacles[this.idx(d.x + ix, d.y + iy)] = null;
    }

    this.rebuildFurniture();
  }

  private hasCell(cx: number, cy: number): boolean {
    return this.cellSet.has(cellKey(cx, cy));
  }

  inBounds(x: number, y: number): boolean {
    return x >= this.originX && y >= this.originY && x < this.originX + this.w && y < this.originY + this.h;
  }

  private idx(x: number, y: number): number {
    return (y - this.originY) * this.w + (x - this.originX);
  }

  kindAt(x: number, y: number): TileKind {
    return this.inBounds(x, y) ? this.kinds[this.idx(x, y)]! : 'void';
  }

  /** Effective floor surface: the tile's own (rolled-on) surface, else the room's default. */
  floorSurfaceAt(x: number, y: number): string {
    return this.state.floorSurfaces[tileKey(x, y)] ?? this.template.floorSurface ?? BACKROOMS_SURFACES.floor;
  }

  /** Effective wallpaper of a wall tile (undefined for non-walls): its own, else the room's default. */
  wallSurfaceAt(x: number, y: number): string | undefined {
    if (!this.obstacleAt(x, y)?.isWall) return undefined;
    return this.state.wallSurfaces[tileKey(x, y)] ?? this.template.wallSurface ?? BACKROOMS_SURFACES.wall;
  }

  isBoundary(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.boundary.has(i) && this.baseObstacles[i] === BOUNDARY_WALL;
  }

  /** Effective obstacle id at a tile (overrides applied). */
  obstacleIdAt(x: number, y: number): string | null {
    if (!this.inBounds(x, y)) return null;
    const k = tileKey(x, y);
    if (k in this.state.tileOverrides) return this.state.tileOverrides[k] ?? null;
    return this.baseObstacles[this.idx(x, y)] ?? null;
  }

  obstacleAt(x: number, y: number): ObstacleDef | undefined {
    return obstacles.tryGet(this.obstacleIdAt(x, y));
  }

  /** The furniture you'd reach for on a tile: what stands on a tabletop first, else what stands on the floor. */
  furnitureAtTile(x: number, y: number): FurniturePlacement | undefined {
    const k = tileKey(x, y);
    return this.topAt.get(k) ?? this.furnitureAt.get(k);
  }

  /** The tabletop furniture a small piece stands on, if it's on one. */
  onTopOf(f: FurniturePlacement): FurniturePlacement | undefined {
    const k = tileKey(f.x, f.y);
    return this.topAt.get(k) === f ? this.furnitureAt.get(k) : undefined;
  }

  /**
   * Index furniture by tile. Floor-standing pieces first; then small ones, which stand on a free
   * tabletop under them if there is one (one each), else on the floor. A small piece whose table was
   * carried off ends up on the floor.
   */
  rebuildFurniture(): void {
    this.furnitureAt.clear();
    this.furnitureSolids.clear();
    this.topAt.clear();
    const small = (f: FurniturePlacement) => !!furnitureReg.get(f.defId).small;
    for (const f of [...this.state.furniture.filter((f) => !small(f)), ...this.state.furniture.filter(small)]) {
      const def = furnitureReg.get(f.defId);
      const k = tileKey(f.x, f.y);
      const base = this.furnitureAt.get(k);
      if (def.small && base && furnitureReg.get(base.defId).tabletop !== undefined && !this.topAt.has(k)) {
        this.topAt.set(k, f);
        continue;
      }
      const { w, h } = footprint(def, f.rot);
      for (let y = f.y; y < f.y + h; y++) for (let x = f.x; x < f.x + w; x++) this.furnitureAt.set(tileKey(x, y), f);
      for (const b of solidBoxes(def, f)) {
        for (let y = Math.floor(b.y); y < b.y + b.h; y++) {
          for (let x = Math.floor(b.x); x < b.x + b.w; x++) {
            const x0 = Math.max(x, b.x), y0 = Math.max(y, b.y), x1 = Math.min(x + 1, b.x + b.w), y1 = Math.min(y + 1, b.y + b.h);
            if (x1 <= x0 || y1 <= y0) continue;
            const k = tileKey(x, y);
            const list = this.furnitureSolids.get(k) ?? [];
            list.push({ def, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
            this.furnitureSolids.set(k, list);
          }
        }
      }
    }
  }

  /** The barricade on a door tile of this room, if any. */
  barricadeAt(x: number, y: number): Barricade | undefined {
    return this.kindAt(x, y) === 'door' ? this.state.barricades[tileKey(x, y)] : undefined;
  }

  /**
   * The solid part of a tile that blocks as a whole: all of it, or for an obstacle with a `depth` and
   * nothing standing behind it (to the north), only that much at the tile's south edge.
   */
  tileSolid(x: number, y: number): Box {
    const depth = (this.obstacleAt(x, y)?.depth ?? TILE_PX) / TILE_PX;
    const behind = this.obstacleAt(x, y - 1);
    const open = depth < 1 && this.kindAt(x, y) !== 'void' && this.kindAt(x, y - 1) !== 'void' && (!behind || behind.height === 'none');
    return open ? { x, y: y + 1 - depth, w: 1, h: depth } : { x, y, w: 1, h: 1 };
  }

  /**
   * Where a standing tile sorts in depth among actors (who sort by their feet): the back edge of the
   * floor it stands on, so only what is behind that is drawn under it, never a body beside it. A wall
   * that is solid throughout but runs on east or west into one with a back takes that one's edge:
   * what is behind a wall is behind the corner it ends in too.
   */
  backEdge(x: number, y: number): number {
    for (const dx of [0, -1, 1]) {
      const o = this.obstacleAt(x + dx, y);
      if (o && o.height !== 'none' && this.tileSolid(x + dx, y).y > y) return this.tileSolid(x + dx, y).y;
    }
    return y;
  }

  /** Whole-tile blockers for walking: void, planks, obstacles (furniture is boxes, see `solidsAt`). */
  private tileBlocksMovement(x: number, y: number, kind: MovementKind): boolean {
    const k = this.kindAt(x, y);
    if (k === 'void') return true;
    // Planks block everyone; proper doors open for the player (enemies never cross doors anyway).
    const b = this.barricadeAt(x, y);
    if (b && !BARRICADE_PASSABLE[b.tier]) return true;
    const o = this.obstacleAt(x, y);
    return !!o && o.blocksMovement.includes(kind);
  }

  private tileBlocksProjectile(x: number, y: number, trajectory: TrajectoryKind): boolean {
    const k = this.kindAt(x, y);
    if (k === 'void') return true;
    if (k === 'door') return !!this.barricadeAt(x, y);
    const o = this.obstacleAt(x, y);
    return !!o && o.blocksProjectiles.includes(trajectory);
  }

  /** Whether a point (tiles) is inside a solid furniture box that `test` says blocks. */
  private furnitureSolidAt(px: number, py: number, test: (def: FurnitureDef) => boolean): boolean {
    const list = this.furnitureSolids.get(tileKey(Math.floor(px), Math.floor(py)));
    return !!list?.some(({ def, box: b }) => test(def) && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h);
  }

  /**
   * Whether a tile counts as blocked as a whole (pathing, spawn spots, room checks): a whole-tile
   * blocker, or furniture solid at the tile's centre. A lamp solid only at its base doesn't block its tile.
   */
  blocksMovement(x: number, y: number, kind: MovementKind): boolean {
    return this.tileBlocksMovement(x, y, kind) || this.furnitureSolidAt(x + 0.5, y + 0.5, (d) => d.blocksMovement.includes(kind));
  }

  /** The solid shapes on a tile for a walker or flyer (world tiles): the tile's own (`tileSolid`), or furniture's boxes. */
  solidsAt(x: number, y: number, kind: MovementKind): Box[] {
    if (this.tileBlocksMovement(x, y, kind)) return [this.tileSolid(x, y)];
    return (this.furnitureSolids.get(tileKey(x, y)) ?? []).filter(({ def }) => def.blocksMovement.includes(kind)).map(({ box }) => box);
  }

  /** Whether a tile counts as blocked to projectiles as a whole (see `blocksMovement`). */
  blocksProjectile(x: number, y: number, trajectory: TrajectoryKind): boolean {
    return this.tileBlocksProjectile(x, y, trajectory) || this.furnitureSolidAt(x + 0.5, y + 0.5, (d) => d.blocksProjectiles.includes(trajectory));
  }

  /** Whether a projectile at a point (tiles) is stopped there. */
  blocksProjectileAt(px: number, py: number, trajectory: TrajectoryKind): boolean {
    const x = Math.floor(px), y = Math.floor(py);
    if (this.tileBlocksProjectile(x, y, trajectory)) return py >= this.tileSolid(x, y).y;
    return this.furnitureSolidAt(px, py, (d) => d.blocksProjectiles.includes(trajectory));
  }

  /** True when the tile is plain floor: no obstacle, no furniture, not void. */
  isOpenFloor(x: number, y: number): boolean {
    return this.kindAt(x, y) === 'floor' && !this.obstacleIdAt(x, y) && !this.furnitureAt.has(tileKey(x, y));
  }

  /** Whether furniture / a wall may be placed on this tile. */
  isBuildable(x: number, y: number): boolean {
    return this.isOpenFloor(x, y) && !this.reserved.has(tileKey(x, y));
  }

  canPlaceFurniture(def: FurnitureDef, x: number, y: number, rot: number): boolean {
    const { w, h } = footprint(def, rot);
    if (def.small && w === 1 && h === 1) {
      const k = tileKey(x, y);
      const base = this.furnitureAt.get(k);
      if (base && furnitureReg.get(base.defId).tabletop !== undefined && !this.topAt.has(k)) return true;
    }
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (!this.isBuildable(tx, ty)) return false;
    return true;
  }

  /** Nearest placement (top-left) for a footprint around a tile, searching outward. */
  findFurnitureSpot(def: FurnitureDef, nearX: number, nearY: number, rot = 0): { x: number; y: number } | null {
    const { w, h } = footprint(def, rot);
    const sx = Math.floor(nearX - (w - 1) / 2);
    const sy = Math.floor(nearY - (h - 1) / 2);
    for (let r = 0; r < Math.max(this.w, this.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.canPlaceFurniture(def, sx + dx, sy + dy, rot)) return { x: sx + dx, y: sy + dy };
        }
      }
    }
    return null;
  }

  /** Iterate all non-void tiles. */
  *tiles(): Generator<{ x: number; y: number; kind: TileKind }> {
    for (let y = this.originY; y < this.originY + this.h; y++) {
      for (let x = this.originX; x < this.originX + this.w; x++) {
        const kind = this.kinds[this.idx(x, y)]!;
        if (kind !== 'void') yield { x, y, kind };
      }
    }
  }

  /**
   * Where each roster monster appears when the room loads: its template spawn tile, or (for monsters
   * without one) the open floor tile nearest the room's centre.
   */
  rosterPlacements(): { record: MonsterRecord; x: number; y: number }[] {
    const spawnAt = new Map(this.spawns.map((s) => [s.spawnId, s]));
    let fallback: { x: number; y: number } | null | undefined;
    const out: { record: MonsterRecord; x: number; y: number }[] = [];
    for (const record of this.state.monsters) {
      const sp = record.spawnId ? spawnAt.get(record.spawnId) : undefined;
      if (sp) {
        out.push({ record, x: sp.x, y: sp.y });
        continue;
      }
      const door = record.door ? this.info.doors.find((d) => `${d.x},${d.y}` === record.door) : undefined;
      if (door) {
        const [ix, iy] = inward(door.dir);
        const t = this.nearestOpenFloor(door.x + ix * 2 + 0.5, door.y + iy * 2 + 0.5);
        if (t) {
          out.push({ record, x: t.x + 0.5, y: t.y + 0.5 });
          continue;
        }
      } else if (record.door) {
        // Came in through a knocked-through wall: just inside that tile.
        const [tx, ty] = record.door.split(',').map(Number) as [number, number];
        const t = this.nearestOpenFloor(tx + 0.5, ty + 0.5);
        if (t) {
          out.push({ record, x: t.x + 0.5, y: t.y + 0.5 });
          continue;
        }
      }
      fallback ??= this.nearestOpenFloor(this.originX + this.w / 2, this.originY + this.h / 2);
      if (fallback) out.push({ record, x: fallback.x + 0.5, y: fallback.y + 0.5 });
    }
    return out;
  }

  /** Open floor tile nearest a point, searching outward in rings. */
  nearestOpenFloor(nearX: number, nearY: number): { x: number; y: number } | null {
    const sx = Math.floor(nearX), sy = Math.floor(nearY);
    for (let r = 0; r < Math.max(this.w, this.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = sx + dx, y = sy + dy;
          if (this.isOpenFloor(x, y) && !this.obstacleAt(x, y)?.hazard) return { x, y };
        }
      }
    }
    return null;
  }

  /** Room containing a global tile, by cell lookup. */
  containsTile(x: number, y: number): boolean {
    return this.hasCell(Math.floor(x / CELL_W), Math.floor(y / CELL_H)) && this.kindAt(x, y) !== 'void';
  }
}

export function inward(dir: Dir): [number, number] {
  switch (dir) {
    case 'n': return [0, 1];
    case 's': return [0, -1];
    case 'e': return [-1, 0];
    case 'w': return [1, 0];
  }
}
