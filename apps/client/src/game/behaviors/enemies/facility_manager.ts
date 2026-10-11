import { registry, type ProjectileDef } from '@df/shared';
import { fan, ring, summon, summonsOf } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { between, chase, go, toPlayer, type Range } from '../steering';

interface Params {
  projectile: string;
  damage: number;
  /** Who it calls in once enraged. */
  summon: string;
  /** Enraged below this fraction of its health: faster, bigger attacks, and it summons. */
  enrageAt: number;
  enragedSpeed: number;
  /** Seconds lumbering after the player between attacks. */
  chase: Range;
  chargeWindup: number;
  chargeSpeed: number;
  chargeTime: number;
  sweepWindup: number;
  sweepCount: number;
  enragedSweepCount: number;
  burstWindup: number;
  burstCount: number;
  /** Seconds between an enraged burst's two rings. */
  burstGap: number;
  summonCount: number;
  maxSummons: number;
  recover: number;
}

type Attack = 'charge' | 'sweep' | 'burst' | 'summon';

interface State extends Phased<'chase' | 'chargeWindup' | 'charge' | 'sweepWindup' | 'burstWindup' | 'burstAgain' | 'recover'> {
  projectile: ProjectileDef;
  until: number;
  heading: number;
}

/** Radians between the clipboards of a sweep. */
const SWEEP_SPREAD = Math.PI / 14;

/**
 * The Facility Manager. Lumbers after the player, and every couple of seconds does one of: a charge
 * across the room, a fan of clipboards swept at them, or a ring of clipboards. Below half health it
 * moves faster, sweeps wider, bursts twice, and can call in mannequins instead.
 */
export const facilityManager = defineBrain<Params, State>({
  init: (p) => {
    registry.enemies.get(p.summon);
    return { phase: 'chase', t: 0, projectile: registry.projectiles.get(p.projectile), until: 2, heading: 0 };
  },
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    const enraged = e.hp < e.maxHp * p.enrageAt;
    const { angle } = toPlayer(ctx);
    const shot = { damage: p.damage };
    const recover = () => enter(s, 'recover');
    switch (s.phase) {
      case 'chase': {
        chase(ctx, e.def.speed * (enraged ? p.enragedSpeed : 1));
        if (s.t < s.until) break;
        const options: Attack[] = ['charge', 'sweep', 'burst'];
        if (enraged && summonsOf(ctx) < p.maxSummons) options.push('summon');
        const next = options[Math.floor(Math.random() * options.length)]!;
        if (next === 'summon') {
          for (let i = 0; i < p.summonCount && summonsOf(ctx) < p.maxSummons; i++) {
            const a = Math.random() * Math.PI * 2;
            summon(ctx, p.summon, e.x + Math.cos(a) * 1.6, e.y + Math.sin(a) * 1.6);
          }
          recover();
        } else {
          enter(s, next === 'charge' ? 'chargeWindup' : next === 'sweep' ? 'sweepWindup' : 'burstWindup');
        }
        break;
      }
      case 'chargeWindup':
        e.pose('windup', p.chargeWindup);
        s.heading = angle;
        if (s.t >= p.chargeWindup) enter(s, 'charge');
        break;
      case 'charge':
        e.facing = s.heading;
        go(e, s.heading, p.chargeSpeed);
        if (e.bumped) game.shake(0.25);
        if (s.t >= p.chargeTime || e.bumped) recover();
        break;
      case 'sweepWindup':
        e.pose('windup', p.sweepWindup);
        if (s.t >= p.sweepWindup) {
          fan(ctx, s.projectile, angle, enraged ? p.enragedSweepCount : p.sweepCount, SWEEP_SPREAD, { ...shot, speedMul: 1.2 });
          game.shake(0.15);
          recover();
        }
        break;
      case 'burstWindup':
        e.pose('windup', p.burstWindup);
        if (s.t >= p.burstWindup) {
          ring(ctx, s.projectile, p.burstCount, { ...shot, speedMul: 0.8 });
          if (enraged) enter(s, 'burstAgain');
          else recover();
        }
        break;
      case 'burstAgain':
        e.pose('windup', p.burstGap);
        if (s.t >= p.burstGap) {
          ring(ctx, s.projectile, p.burstCount, { ...shot, speedMul: 0.8 });
          recover();
        }
        break;
      case 'recover':
        if (s.t >= p.recover) {
          s.until = between(p.chase);
          enter(s, 'chase');
        }
        break;
    }
  },
});
