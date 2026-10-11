import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/**
 * Stays behind its colleagues throwing pens that curve after you (a swing knocks them down). Left
 * alone, it panics: runs, and hurls the stapler.
 */
export default {
  id: 'hr_rep',
  name: 'HR Representative',
  sprite: 'enemies/hr_rep/idle',
  radius: 0.36,
  hp: 22,
  difficulty: 2,
  speed: 2.6,
  movementKind: 'walk',
  ai: {
    id: 'hr_rep',
    params: {
      behind: 1.8, range: 9, cooldown: 2.2, windup: 0.5, pen: 'pen', penDamage: 1,
      panicSpeed: 3.9, stapler: 'thrown_stapler', staplerCooldown: 2.6, staplerDamage: 2, staplerRange: 7,
    },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/hr_rep/windup' } },
  held: { sprite: 'enemies/hr_rep/held', grip: 'carried' },
  loot: [
    { chance: 0.9, entries: [{ chance: 0.6, cash: [4, 8] }, { chance: 0.11, item: 'sandwich' }] },
    { chance: 0.35, entries: GEAR },
    { chance: 0.25, entries: SUPPLIES },
    { chance: 0.12, entries: [{ chance: 0.6, item: 'plank_barricade' }, { chance: 0.4, item: 'security_door' }] },
    { chance: 0.06, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
  light: { radius: 1.6, color: 0xb060ff, intensity: 0.5 },
} satisfies EnemyDef;
