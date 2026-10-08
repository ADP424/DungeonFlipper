/** Tile-grid collision for circle-ish bodies (resolved as axis-aligned boxes of half-size r). */
export type BlockedFn = (tx: number, ty: number) => boolean;

const EPS = 1e-4;

export interface MoveResult { x: number; y: number; hitX: boolean; hitY: boolean }

export function moveAndCollide(x: number, y: number, r: number, dx: number, dy: number, blocked: BlockedFn): MoveResult {
  let hitX = false, hitY = false;
  // Sub-step large moves so fast bodies can't tunnel through single tiles.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const rx = axis(x, y, r, sx, true, blocked);
    x = rx.v; hitX ||= rx.hit;
    const ry = axis(x, y, r, sy, false, blocked);
    y = ry.v; hitY ||= ry.hit;
  }
  return { x, y, hitX, hitY };
}

function axis(x: number, y: number, r: number, d: number, isX: boolean, blocked: BlockedFn): { v: number; hit: boolean } {
  if (d === 0) return { v: isX ? x : y, hit: false };
  const nx = isX ? x + d : x;
  const ny = isX ? y : y + d;
  const x0 = Math.floor(nx - r), x1 = Math.floor(nx + r - EPS);
  const y0 = Math.floor(ny - r), y1 = Math.floor(ny + r - EPS);
  // Tiles already overlapped before this move are ignored, so a body that ends up inside
  // something (e.g. a wall built around it) can always walk back out.
  const inside = (tx: number, ty: number) =>
    tx >= Math.floor(x - r) && tx <= Math.floor(x + r - EPS) && ty >= Math.floor(y - r) && ty <= Math.floor(y + r - EPS);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!blocked(tx, ty) || inside(tx, ty)) continue;
      if (isX) return { v: d > 0 ? tx - r - EPS : tx + 1 + r + EPS, hit: true };
      return { v: d > 0 ? ty - r - EPS : ty + 1 + r + EPS, hit: true };
    }
  }
  return { v: isX ? nx : ny, hit: false };
}

/** True if a box of half-size r at (x,y) overlaps any blocked tile. */
export function overlapsBlocked(x: number, y: number, r: number, blocked: BlockedFn): boolean {
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r - EPS); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r - EPS); tx++) if (blocked(tx, ty)) return true;
  }
  return false;
}

/** Ray march between two points; true when no tile along the way blocks. */
export function lineClear(ax: number, ay: number, bx: number, by: number, blocked: BlockedFn): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  }
  return true;
}
