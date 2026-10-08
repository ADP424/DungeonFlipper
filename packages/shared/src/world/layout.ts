import { CELL_H, CELL_W } from '../core/constants';
import { tileKey } from '../core/geometry';
import { legendFor, templateMapSize } from '../content';
import { furniture as furnitureReg, obstacles, roomTemplates } from '../content/registry';
import type { CellCoord, FurnitureDef, MovementKind, ObstacleDef, RoomTemplateDef, TrajectoryKind } from '../content/types';
import type { Dir, FurniturePlacement, RoomInfo, RoomState } from './types';

export type TileKind = 'void' | 'floor' | 'door';

export interface SpawnPoint {
  spawnId: string;
  enemy: string;
  /** Global tile coords of the spawn tile centre. */
  x: number;
  y: number;
}

export const BOUNDARY_WALL = 'boundary_wall';

export const cellKey = (cx: number, cy: number): string => `${cx},${cy}`;

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
  readonly spawns: SpawnPoint[] = [];
  /** Door tile and the tile just inside it: nothing may be built there. */
  readonly reserved = new Set<string>();
  private furnitureAt = new Map<string, FurniturePlacement>();
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
          if (wall) this.baseObstacles[i] = BOUNDARY_WALL;
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
        if (this.kinds[i] !== 'floor' || this.baseObstacles[i] === BOUNDARY_WALL) continue;
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

  isBoundary(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.baseObstacles[this.idx(x, y)] === BOUNDARY_WALL;
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

  furnitureAtTile(x: number, y: number): FurniturePlacement | undefined {
    return this.furnitureAt.get(tileKey(x, y));
  }

  rebuildFurniture(): void {
    this.furnitureAt.clear();
    for (const f of this.state.furniture) {
      const def = furnitureReg.get(f.defId);
      const { w, h } = footprint(def, f.rot);
      for (let y = f.y; y < f.y + h; y++) for (let x = f.x; x < f.x + w; x++) this.furnitureAt.set(tileKey(x, y), f);
    }
  }

  blocksMovement(x: number, y: number, kind: MovementKind): boolean {
    const k = this.kindAt(x, y);
    if (k === 'void') return true;
    const o = this.obstacleAt(x, y);
    if (o && o.blocksMovement.includes(kind)) return true;
    const f = this.furnitureAt.get(tileKey(x, y));
    if (f && furnitureReg.get(f.defId).blocksMovement.includes(kind)) return true;
    return false;
  }

  blocksProjectile(x: number, y: number, trajectory: TrajectoryKind): boolean {
    const k = this.kindAt(x, y);
    if (k === 'void') return true;
    if (k === 'door') return false;
    const o = this.obstacleAt(x, y);
    if (o && o.blocksProjectiles.includes(trajectory)) return true;
    const f = this.furnitureAt.get(tileKey(x, y));
    if (f && furnitureReg.get(f.defId).blocksProjectiles.includes(trajectory)) return true;
    return false;
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

  /** Template spawns still alive. */
  liveSpawns(): SpawnPoint[] {
    const dead = new Set(this.state.deadSpawnIds);
    return this.spawns.filter((s) => !dead.has(s.spawnId));
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
