import type { EnemyDef } from '../types';

export default {
  id: 'hr_rep',
  name: 'HR Representative',
  sprite: 'td:84',
  radius: 0.36,
  hp: 9,
  threat: 5,
  tags: ['ranged', 'teleporter'],
  speed: 0,
  movementKind: 'walk',
  movement: { id: 'teleport', params: { interval: 3.2, minDist: 3 } },
  attacks: [
    { id: 'contact', params: { damage: 1 } },
    {
      id: 'radialBurst',
      params: { projectile: 'memo', count: 8, cooldown: 3.2, damage: 1, initialDelay: 1.6 },
    },
  ],
  lootTable: 'tough',
  light: { radius: 1.6, color: 0xb060ff, intensity: 0.5 },
} satisfies EnemyDef;
