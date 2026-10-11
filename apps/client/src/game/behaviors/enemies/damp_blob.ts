import { registry, type ProjectileDef } from '@df/shared';
import { ring } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { go, pick, toPlayer, type Range } from '../steering';

interface Params {
  /** Seconds sitting between hops. */
  rest: number;
  /** Short hops before each leap. */
  hops: Range;
  hopTime: number;
  hopDistance: number;
  hopHeight: number;
  /** Radians a hop may stray from the way to the player. */
  jitter: number;
  windup: number;
  leapTime: number;
  /** Farthest a leap reaches (tiles). */
  leapRange: number;
  leapHeight: number;
  droplet: string;
  droplets: number;
  dropletDamage: number;
  /** Seconds sitting after a leap. */
  landRest: number;
}

interface State extends Phased<'rest' | 'hop' | 'windup' | 'leap'> {
  droplet: ProjectileDef;
  /** Hops left before the next leap. */
  hopsLeft: number;
  restFor: number;
  heading: number;
  /** Speed of the jump in progress. */
  speed: number;
}

/**
 * Sits, takes a few short hops roughly toward the player, then crouches and leaps at where they
 * stand, landing in a ring of droplets. In the air it can't be touched by the floor or touch anyone.
 */
export const dampBlob = defineBrain<Params, State>({
  init: (p) => ({
    phase: 'rest', t: Math.random() * p.rest, droplet: registry.projectiles.get(p.droplet),
    hopsLeft: pick(p.hops), restFor: p.rest, heading: 0, speed: 0,
  }),
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    const jump = (time: number, height: number, landed: () => void) => {
      const k = Math.min(1, s.t / time);
      e.airborne = true;
      e.z = Math.sin(k * Math.PI) * height;
      go(e, s.heading, s.speed);
      if (k < 1) return;
      e.airborne = false;
      e.z = 0;
      landed();
    };
    switch (s.phase) {
      case 'rest':
        if (s.t < s.restFor) break;
        if (s.hopsLeft > 0) {
          const dir = game.room.pathDir(e);
          s.heading = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * p.jitter;
          s.speed = p.hopDistance / p.hopTime;
          s.hopsLeft--;
          enter(s, 'hop');
        } else {
          enter(s, 'windup');
        }
        break;
      case 'hop':
        jump(p.hopTime, p.hopHeight, () => {
          s.restFor = p.rest;
          enter(s, 'rest');
        });
        break;
      case 'windup':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          const { d, angle } = toPlayer(ctx);
          s.heading = angle;
          s.speed = Math.min(d, p.leapRange) / p.leapTime;
          enter(s, 'leap');
        }
        break;
      case 'leap':
        jump(p.leapTime, p.leapHeight, () => {
          ring(ctx, s.droplet, p.droplets, { damage: p.dropletDamage });
          game.shake(0.12);
          s.hopsLeft = pick(p.hops);
          s.restFor = p.landRest;
          enter(s, 'rest');
        });
        break;
    }
  },
});
