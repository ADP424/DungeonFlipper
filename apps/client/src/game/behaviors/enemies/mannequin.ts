import { defineBrain } from '../brain';
import { chase, rad, watched } from '../steering';

interface Params {
  /** Degrees either side of where the player's head is turned within which it counts as watched. */
  watchedCone: number;
}

interface State {
  /** Which way it stands (radians): the way it last ran. */
  heading: number;
}

/**
 * A statue for as long as the player's head is turned its way (it follows the mouse), frozen
 * mid-stride facing wherever it was going, and harmless to bump into. The instant they look away it
 * sprints at them, faster than they can run.
 */
export const mannequin = defineBrain<Params, State>({
  // On display, facing the front, until it first moves.
  init: () => ({ heading: Math.PI / 2 }),
  update(ctx, s) {
    const { e, params: p } = ctx;
    if (watched(ctx, rad(p.watchedCone))) e.contact = false;
    else {
      chase(ctx);
      if (e.vx || e.vy) s.heading = Math.atan2(e.vy, e.vx);
      e.pose('sprint');
    }
    e.facing = s.heading;
  },
});
