import type { CellCoord } from '../content/types';

/** Cells of distance from the lobby per +1 difficulty. */
export const RING_CELLS = 3;
/** Difficulty added per floor below the first. */
export const FLOOR_BASELINE = 4;
/** Chance a newly generated room is a boss room, once a boss is eligible there. */
export const BOSS_CHANCE = 0.04;
/** Chance each template furniture slot holds something. */
export const FURNITURE_SLOT_CHANCE = 0.6;
/** What unpapered Backrooms rooms look like (templates may override with `floorSurface` / `wallSurface`). */
export const BACKROOMS_SURFACES = { floor: 'carpet_damp', wall: 'wallpaper_yellow' } as const;
/** Floor 0 is the real world: your apartment. Levels of the Backrooms start at 1. */
export const APARTMENT_FLOOR = 0;
/** Every floor's lobby sits at this cell. */
export const LOBBY_CELL: CellCoord = { cx: 0, cy: 0 };

/** Difficulty of a room on `floor` covering `cells`: baseline + nearest-cell distance from the lobby in rings. */
export function roomDifficulty(floor: number, cells: CellCoord[]): number {
  const dist = Math.min(...cells.map((c) => Math.hypot(c.cx - LOBBY_CELL.cx, c.cy - LOBBY_CELL.cy)));
  return Math.max(0, Math.round((FLOOR_BASELINE * (floor - 1) + dist / RING_CELLS) * 100) / 100);
}

/** Total threat a room's spawn slots may hold. */
export function threatBudget(difficulty: number): number {
  return 3 + 2.5 * difficulty;
}

/** Strongest single (non-pinned) enemy a room may roll. */
export function threatCap(difficulty: number): number {
  return 1 + difficulty;
}

/** Furniture value generation aims for: plain near the lobby, fancier farther out. */
export function furnitureTarget(difficulty: number): number {
  return Math.max(1, Math.min(5, 1 + difficulty * 0.5));
}
