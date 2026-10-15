/**
 * Collision for bodies against solid boxes. A body collides where it stands: its footing, a strip of
 * floor at its position (its feet), so it can walk right up to a thing's base and step behind what
 * rises above it. A solid is the floor a thing stands on (its `depth`; a lamp only its stand).
 */
export interface Solid { x: number; y: number; w: number; h: number }
/** The solid boxes on a tile, in tiles (world coordinates). */
export type SolidsFn = (tx: number, ty: number) => readonly Solid[];
/** Whether a point (tiles) is inside something solid. */
export type PointBlockedFn = (x: number, y: number) => boolean;
/** The floor a body stands on, in tiles: `half` either side of its position, and `depth` back (north) from it. */
export interface Footing { half: number; depth: number }

const EPS = 1e-4;

export interface MoveResult { x: number; y: number; hitX: boolean; hitY: boolean }

export function moveAndCollide(x: number, y: number, f: Footing, dx: number, dy: number, solids: SolidsFn): MoveResult {
  let hitX = false, hitY = false;
  // Sub-step large moves so fast bodies can't tunnel through things (a footing and a lamp's stand are a few pixels deep).
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.125));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const rx = axis(x, y, f, sx, true, solids);
    x = rx.v; hitX ||= rx.hit;
    const ry = axis(x, y, f, sy, false, solids);
    y = ry.v; hitY ||= ry.hit;
  }
  return { x, y, hitX, hitY };
}

const overlaps = (s: Solid, x0: number, y0: number, x1: number, y1: number) => s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0;

/** Each solid the box (x0..x1, y0..y1) overlaps, over the tiles it covers. */
function* solidsIn(x0: number, y0: number, x1: number, y1: number, solids: SolidsFn): Generator<Solid> {
  for (let ty = Math.floor(y0); ty <= Math.floor(y1 - EPS); ty++) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1 - EPS); tx++) {
      for (const s of solids(tx, ty)) if (overlaps(s, x0, y0, x1, y1)) yield s;
    }
  }
}

function axis(x: number, y: number, f: Footing, d: number, isX: boolean, solids: SolidsFn): { v: number; hit: boolean } {
  if (d === 0) return { v: isX ? x : y, hit: false };
  const nx = isX ? x + d : x;
  const ny = isX ? y : y + d;
  // Solids already overlapped before this move are ignored, so a body that ends up inside something
  // (e.g. a wall built around it) can always walk back out.
  let v = isX ? nx : ny, hit = false;
  for (const s of solidsIn(nx - f.half, ny - f.depth, nx + f.half, ny, solids)) {
    if (overlaps(s, x - f.half, y - f.depth, x + f.half, y)) continue;
    // Stop at the nearest face in the direction of travel.
    const stop = isX ? (d > 0 ? s.x - f.half - EPS : s.x + s.w + f.half + EPS) : (d > 0 ? s.y - EPS : s.y + s.h + f.depth + EPS);
    if (!hit || (d > 0 ? stop < v : stop > v)) v = stop;
    hit = true;
  }
  return { v, hit };
}

/** Ray march between two points (every 0.2 tiles); true when nothing along the way blocks. */
export function lineClear(ax: number, ay: number, bx: number, by: number, blocked: PointBlockedFn): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
