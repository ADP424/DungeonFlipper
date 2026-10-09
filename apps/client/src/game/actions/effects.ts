import type { ItemInstance } from '@df/shared';
import type { Game } from '../Game';

/**
 * Effects referenced by id from PickupDef.effect and PassiveDef.effects.
 * A pickup effect returns false to refuse being consumed (e.g. hearts at full health).
 */
export type Effect = (game: Game, params: Record<string, unknown>, item: ItemInstance) => boolean;

export const effects: Record<string, Effect> = {
  heal(game, params) {
    return game.healPlayer(Number(params.halves ?? 2)) > 0;
  },
  cash(game, _params, item) {
    game.addCash(Number(item.data.amount ?? 1));
    return true;
  },
};
