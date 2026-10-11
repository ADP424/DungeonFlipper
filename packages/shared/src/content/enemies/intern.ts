import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Skittish: circles out of reach, darts in for a hit and backs off. Braver the more of them there are. */
export default {
  id: 'intern',
  name: 'Intern',
  sprite: 'enemies/intern/idle',
  radius: 0.36,
  hp: 16,
  difficulty: 0.8,
  speed: 3.4,
  movementKind: 'walk',
  ai: {
    id: 'intern',
    params: { orbit: 3.5, circle: [1.4, 2.8], courage: 0.5, windup: 0.3, dartSpeed: 8.5, dartTime: 0.5, retreat: 0.8, retreatSpeed: 4.2 },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/intern/windup' } },
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [1, 4] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
