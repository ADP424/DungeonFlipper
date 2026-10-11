import { registry, type ProjectileDef } from '@df/shared';
import { shoot } from '../actions';
import { defineBrain, enter, type BrainCtx, type Phased } from '../brain';
import { flee, moveTo, toPlayer } from '../steering';
import type { Enemy } from '../../entities/Enemy';

interface Params {
  /** How far behind a colleague it stands, on the side away from the player (tiles). */
  behind: number;
  /** Throws pens at the player within this distance. */
  range: number;
  cooldown: number;
  windup: number;
  pen: string;
  penDamage: number;
  /** Alone, it runs at this speed and lobs the stapler when the player is within range. */
  panicSpeed: number;
  stapler: string;
  staplerCooldown: number;
  staplerDamage: number;
  staplerRange: number;
}

interface State extends Phased<'lurk' | 'windup' | 'panic'> {
  pen: ProjectileDef;
  stapler: ProjectileDef;
  throwIn: number;
}

/** The nearest colleague to hide behind: anyone alive in its room who isn't HR. */
function colleague({ game, e }: BrainCtx<Params>): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const x of game.room.enemies) {
    if (x === e || x.dead || x.passive || x.def.id === e.def.id || x.roomId !== e.roomId) continue;
    const d = Math.hypot(x.x - e.x, x.y - e.y);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

/**
 * Keeps a colleague between itself and the player, throwing pens that curve after them (a swing
 * knocks a pen out of the air). When nobody's left to hide behind it panics: runs from the player and
 * hurls the stapler over its shoulder.
 */
export const hrRep = defineBrain<Params, State>({
  init: (p) => ({
    phase: 'lurk', t: 0, pen: registry.projectiles.get(p.pen), stapler: registry.projectiles.get(p.stapler),
    throwIn: p.cooldown * (0.5 + Math.random() * 0.5),
  }),
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    s.throwIn -= dt;
    const { d, angle } = toPlayer(ctx);
    const shield = colleague(ctx);
    switch (s.phase) {
      case 'lurk': {
        if (!shield) {
          s.throwIn = Math.min(s.throwIn, p.staplerCooldown * 0.5);
          enter(s, 'panic');
          break;
        }
        // The point behind the colleague, as seen from the player.
        const ax = shield.x - game.player.x, ay = shield.y - game.player.y;
        const l = Math.hypot(ax, ay) || 1;
        moveTo(e, shield.x + (ax / l) * p.behind, shield.y + (ay / l) * p.behind, e.def.speed, dt);
        if (s.throwIn <= 0 && d <= p.range) enter(s, 'windup');
        break;
      }
      case 'windup':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          shoot(ctx, s.pen, angle, { damage: p.penDamage });
          s.throwIn = p.cooldown * (0.85 + Math.random() * 0.3);
          enter(s, 'lurk');
        }
        break;
      case 'panic':
        if (shield) {
          enter(s, 'lurk');
          break;
        }
        flee(ctx, p.panicSpeed);
        if (s.throwIn <= 0 && d <= p.staplerRange) {
          shoot(ctx, s.stapler, angle, { damage: p.staplerDamage });
          s.throwIn = p.staplerCooldown;
        }
        break;
    }
  },
});
