import type { WeaponDef } from '../../types';

export default {
  id: 'cleaning_spray',
  kind: 'weapon',
  name: 'Cleaning Spray',
  description: 'Lob bottles of something industrial over low walls.',
  icon: 'items/weapons/cleaning_spray',
  attack: { type: 'ranged', projectile: 'spray_bottle', damage: 6, cooldown: 1, knockback: 6 },
} satisfies WeaponDef;
