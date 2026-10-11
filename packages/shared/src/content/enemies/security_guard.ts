import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/**
 * Advances behind a riot shield that stops everything from the front, turning to keep it on you, then
 * charges. The openings: its sides and back while it recovers, and all of it when it hits a wall.
 */
export default {
  id: 'security_guard',
  name: 'Security Guard',
  sprite: 'enemies/security_guard/idle',
  tint: 0x9090b0,
  radius: 0.4,
  hp: 30,
  difficulty: 2.5,
  speed: 1.9,
  movementKind: 'walk',
  knockbackResist: 0.6,
  ai: {
    id: 'security_guard',
    params: {
      shieldArc: 150, turnRate: 3.2, recoverTurnRate: 1.1, range: 6, cooldown: 2,
      windup: 0.55, chargeSpeed: 9.5, chargeTime: 0.7, recover: 0.6, stun: 1.3,
    },
  },
  contactDamage: 2,
  anims: {
    windup: { frames: 'enemies/security_guard/windup' },
    stunned: { frames: 'enemies/security_guard/stunned', fps: 6, loop: true },
  },
  held: { sprite: 'enemies/security_guard/held', grip: 'aimed' },
  loot: [
    { chance: 0.9, entries: [{ chance: 0.6, cash: [4, 9] }, { chance: 0.11, item: 'sandwich' }] },
    { chance: 0.35, entries: GEAR },
    { chance: 0.25, entries: SUPPLIES },
    { chance: 0.12, entries: [{ chance: 0.6, item: 'plank_barricade' }, { chance: 0.4, item: 'security_door' }] },
    { chance: 0.06, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
