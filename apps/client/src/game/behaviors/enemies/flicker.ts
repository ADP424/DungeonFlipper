import { registry, type ProjectileDef } from '@df/shared';
import { fan } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { between, circle, coin, rad, toPlayer, type Range } from '../steering';

interface Params {
  /** Seconds it stays visible (and can be hit) between blinks. */
  visible: Range;
  /** Seconds to fade out. */
  fade: number;
  /** Seconds gone. */
  gone: Range;
  /** Seconds to fade back in, before it fires. */
  appear: number;
  /** It reappears between these distances from the player (tiles). */
  near: number;
  far: number;
  projectile: string;
  shots: number;
  /** Degrees between shots. */
  spread: number;
  damage: number;
}

interface State extends Phased<'visible' | 'fade' | 'gone' | 'appear'> {
  projectile: ProjectileDef;
  until: number;
  side: 1 | -1;
}

/**
 * Drifts around the player for a moment, blinks out, and comes back somewhere else, firing a fan as
 * it appears. While it's faded it can't be hit and can't hurt.
 */
export const flicker = defineBrain<Params, State>({
  init: (p) => ({ phase: 'visible', t: 0, projectile: registry.projectiles.get(p.projectile), until: between(p.visible), side: coin() }),
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    switch (s.phase) {
      case 'visible':
        e.alpha = 1;
        if (e.bumped) s.side = s.side === 1 ? -1 : 1;
        circle(ctx, s.side, e.def.speed);
        if (s.t >= s.until) enter(s, 'fade');
        break;
      case 'fade':
        e.alpha = Math.max(0, 1 - s.t / p.fade);
        if (s.t >= p.fade) {
          s.until = between(p.gone);
          enter(s, 'gone');
        }
        break;
      case 'gone': {
        e.alpha = 0;
        if (s.t < s.until) break;
        const pl = game.player;
        const spot = game.room.randomOpenTile((x, y) => {
          const d = Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y);
          return d >= p.near && d <= p.far && game.room.lineClear(x + 0.5, y + 0.5, pl.x, pl.y, 'straight');
        }, e.movementKind);
        if (spot) {
          e.x = spot.x + 0.5;
          e.y = spot.y + 0.5;
        }
        enter(s, 'appear');
        break;
      }
      case 'appear':
        e.alpha = Math.min(1, s.t / p.appear);
        e.pose('windup', p.appear);
        if (s.t >= p.appear) {
          fan(ctx, s.projectile, toPlayer(ctx).angle, p.shots, rad(p.spread), { damage: p.damage });
          s.until = between(p.visible);
          s.side = coin();
          enter(s, 'visible');
        }
        break;
    }
  },
});
