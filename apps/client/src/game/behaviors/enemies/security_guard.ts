import { defineBrain, enter, type Phased } from '../brain';
import { chase, clearToPlayer, go, rad, toPlayer, turnToward } from '../steering';

interface Params {
  /** Degrees of its front the shield covers. */
  shieldArc: number;
  /** Radians per second it turns to keep the shield on the player; and while recovering from a charge. */
  turnRate: number;
  recoverTurnRate: number;
  /** Charges at the player within this distance, in a clear line (tiles). */
  range: number;
  /** Seconds between charges. */
  cooldown: number;
  windup: number;
  chargeSpeed: number;
  chargeTime: number;
  recover: number;
  /** Seconds dazed, shield down, after charging into something. */
  stun: number;
}

interface State extends Phased<'advance' | 'windup' | 'charge' | 'recover' | 'stunned'> {
  /** Where the shield points. */
  facing: number;
  chargeIn: number;
}

/**
 * Walks the player down behind a riot shield that stops anything from the front, turning to keep it
 * on them, then lowers its head and charges in a straight line. It turns slowly while it recovers,
 * and charging into a wall leaves it dazed with the shield down: those are the openings.
 */
export const securityGuard = defineBrain<Params, State>({
  init: (p) => ({ phase: 'advance', t: 0, facing: Math.random() * Math.PI * 2, chargeIn: p.cooldown * 0.5 }),
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    s.chargeIn -= dt;
    const { d, angle } = toPlayer(ctx);
    const shieldUp = (turnRate: number) => {
      s.facing = turnToward(s.facing, angle, turnRate * dt);
      e.blockArc = rad(p.shieldArc);
    };
    switch (s.phase) {
      case 'advance':
        shieldUp(p.turnRate);
        chase(ctx);
        if (s.chargeIn <= 0 && d <= p.range && clearToPlayer(ctx, 'walk')) enter(s, 'windup');
        break;
      case 'windup':
        shieldUp(p.turnRate);
        e.pose('windup', p.windup);
        if (s.t >= p.windup) enter(s, 'charge');
        break;
      case 'charge':
        // Committed: straight ahead, shield first.
        e.blockArc = rad(p.shieldArc);
        go(e, s.facing, p.chargeSpeed);
        if (e.bumped) {
          game.shake(0.2);
          enter(s, 'stunned');
        } else if (s.t >= p.chargeTime) {
          enter(s, 'recover');
        }
        break;
      case 'recover':
        shieldUp(p.recoverTurnRate);
        if (s.t >= p.recover) {
          s.chargeIn = p.cooldown;
          enter(s, 'advance');
        }
        break;
      case 'stunned':
        e.pose('stunned');
        e.contact = false;
        if (s.t >= p.stun) {
          s.chargeIn = p.cooldown;
          enter(s, 'advance');
        }
        break;
    }
    e.facing = s.facing;
  },
});
