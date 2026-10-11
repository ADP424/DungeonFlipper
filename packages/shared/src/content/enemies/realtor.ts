import type { EnemyDef } from '../types';

/**
 * A rival realtor in their office (P8). Minds their own business until you give them a reason; then
 * they keep away from you and phone for security rather than fight.
 */
export default {
  id: 'realtor',
  name: 'Realtor',
  sprite: 'enemies/realtor/idle',
  tint: 0xffe0a0,
  radius: 0.36,
  hp: 60,
  difficulty: 3,
  speed: 3.6,
  movementKind: 'walk',
  knockbackResist: 0.4,
  ai: { id: 'realtor', params: { safe: 5, callCooldown: 7, callTime: 0.9, guard: 'realtor_guard', maxGuards: 2, guardDistance: 4 } },
  anims: { call: { frames: 'enemies/realtor/call' } },
  held: { sprite: 'enemies/realtor/held', grip: 'carried' },
  npc: true,
} satisfies EnemyDef;
