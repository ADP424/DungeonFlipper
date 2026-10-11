import { defineBrain, enter, type Phased } from '../brain';
import { between, chase, circle, clearToPlayer, coin, flee, go, toPlayer, type Range } from '../steering';

interface Params {
  /** Distance it circles at (tiles). */
  orbit: number;
  /** Seconds of circling before it dares to dart in, on its own. */
  circle: Range;
  /** How much each other intern in the room shortens that wait (0.5: one colleague → two thirds of it). */
  courage: number;
  windup: number;
  dartSpeed: number;
  dartTime: number;
  /** Seconds backing off after a dart. */
  retreat: number;
  retreatSpeed: number;
}

interface State extends Phased<'circle' | 'windup' | 'dart' | 'retreat'> {
  side: 1 | -1;
  until: number;
  heading: number;
}

/**
 * Skittish: circles the player just out of reach, darts in for a hit, and scurries back. The more
 * interns in the room, the less they wait.
 */
export const intern = defineBrain<Params, State>({
  init: (p) => ({ phase: 'circle', t: 0, side: coin(), until: between(p.circle), heading: 0 }),
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    switch (s.phase) {
      case 'circle': {
        // Out of sight, it comes looking instead.
        if (!clearToPlayer(ctx, 'walk')) {
          chase(ctx);
          break;
        }
        if (e.bumped) s.side = s.side === 1 ? -1 : 1;
        circle(ctx, s.side, e.def.speed, p.orbit);
        const others = game.room.enemies.filter((x) => x !== e && !x.dead && x.def.id === e.def.id && x.roomId === e.roomId).length;
        if (s.t >= s.until / (1 + p.courage * others)) enter(s, 'windup');
        break;
      }
      case 'windup':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          s.heading = toPlayer(ctx).angle;
          enter(s, 'dart');
        }
        break;
      case 'dart':
        go(e, s.heading, p.dartSpeed);
        if (s.t >= p.dartTime || e.bumped) enter(s, 'retreat');
        break;
      case 'retreat':
        flee(ctx, p.retreatSpeed);
        if (s.t >= p.retreat) {
          s.side = coin();
          s.until = between(p.circle);
          enter(s, 'circle');
        }
        break;
    }
  },
});
