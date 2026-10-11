import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Keeps something between you and it, steps out to fire a burst of staples, and moves when you close in. */
export default {
  id: 'stapler_clerk',
  name: 'Stapler Clerk',
  sprite: 'enemies/stapler_clerk/idle',
  tint: 0xe8e2d0,
  radius: 0.35,
  hp: 20,
  difficulty: 1.5,
  speed: 3,
  movementKind: 'walk',
  ai: {
    id: 'stapler_clerk',
    params: {
      near: 3.5, far: 6.5, tooClose: 2.4, hide: [0.5, 1.1], peek: 1.2, windup: 0.45,
      projectile: 'staple', burst: 3, burstGap: 0.13, spread: 5, damage: 1,
    },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/stapler_clerk/windup' } },
  held: { sprite: 'enemies/stapler_clerk/held', grip: 'carried' },
  loot: [
    { chance: 0.9, entries: [{ chance: 0.6, cash: [3, 7] }, { chance: 0.11, item: 'sandwich' }] },
    { chance: 0.35, entries: GEAR },
    { chance: 0.25, entries: SUPPLIES },
    { chance: 0.12, entries: [{ chance: 0.6, item: 'plank_barricade' }, { chance: 0.4, item: 'security_door' }] },
    { chance: 0.06, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
