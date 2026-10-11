import { defineBrain, enter, type Phased } from '../brain';
import { between, chase, circle, clearToPlayer, coin, go, toPlayer, type Range } from '../steering';

interface Params {
  /** Closes to this distance before it starts sidestepping (tiles). */
  reach: number;
  /** Seconds of sidestepping between lunges. */
  strafe: Range;
  strafeSpeed: number;
  windup: number;
  lungeSpeed: number;
  lungeTime: number;
  recover: number;
}

interface State extends Phased<'close' | 'strafe' | 'windup' | 'lunge' | 'recover'> {
  side: 1 | -1;
  until: number;
  heading: number;
}

/** Walks up, sidesteps around the player for a moment, rears back and lunges; then catches its breath. */
export const thug = defineBrain<Params, State>({
  init: () => ({ phase: 'close', t: 0, side: coin(), until: 0, heading: 0 }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.t += dt;
    const { d, angle } = toPlayer(ctx);
    switch (s.phase) {
      case 'close':
        chase(ctx);
        if (d <= p.reach && clearToPlayer(ctx, 'walk')) {
          s.side = coin();
          s.until = between(p.strafe);
          enter(s, 'strafe');
        }
        break;
      case 'strafe':
        if (e.bumped) s.side = s.side === 1 ? -1 : 1;
        circle(ctx, s.side, p.strafeSpeed, p.reach);
        if (d > p.reach * 1.8) enter(s, 'close');
        else if (s.t >= s.until) enter(s, 'windup');
        break;
      case 'windup':
        e.pose('windup', p.windup);
        s.heading = angle;
        if (s.t >= p.windup) enter(s, 'lunge');
        break;
      case 'lunge':
        e.facing = s.heading;
        go(e, s.heading, p.lungeSpeed);
        if (s.t >= p.lungeTime || e.bumped) enter(s, 'recover');
        break;
      case 'recover':
        e.facing = s.heading;
        if (s.t >= p.recover) enter(s, 'close');
        break;
    }
  },
});
