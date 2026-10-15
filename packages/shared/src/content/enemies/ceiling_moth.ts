import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Flutters slowly away from you, then swoops straight through where you stand. */
export default {
  id: 'ceiling_moth',
  name: 'Ceiling Moth',
  sprite: 'enemies/ceiling_moth/idle',
  radius: 0.3,
  hp: 8,
  difficulty: 0.3,
  speed: 1.6,
  movementKind: 'fly',
  hazardImmune: true,
  ai: {
    id: 'ceiling_moth',
    params: { keepAway: 4.5, flutter: [1.2, 2.6], wobble: 0.35, windup: 0.4, swoopSpeed: 9.5, overshoot: 1.75, recover: 0.6 },
  },
  contactDamage: 1,
  anims: {
    idle: { frames: 'enemies/ceiling_moth/idle', loop: true },
    windup: { frames: 'enemies/ceiling_moth/windup', loop: true, flicker: 'fastest' },
  },
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [1, 3] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
