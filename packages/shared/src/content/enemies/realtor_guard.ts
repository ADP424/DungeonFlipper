import type { EnemyDef } from '../types';

/**
 * Private security at a wealthy realtor's office: steps in if you attack or rob their boss. Circles
 * at range firing a taser, and shoves you away with the baton when you get close.
 */
export default {
  id: 'realtor_guard',
  name: 'Office Security',
  sprite: 'enemies/realtor_guard/idle',
  tint: 0x7080c8,
  radius: 0.4,
  hp: 45,
  difficulty: 3,
  speed: 2.6,
  movementKind: 'walk',
  knockbackResist: 0.6,
  ai: {
    id: 'realtor_guard',
    params: {
      near: 3, far: 4.8, cooldown: 2, windup: 0.5, projectile: 'taser_dart', damage: 1,
      shoveRange: 1.7, shoveWindup: 0.25, shoveSpeed: 8.5, shoveTime: 0.25, recover: 0.5,
    },
  },
  contactDamage: 2,
  anims: { windup: { frames: 'enemies/realtor_guard/windup' } },
  held: { sprite: 'enemies/realtor_guard/held', grip: 'aimed' },
  npc: true,
} satisfies EnemyDef;
