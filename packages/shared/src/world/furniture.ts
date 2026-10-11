import { TILE_PX } from '../core/constants';
import type { FurnitureDef } from '../content/types';

/**
 * Turning furniture on the floor (see docs/plans/furniture-art.md). Everything positional about a piece
 * (its pivot, later its collision boxes and light) is given at facing 0 (south) within its footprint,
 * and turned with it: a quarter turn clockwise, seen from above, takes a point (x, y) in a w×h box to
 * (h − y, x) in the turned h×w box. Units don't matter (tiles or pixels), as long as they match.
 */
export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

/** A point in a w×h box (its size at facing 0), turned `k` quarter turns clockwise. */
export function turnPoint(p: Pt, w: number, h: number, k: number): Pt {
  let { x, y } = p;
  let W = w, H = h;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return { x, y };
}

/** A box in a w×h box (its size at facing 0), turned `k` quarter turns clockwise. */
export function turnBox(b: Box, w: number, h: number, k: number): Box {
  const a = turnPoint({ x: b.x, y: b.y }, w, h, k);
  const c = turnPoint({ x: b.x + b.w, y: b.y + b.h }, w, h, k);
  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
}

/**
 * A facing (`FACINGS`: south, west, north, east) as seen in a mirrored room: mirroring left-right
 * swaps west and east, mirroring top-bottom swaps south and north.
 */
export function mirrorFacing(rot: number, mirrorX: boolean, mirrorY: boolean): number {
  const r = ((rot % 4) + 4) % 4;
  return (mirrorX && r % 2 === 1) || (mirrorY && r % 2 === 0) ? (r + 2) % 4 : r;
}

/**
 * A pivot must be a cell centre or a grid corner: only those land every cell on another cell after a
 * quarter turn (an edge midpoint would leave the piece half a tile off the grid).
 */
export function isValidPivot(p: Pt, w: number, h: number): boolean {
  const x2 = p.x * 2, y2 = p.y * 2;
  if (!Number.isInteger(x2) || !Number.isInteger(y2) || (x2 & 1) !== (y2 & 1)) return false;
  return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
}

/**
 * The pivot a w×h footprint turns around unless its def says otherwise: its centre when that's a valid
 * pivot (both sides odd, or both even: it turns in place), else the valid point nearest the centre,
 * preferring cell centres, then the top (the back of the piece), then the left. A 1×2 bed turns about
 * its head, a 2×1 sofa about its left end.
 */
export function defaultPivot(w: number, h: number): Pt {
  const c = { x: w / 2, y: h / 2 };
  if (isValidPivot(c, w, h)) return c;
  // Ranked by distance to the centre, then cell centres before corners, then top, then left.
  const rank = (p: Pt) => [Math.hypot(p.x - c.x, p.y - c.y), Number.isInteger(p.x) ? 1 : 0, p.y, p.x];
  const before = (a: number[], b: number[]) => {
    const i = a.findIndex((v, j) => v !== b[j]);
    return i >= 0 && a[i]! < b[i]!;
  };
  let best: Pt | null = null;
  for (let y2 = 0; y2 <= h * 2; y2++) {
    for (let x2 = 0; x2 <= w * 2; x2++) {
      const p = { x: x2 / 2, y: y2 / 2 };
      if (isValidPivot(p, w, h) && (!best || before(rank(p), rank(best)))) best = p;
    }
  }
  return best!;
}

/** The pivot of a piece at facing 0, in tiles from its footprint's top-left. */
export function pivotOf(def: FurnitureDef): Pt {
  return def.pivot ?? defaultPivot(def.size.w, def.size.h);
}

/** Where the pivot is within the footprint in a facing. */
export function pivotIn(def: FurnitureDef, rot: number): Pt {
  return turnPoint(pivotOf(def), def.size.w, def.size.h, rot);
}

/**
 * Turn a placed piece a quarter turn (`dir` 1 clockwise, -1 anticlockwise) around its pivot, which
 * stays on the same spot of the floor. Returns the new top-left and facing; four turns come back to
 * where it started.
 */
export function turnAround(def: FurnitureDef, x: number, y: number, rot: number, dir: 1 | -1): { x: number; y: number; rot: number } {
  const from = pivotIn(def, rot);
  const next = (((rot + dir) % 4) + 4) % 4;
  const to = pivotIn(def, next);
  return { x: x + from.x - to.x, y: y + from.y - to.y, rot: next };
}

/** A piece's solid boxes where it stands, in tiles (world coordinates), for its facing. */
export function solidBoxes(def: FurnitureDef, p: { x: number; y: number; rot: number }): Box[] {
  const W = def.size.w * TILE_PX, H = def.size.h * TILE_PX;
  return (def.collision ?? [{ x: 0, y: 0, w: W, h: H }]).map((b) => {
    const t = turnBox(b, W, H, p.rot);
    return { x: p.x + t.x / TILE_PX, y: p.y + t.y / TILE_PX, w: t.w / TILE_PX, h: t.h / TILE_PX };
  });
}
