import { registry, type ProjectileDef } from '@df/shared';
import { ring, shoot } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { chase, clearShot, toPlayer } from '../steering';

interface Params {
  /** Stops closing in at this distance (tiles). */
  keepAway: number;
  /** Lobs at the player within this distance. */
  range: number;
  cooldown: number;
  windup: number;
  glob: string;
  globDamage: number;
  /** What it sprays all round when hit, how many, and how soon it can again. */
  spray: string;
  sprayCount: number;
  sprayDamage: number;
  sprayCooldown: number;
}

interface State extends Phased<'lumber' | 'windup'> {
  glob: ProjectileDef;
  spray: ProjectileDef;
  /** Seconds until it may lob / spray again. */
  lobIn: number;
  sprayIn: number;
  /** Health last frame, to notice being hit. */
  hp: number;
}

/**
 * Lumbers after the player, lobbing globs over anything in the way (they leave puddles that slow
 * you down). Hitting it makes it spray droplets in every direction.
 */
export const waterCooler = defineBrain<Params, State>({
  init: (p) => ({
    phase: 'lumber', t: 0, glob: registry.projectiles.get(p.glob), spray: registry.projectiles.get(p.spray),
    lobIn: p.cooldown * (0.4 + Math.random() * 0.6), sprayIn: 0, hp: Infinity,
  }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.t += dt;
    s.lobIn -= dt;
    s.sprayIn -= dt;
    if (e.hp < s.hp && s.sprayIn <= 0 && s.hp !== Infinity) {
      ring(ctx, s.spray, p.sprayCount, { damage: p.sprayDamage });
      s.sprayIn = p.sprayCooldown;
    }
    s.hp = e.hp;
    const { d, angle } = toPlayer(ctx);
    switch (s.phase) {
      case 'lumber': {
        // A glob goes over anything short, but not a tall wall: it comes round until one would land.
        const open = clearShot(ctx, s.glob);
        if (d > p.keepAway || !open) chase(ctx);
        if (s.lobIn <= 0 && d <= p.range && open) enter(s, 'windup');
        break;
      }
      case 'windup':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          shoot(ctx, s.glob, angle, { damage: p.globDamage });
          s.lobIn = p.cooldown * (0.85 + Math.random() * 0.3);
          enter(s, 'lumber');
        }
        break;
    }
  },
});
