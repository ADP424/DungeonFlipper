import type { EnemyDef } from '../types';

export default {
  id: 'bone_warden',
  name: 'The Bone Warden',
  sprite: 'td:109',
  tint: 0xd8d0c0,
  scale: 2.5,
  radius: 0.95,
  hp: 140,
  speed: 2.2,
  movementKind: 'walk',
  knockbackResist: 0.95,
  hazardImmune: true,
  movement: { id: 'boneWarden', params: { summon: 'skeleton', bone: 'bone' } },
  attacks: [{ id: 'contact', params: { damage: 2 } }],
  lootTable: 'boss',
  boss: { title: 'The Bone Warden' },
  light: { radius: 3, color: 0xffe8c0, intensity: 0.5 },
} satisfies EnemyDef;
