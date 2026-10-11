import type { EnemyDef } from '../types';

/**
 * Lumbers after you, and in between charges across the room, sweeps a fan of clipboards at you, or
 * throws a ring of them. Below half health it's faster, bursts twice and calls in mannequins.
 */
export default {
  id: 'facility_manager',
  name: 'The Facility Manager',
  sprite: 'bosses/facility_manager/idle',
  tint: 0xd8d0c0,
  radius: 0.95,
  hp: 240,
  difficulty: 6,
  speed: 2.4,
  movementKind: 'walk',
  knockbackResist: 0.95,
  hazardImmune: true,
  ai: {
    id: 'facility_manager',
    params: {
      projectile: 'clipboard', damage: 1, summon: 'mannequin', enrageAt: 0.5, enragedSpeed: 1.3, chase: [1.5, 2.5],
      chargeWindup: 0.8, chargeSpeed: 10, chargeTime: 0.9,
      sweepWindup: 0.6, sweepCount: 7, enragedSweepCount: 9,
      burstWindup: 0.4, burstCount: 14, burstGap: 0.5,
      summonCount: 3, maxSummons: 5, recover: 0.8,
    },
  },
  contactDamage: 2,
  anims: { windup: { frames: 'bosses/facility_manager/windup' } },
  loot: [
    { chance: 1, entries: [{ chance: 1, cash: [20, 30] }] },
    { chance: 1, entries: [{ chance: 1, item: 'sandwich' }] },
    {
      chance: 1,
      entries: [
        { chance: 0.25, item: 'sledgehammer' },
        { chance: 0.25, item: 'rivet_gun' },
        { chance: 0.25, item: 'riot_vest' },
        { chance: 0.25, item: 'blowtorch' },
      ],
    },
    { chance: 1, entries: [{ chance: 0.7, item: 'steel_door' }, { chance: 0.3, item: 'blast_door' }] },
    { chance: 1, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
  boss: { title: 'The Facility Manager' },
  light: { radius: 3, color: 0xffe8c0, intensity: 0.5 },
} satisfies EnemyDef;
