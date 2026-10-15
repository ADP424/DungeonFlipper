/** A rectangle of tiles to search, in world tiles. */
export interface Grid {
  originX: number;
  originY: number;
  w: number;
  h: number;
}

/** Whether a mover may stand on a tile. */
export type PassableFn = (tx: number, ty: number) => boolean;

/** The eight steps from a tile, with what each costs (tiles travelled). */
const STEPS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * The cheapest distance (in tiles, a diagonal step costing √2) from every tile of a grid to one goal
 * tile, over the tiles `passable` allows (Dijkstra). A diagonal step needs both tiles beside it open,
 * so a route never cuts a corner. The goal counts even when it isn't passable itself (a player pressed
 * up against furniture), so there is always somewhere to head for.
 */
export class DistanceField {
  /** Distance per tile, row by row from the grid's origin; Infinity where the goal can't be reached. */
  private readonly dist: Float64Array;
  /** Passability per tile, asked once each: 0 unknown, 1 open, 2 blocked. */
  private readonly open: Uint8Array;

  constructor(readonly grid: Grid, readonly goalX: number, readonly goalY: number, private readonly passable: PassableFn) {
    const n = grid.w * grid.h;
    this.dist = new Float64Array(n).fill(Infinity);
    this.open = new Uint8Array(n);
    if (this.inside(goalX, goalY)) this.search();
  }

  /** Distance from a tile to the goal (Infinity when out of reach or off the grid). */
  at(tx: number, ty: number): number {
    return this.inside(tx, ty) ? this.dist[this.index(tx, ty)]! : Infinity;
  }

  /**
   * The neighbouring tile one step along the cheapest way to the goal from a tile, or null at the goal
   * or when there's no way on. Works from a tile that isn't passable too (a body standing in the free
   * part of a tile whose middle is furniture), stepping off it toward the goal.
   */
  next(tx: number, ty: number): { x: number; y: number } | null {
    // The neighbour that costs least to reach the goal through, counting the step there.
    let best = Infinity, bx = 0, by = 0;
    for (const [dx, dy, cost] of STEPS) {
      if (dx && dy && (!this.isOpen(tx + dx, ty) || !this.isOpen(tx, ty + dy))) continue;
      const v = this.at(tx + dx, ty + dy) + cost;
      if (v < best) [best, bx, by] = [v, tx + dx, ty + dy];
    }
    // From an open tile that's its own distance; any neighbour beyond that would be a step back.
    return best < Infinity && best <= this.at(tx, ty) + 1e-9 ? { x: bx, y: by } : null;
  }

  private search(): void {
    const { w } = this.grid;
    const heap = new MinHeap();
    const start = this.index(this.goalX, this.goalY);
    this.dist[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > this.dist[i]!) continue;
      const x = this.grid.originX + (i % w), y = this.grid.originY + Math.floor(i / w);
      for (const [dx, dy, cost] of STEPS) {
        const nx = x + dx, ny = y + dy;
        if (!this.isOpen(nx, ny)) continue;
        if (dx && dy && (!this.isOpen(x + dx, y) || !this.isOpen(x, y + dy))) continue;
        const j = this.index(nx, ny), nd = d + cost;
        if (nd >= this.dist[j]!) continue;
        this.dist[j] = nd;
        heap.push(j, nd);
      }
    }
  }

  private isOpen(tx: number, ty: number): boolean {
    if (!this.inside(tx, ty)) return false;
    const i = this.index(tx, ty);
    if (!this.open[i]) this.open[i] = this.passable(tx, ty) ? 1 : 2;
    return this.open[i] === 1;
  }

  private inside(tx: number, ty: number): boolean {
    const { originX, originY, w, h } = this.grid;
    return tx >= originX && ty >= originY && tx < originX + w && ty < originY + h;
  }

  private index(tx: number, ty: number): number {
    return (ty - this.grid.originY) * this.grid.w + (tx - this.grid.originX);
  }
}

/** Binary min-heap of (tile index, distance) pairs. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop(): [number, number] {
    const { ids, keys } = this;
    const top: [number, number] = [ids[0]!, keys[0]!];
    const id = ids.pop()!, key = keys.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mk = key;
        if (l < n && keys[l]! < mk) [m, mk] = [l, keys[l]!];
        if (r < n && keys[r]! < mk) [m, mk] = [r, keys[r]!];
        if (m === i) break;
        ids[i] = ids[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      ids[i] = id;
      keys[i] = key;
    }
    return top;
  }
}
