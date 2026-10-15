import type { WallHeight } from '../content/types';
import type { TileQueries } from './area';

/**
 * Wall autotiling. Each wall tile is drawn as four quarters (left and right halves, split top from
 * bottom at the line over the wall's face, wherever its art puts that), and each quarter picks one of five
 * pieces from its two orthogonal neighbours and the diagonal between them:
 *
 *   both sides open                      → outer corner
 *   open to the north or south only      → horizontal (the edge of a wall running east–west)
 *   open to the west or east only        → vertical (the edge of a wall running north–south)
 *   both sides joined, diagonal open     → inner corner
 *   everything joined                    → fill
 *
 * The world is seen from the south, tilted back, so a wall shows its top everywhere and its face only
 * where it's open to the south: pieces can't be turned into place. Each is authored as a whole tile
 * that shows it in all four quarters (outer: a lone pillar; inner: a cross junction), and a quarter
 * takes its own corner of it. 5 pieces cover every shape: room edges and corners, lone pillars, T and
 * cross junctions, thick blocks and L-shapes that join the room's walls.
 *
 * A wall joins walls at least as tall as itself. A lower one beside it is a step down: the taller wall
 * is open on that side (its edge, and to the south its face, show above the lower wall's top), while
 * the lower wall runs up to it.
 */
export type WallPiece = 'outer' | 'horizontal' | 'vertical' | 'inner' | 'fill';

const HEIGHT_RANK: Record<WallHeight, number> = { none: 0, short: 1, tall: 2 };

/** Neighbour bits: set when that neighbour joins (is wall of a joined group and no lower, or void). */
export const WallBits = { N: 1, E: 2, S: 4, W: 8, NE: 16, SE: 32, SW: 64, NW: 128 } as const;
const { N, E, S, W, NE, SE, SW, NW } = WallBits;

/** Quarters in order TL, TR, BR, BL, as [north / south side, west / east side, diagonal]. */
const QUARTERS: [number, number, number][] = [
  [N, W, NW],
  [N, E, NE],
  [S, E, SE],
  [S, W, SW],
];

/** Neighbour mask for an autotiled wall tile, with diagonals kept only where they matter. */
export function wallMask(layout: TileQueries, x: number, y: number): number {
  const self = layout.obstacleAt(x, y);
  const joins = self?.autotile?.joins ?? [];
  const rank = HEIGHT_RANK[self?.height ?? 'none'];
  const joined = (dx: number, dy: number) => {
    if (layout.kindAt(x + dx, y + dy) === 'void') return true;
    const o = layout.obstacleAt(x + dx, y + dy);
    return !!o?.connectGroup && joins.includes(o.connectGroup) && HEIGHT_RANK[o.height] >= rank;
  };
  let m = 0;
  if (joined(0, -1)) m |= N;
  if (joined(1, 0)) m |= E;
  if (joined(0, 1)) m |= S;
  if (joined(-1, 0)) m |= W;
  if ((m & N) && (m & E) && joined(1, -1)) m |= NE;
  if ((m & S) && (m & E) && joined(1, 1)) m |= SE;
  if ((m & S) && (m & W) && joined(-1, 1)) m |= SW;
  if ((m & N) && (m & W) && joined(-1, -1)) m |= NW;
  return m;
}

/** The piece for each quarter (TL, TR, BR, BL) of a tile with this mask. */
export function wallQuarters(mask: number): WallPiece[] {
  return QUARTERS.map(([ns, we, d]) => {
    const nsJoined = !!(mask & ns), weJoined = !!(mask & we);
    if (!nsJoined && !weJoined) return 'outer';
    if (!nsJoined) return 'horizontal';
    if (!weJoined) return 'vertical';
    return mask & d ? 'fill' : 'inner';
  });
}

/** Whether a quarter (index into `wallQuarters`) with this piece shows the wall's face: the bottom two, open to the south. */
export function showsFace(quarter: number, piece: WallPiece): boolean {
  return quarter >= 2 && (piece === 'outer' || piece === 'horizontal');
}
