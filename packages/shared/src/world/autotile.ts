import type { RoomLayout } from './layout';

/**
 * Wall autotiling. Each wall tile is drawn as four 8×8 quarters, and each quarter picks one of four
 * pieces from its two orthogonal neighbours and the diagonal between them:
 *
 *   both sides open                      → outer corner
 *   one side open                        → edge (its face points at the open side)
 *   both sides joined, diagonal open     → inner corner
 *   everything joined                    → fill
 *
 * Pieces are authored once, as the top-left quarter (open toward north / west), and rotated into
 * place, so 4 pieces cover every shape: room edges and corners, lone pillars, T and cross junctions,
 * thick blocks and L-shapes that join the room's walls.
 */
export type WallPiece = 'outer' | 'edge' | 'inner' | 'fill';

/** Neighbour bits: set when that neighbour joins (is wall of a joined group, or void). */
export const WallBits = { N: 1, E: 2, S: 4, W: 8, NE: 16, SE: 32, SW: 64, NW: 128 } as const;
const { N, E, S, W, NE, SE, SW, NW } = WallBits;

/** Quarters in order TL, TR, BR, BL, as [side a, side b, diagonal]: the TL frame's north / west / NW rotated. */
const QUARTERS: [number, number, number][] = [
  [N, W, NW],
  [E, N, NE],
  [S, E, SE],
  [W, S, SW],
];

/** Neighbour mask for an autotiled wall tile, with diagonals kept only where they matter. */
export function wallMask(layout: RoomLayout, x: number, y: number): number {
  const joins = layout.obstacleAt(x, y)?.autotile?.joins ?? [];
  const joined = (dx: number, dy: number) => {
    if (layout.kindAt(x + dx, y + dy) === 'void') return true;
    const g = layout.obstacleAt(x + dx, y + dy)?.connectGroup;
    return !!g && joins.includes(g);
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

/** The piece and clockwise quarter-turns for each quarter (TL, TR, BR, BL) of a tile with this mask. */
export function wallQuarters(mask: number): { piece: WallPiece; rot: number }[] {
  return QUARTERS.map(([a, b, d], q) => {
    const aj = !!(mask & a), bj = !!(mask & b);
    if (!aj && !bj) return { piece: 'outer', rot: q };
    // The edge piece faces north in the TL frame; facing the frame's west is three more turns.
    if (!aj) return { piece: 'edge', rot: q };
    if (!bj) return { piece: 'edge', rot: (q + 3) % 4 };
    return { piece: mask & d ? 'fill' : 'inner', rot: q };
  });
}
