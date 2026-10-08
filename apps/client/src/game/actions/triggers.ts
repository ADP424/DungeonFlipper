import type { Game } from '../Game';

/**
 * Behaviours run when the player steps onto a tile whose obstacle declares a `trigger`.
 * `dir` is the unit grid direction the player stepped onto it in.
 */
export type TileTrigger = (game: Game, params: Record<string, unknown>, x: number, y: number, dir: { dx: number; dy: number }) => void;

export const triggers: Record<string, TileTrigger> = {
  stairs(game, params, _x, _y, dir) {
    game.changeFloor(Number(params.delta ?? 1), dir);
  },
};
