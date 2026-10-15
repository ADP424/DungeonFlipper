import { defineBrain, enter, type Phased } from '../brain';
import { between, fleeDir, go, toPlayer, type Range } from '../steering';

interface Params {
  /** Flutters away while the player is nearer than this (tiles). */
  keepAway: number;
  /** Seconds of fluttering between swoops. */
  flutter: Range;
  /** Seconds between changes of heading while fluttering. */
  wobble: number;
  windup: number;
  swoopSpeed: number;
  /** How far past the player a swoop carries (tiles). */
  overshoot: number;
  recover: number;
}

interface State extends Phased<'flutter' | 'windup' | 'swoop' | 'recover'> {
  /** How long this flutter lasts. */
  until: number;
  /** Current heading, and time to the next wobble. */
  heading: number;
  wobbleIn: number;
  /** Seconds the swoop takes. */
  swoopTime: number;
}

/**
 * Flutters slowly and erratically away from the player, then hangs still for a moment and swoops
 * straight through where they were standing.
 */
export const ceilingMoth = defineBrain<Params, State>({
  init: (p) => ({ phase: 'flutter', t: 0, until: between(p.flutter), heading: Math.random() * Math.PI * 2, wobbleIn: 0, swoopTime: 0 }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.t += dt;
    const { d, angle } = toPlayer(ctx);
    switch (s.phase) {
      case 'flutter':
        s.wobbleIn -= dt;
        if (s.wobbleIn <= 0 || e.bumped) {
          // Mostly away from the player when they're close (the open way most directly away); anywhere at all otherwise.
          const flight = fleeDir(ctx);
          const away = d >= p.keepAway ? Math.random() * Math.PI * 2 : flight.x || flight.y ? Math.atan2(flight.y, flight.x) : angle + Math.PI;
          s.heading = away + (Math.random() - 0.5) * 2.2;
          s.wobbleIn = p.wobble * (0.6 + Math.random() * 0.8);
        }
        go(e, s.heading, e.def.speed);
        if (s.t >= s.until) enter(s, 'windup');
        break;
      case 'windup':
        e.pose('windup');
        if (s.t >= p.windup) {
          s.heading = angle;
          s.swoopTime = (d + p.overshoot) / p.swoopSpeed;
          enter(s, 'swoop');
        }
        break;
      case 'swoop':
        go(e, s.heading, p.swoopSpeed);
        if (s.t >= s.swoopTime || e.bumped) enter(s, 'recover');
        break;
      case 'recover':
        go(e, s.heading, e.def.speed * 0.5);
        if (s.t >= p.recover) {
          s.until = between(p.flutter);
          s.wobbleIn = 0;
          enter(s, 'flutter');
        }
        break;
    }
  },
});
