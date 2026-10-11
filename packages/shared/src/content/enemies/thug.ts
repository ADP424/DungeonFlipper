import type { EnemyDef } from '../types';

/** Hired muscle sent by a hostile realtor to carry off your furniture. Sidesteps around you between heavy lunges. */
export default {
  id: 'thug',
  name: 'Thug',
  sprite: 'enemies/thug/idle',
  tint: 0xc87070,
  radius: 0.38,
  hp: 28,
  difficulty: 2,
  speed: 3.2,
  movementKind: 'walk',
  knockbackResist: 0.3,
  ai: { id: 'thug', params: { reach: 2.4, strafe: [0.6, 1.3], strafeSpeed: 2.6, windup: 0.45, lungeSpeed: 10.5, lungeTime: 0.32, recover: 0.55 } },
  contactDamage: 2,
  anims: { windup: { frames: 'enemies/thug/windup' } },
  held: { sprite: 'enemies/thug/held', grip: 'aimed' },
  npc: true,
} satisfies EnemyDef;
