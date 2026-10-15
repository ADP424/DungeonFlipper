import { registry, type ProjectileDef } from '@df/shared';
import { shoot } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { chase, circle, clearShot, coin, go, toPlayer } from '../steering';

interface Params {
  /** It circles the player between these distances (tiles). */
  near: number;
  far: number;
  /** Seconds between taser shots. */
  cooldown: number;
  windup: number;
  projectile: string;
  damage: number;
  /** The player this close gets shoved away with the baton instead. */
  shoveRange: number;
  shoveWindup: number;
  shoveSpeed: number;
  shoveTime: number;
  recover: number;
}

interface State extends Phased<'circle' | 'aim' | 'shoveWindup' | 'shove' | 'recover'> {
  projectile: ProjectileDef;
  side: 1 | -1;
  shootIn: number;
  heading: number;
}

/**
 * Professional: circles at taser range and fires when it has a line, and if the player gets in close
 * it shoulders them back out again.
 */
export const realtorGuard = defineBrain<Params, State>({
  init: (p) => ({ phase: 'circle', t: 0, projectile: registry.projectiles.get(p.projectile), side: coin(), shootIn: p.cooldown * 0.5, heading: 0 }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.t += dt;
    s.shootIn -= dt;
    const { d, angle } = toPlayer(ctx);
    switch (s.phase) {
      case 'circle':
        if (d <= p.shoveRange) {
          enter(s, 'shoveWindup');
          break;
        }
        // Out of range or out of line, it closes in until it has a shot.
        if (d > p.far || !clearShot(ctx, s.projectile)) {
          chase(ctx);
          break;
        }
        if (e.bumped) s.side = s.side === 1 ? -1 : 1;
        circle(ctx, s.side, e.def.speed, (p.near + p.far) / 2);
        if (s.shootIn <= 0) enter(s, 'aim');
        break;
      case 'aim':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          shoot(ctx, s.projectile, angle, { damage: p.damage });
          s.shootIn = p.cooldown * (0.85 + Math.random() * 0.3);
          enter(s, 'circle');
        }
        break;
      case 'shoveWindup':
        s.heading = angle;
        if (s.t >= p.shoveWindup) enter(s, 'shove');
        break;
      case 'shove':
        e.facing = s.heading;
        go(e, s.heading, p.shoveSpeed);
        if (s.t >= p.shoveTime || e.bumped) enter(s, 'recover');
        break;
      case 'recover':
        e.facing = s.heading;
        if (s.t >= p.recover) {
          s.side = coin();
          enter(s, 'circle');
        }
        break;
    }
  },
});
