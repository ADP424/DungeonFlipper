import { defineBrain } from '../brain';
import { chase, rad, watched } from '../steering';

interface Params {
  /** Degrees either side of where the player looks within which it counts as watched. */
  watchedCone: number;
  /** Seconds after the player looks away before it moves. */
  thaw: number;
}

interface State {
  /** Seconds since it was last watched. */
  unwatched: number;
}

/**
 * A statue for as long as the player faces it (their head follows the mouse), and harmless to bump
 * into. The moment they look away it comes at them, faster than they can run.
 */
export const mannequin = defineBrain<Params, State>({
  init: () => ({ unwatched: 0 }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.unwatched = watched(ctx, rad(p.watchedCone)) ? 0 : s.unwatched + dt;
    if (s.unwatched < p.thaw) {
      e.contact = false;
      return;
    }
    chase(ctx);
  },
});
