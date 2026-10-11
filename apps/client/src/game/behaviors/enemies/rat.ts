import { defineBrain } from '../brain';
import { chase } from '../steering';

/** Runs straight at the player along the shortest way round, and never stops. */
export const rat = defineBrain({
  init: () => null,
  update(ctx) {
    chase(ctx);
  },
});
