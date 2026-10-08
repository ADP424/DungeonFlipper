/** Art pixels per tile. All game logic is in tile units; rendering multiplies by this. */
export const TILE_PX = 16;
/** A cell is the default (one-screen) room footprint, including its 1-tile border walls. */
export const CELL_W = 19;
export const CELL_H = 11;
/** Hotbar storage slots below the equipment slots. */
export const HOTBAR_STORAGE_SLOTS = 6;
/** Largest count a single stack of tools / rolls can hold. */
export const MAX_STACK = 256;
/** Whether passive upgrades survive death. The user specified losing everything not stashed. */
export const DEATH_KEEPS_PASSIVES = false;
