/** Art pixels per tile. All game logic is in tile units; rendering multiplies by this. */
export const TILE_PX = 16;
/** A cell is the default (one-screen) room footprint, including its 1-tile border walls (13×7 inside). */
export const CELL_W = 15;
export const CELL_H = 9;

/** The middle floor tile of a cell (global tile coords): where things are placed "in the room". */
export function cellCenter(c: { cx: number; cy: number }): { x: number; y: number } {
  return { x: c.cx * CELL_W + Math.floor(CELL_W / 2), y: c.cy * CELL_H + Math.floor(CELL_H / 2) };
}
/** Hotbar storage slots below the equipment slots. */
export const HOTBAR_STORAGE_SLOTS = 6;
/** Largest count a single stack of tools / rolls can hold. */
export const MAX_STACK = 256;
