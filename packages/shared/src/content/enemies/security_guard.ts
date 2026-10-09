import type { EnemyDef } from '../types';

export default {
  id: 'security_guard',
  name: 'Security Guard',
  sprite: 'td:96',
  tint: 0x9090b0,
  radius: 0.4,
  hp: 14,
  threat: 6,
  tags: ['brute', 'charger'],
  speed: 1.6,
  movementKind: 'walk',
  knockbackResist: 0.6,
  movement: { id: 'charge', params: { windup: 0.6, speed: 9, duration: 0.6, cooldown: 2.2, range: 7 } },
  attacks: [{ id: 'contact', params: { damage: 2 } }],
  lootTable: 'tough',
} satisfies EnemyDef;
