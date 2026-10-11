import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Blinks out, comes back somewhere else already firing. Only there to be hit while you can see it. */
export default {
  id: 'flicker',
  name: 'Flicker',
  sprite: 'enemies/flicker/idle',
  tint: 0xd0b0ff,
  radius: 0.33,
  hp: 14,
  difficulty: 1.2,
  speed: 1.2,
  movementKind: 'fly',
  hazardImmune: true,
  ai: {
    id: 'flicker',
    params: { visible: [1.3, 2], fade: 0.3, gone: [0.5, 1.1], appear: 0.4, near: 3, far: 6.5, projectile: 'memo', shots: 3, spread: 22, damage: 1 },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/flicker/windup' } },
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [2, 4] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
  light: { radius: 2.2, color: 0xc090ff, intensity: 0.7 },
} satisfies EnemyDef;
