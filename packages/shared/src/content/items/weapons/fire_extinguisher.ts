import type { WeaponDef } from '../../types';

export default {
  id: 'fire_extinguisher',
  kind: 'weapon',
  name: 'Fire Extinguisher',
  description: 'Slow clouds of foam that pierce several foes.',
  icon: 'items/weapons/fire_extinguisher',
  attack: { type: 'ranged', projectile: 'foam_cloud', damage: 3, cooldown: 0.6 },
  light: { radius: 1.5, color: 0x80d0ff, intensity: 0.4 },
} satisfies WeaponDef;
