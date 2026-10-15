import { TILE_PX } from '@df/shared';
import { rowSpans } from '../engine/assets';
import type { PointBlockedFn } from '../engine/collision';

/** The ways a held thing may give, after straight back: along the walls, which run with the grid. */
const ASIDE: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Things held out from a body (an item pointed somewhere, a weapon mid-swing) are level with the hand:
 * each pixel of their art is over a spot on the floor, the way it points on screen is the way it points
 * across the floor, and none of it can be anywhere its holder couldn't stand (`blocked`: inside a wall
 * of either height, or a piece of furniture's base). It is then only ever over open floor, like the
 * body holding it, so whatever its art overlaps on screen is in front of both or behind both, and
 * sorting it in depth with the body is always right.
 *
 * So a held thing is never drawn where it couldn't be: `heldIn` says how far to shift a sprite (px, to
 * add to its position) so that none of it is inside anything: the shortest way out, straight back along
 * the way it points or aside along the grid (a wide head beside a wall gives sideways, where drawing it
 * back would leave it in the wall). Up against a wall, an item is held in close instead of sticking
 * into it. It never gives its way through a wall to the far side: it must still be reached from its
 * holder, with nothing between them.
 *
 * The sprite's art points up (like an item's icon) and is turned by `rotation`; `anchorY` is its
 * anchor down the art (0–1, centred across it), which is over the floor at (`gx`, `gy`) world px. Its
 * holder stands at `from` (world px).
 */
export function heldIn(
  key: string, anchorY: number, gx: number, gy: number, rotation: number, from: { x: number; y: number }, blocked: PointBlockedFn,
): { x: number; y: number } {
  const rows = rowSpans(key);
  const h = rows.length, cos = Math.cos(rotation), sin = Math.sin(rotation);
  // Where the art's outline is over the floor: each row's ends and middle.
  const outline: { x: number; y: number }[] = [];
  let tip = -Infinity, tail = Infinity;
  rows.forEach((span, r) => {
    if (!span) return;
    const ly = r + 0.5 - anchorY * h;
    tip = Math.max(tip, -ly);
    tail = Math.min(tail, -ly);
    for (const lx of [span.l, (span.l + span.r) / 2, span.r]) outline.push({ x: gx + lx * cos - ly * sin, y: gy + lx * sin + ly * cos });
  });
  const inside = (sx: number, sy: number) => outline.some((p) => blocked((p.x + sx) / TILE_PX, (p.y + sy) / TILE_PX));
  // Whether its holder reaches it there: nothing solid on the way to its middle, a pixel at a time.
  const mid = { x: outline.reduce((s, p) => s + p.x, 0) / outline.length, y: outline.reduce((s, p) => s + p.y, 0) / outline.length };
  const reached = (sx: number, sy: number) => {
    const dx = mid.x + sx - from.x, dy = mid.y + sy - from.y;
    const steps = Math.ceil(Math.hypot(dx, dy));
    for (let i = 1; i < steps; i++) if (blocked((from.x + (dx * i) / steps) / TILE_PX, (from.y + (dy * i) / steps) / TILE_PX)) return false;
    return true;
  };
  const clear = (sx: number, sy: number) => !inside(sx, sy) && reached(sx, sy);
  if (clear(0, 0)) return { x: 0, y: 0 };
  // It points along (sin, -cos): the art's up, turned.
  const ways: [number, number][] = [[-sin, cos], ...ASIDE];
  const length = Math.ceil(tip - tail) + 1;
  for (let d = 1; d <= length; d++) {
    for (const [ux, uy] of ways) if (clear(ux * d, uy * d)) return { x: ux * d, y: uy * d };
  }
  // Nowhere near is clear (boxed in): all the way back, into the hand.
  return { x: -sin * length, y: cos * length };
}
