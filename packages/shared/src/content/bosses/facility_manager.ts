import type { EnemyDef } from '../types';

export default {
  id: 'facility_manager',
  name: 'The Facility Manager',
  sprite: 'td:109',
  tint: 0xd8d0c0,
  scale: 2.5,
  radius: 0.95,
  hp: 140,
  threat: 25,
  tags: ['boss', 'summoner'],
  speed: 2.2,
  movementKind: 'walk',
  knockbackResist: 0.95,
  hazardImmune: true,
  movement: { id: 'facilityManager', params: { summon: 'mannequin', bone: 'clipboard' } },
  attacks: [{ id: 'contact', params: { damage: 2 } }],
  lootTable: 'boss',
  boss: { title: 'The Facility Manager', minDifficulty: 3 },
  light: { radius: 3, color: 0xffe8c0, intensity: 0.5 },
} satisfies EnemyDef;
