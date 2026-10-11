import type { CellCoord, RoomTemplateDef } from '../content/types';

/** Cells of distance from the lobby per +1 depth. */
export const RING_CELLS = 3;
/** Depth added per floor below the first. */
export const FLOOR_BASELINE = 4;
/** Chance a newly generated room is a boss room, where one may appear. */
export const BOSS_CHANCE = 0.04;
/** What unpapered Backrooms rooms look like (templates may override with `floorSurface` / `wallSurface`). */
export const BACKROOMS_SURFACES = { floor: 'carpet_damp', wall: 'wallpaper_yellow' } as const;
/** Floor 0 is the real world: your apartment. Levels of the Backrooms start at 1. */
export const APARTMENT_FLOOR = 0;
/** Every floor's lobby sits at this cell. */
export const LOBBY_CELL: CellCoord = { cx: 0, cy: 0 };

/**
 * How far out a place is: floor baseline + nearest-cell distance from the lobby in rings. Depth only
 * decides which rooms may appear there. A room's own `difficulty` is its template's, as designed.
 */
export function depthAt(floor: number, cells: CellCoord[]): number {
  const dist = Math.min(...cells.map((c) => Math.hypot(c.cx - LOBBY_CELL.cx, c.cy - LOBBY_CELL.cy)));
  return Math.max(0, Math.round((FLOOR_BASELINE * (floor - 1) + dist / RING_CELLS) * 100) / 100);
}

/** A room is this likely (of its full weight) right where it first may appear… */
const DEBUT_WEIGHT = 0.25;
/** …and reaches full weight this much deeper. */
const RAMP_DEPTH = 1.5;
/** Rooms this far below the local depth start to thin out, halving every `FADE_HALF` beyond it, */
const FADE_START = 2.5;
const FADE_HALF = 1.5;
/** but never below this share, so easy rooms still turn up far out. */
const FADE_FLOOR = 0.1;

/**
 * How likely a template is at a depth, relative to the others: nothing shallower than its difficulty,
 * rare where it first appears, more common farther out, and thinning once the surroundings have
 * long outgrown it (so far-out rooms are mostly hard ones).
 */
export function templateWeight(t: Pick<RoomTemplateDef, 'difficulty' | 'weight'>, depth: number): number {
  const gap = depth - (t.difficulty ?? 0);
  if (gap < 0) return 0;
  const ramp = Math.min(1, DEBUT_WEIGHT + (1 - DEBUT_WEIGHT) * (gap / RAMP_DEPTH));
  const fade = gap > FADE_START ? Math.max(FADE_FLOOR, 0.5 ** ((gap - FADE_START) / FADE_HALF)) : 1;
  return (t.weight ?? 1) * ramp * fade;
}

/** Enemy difficulty a room's neighbours may take from it, per point of its own difficulty. */
export const SPILL_FACTOR = 3.5;

/**
 * How much a room spills into each neighbour: monsters keep coming through an open door until the
 * difficulty of everything in the invaded room reaches this. With enemies rated on the scale of the
 * rooms they live in, that's three or four of the kind the room is made of.
 */
export function spillCapacity(sourceDifficulty: number): number {
  return SPILL_FACTOR * sourceDifficulty;
}
