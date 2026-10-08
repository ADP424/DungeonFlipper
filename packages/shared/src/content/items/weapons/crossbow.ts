import type { WeaponDef } from '../../types';

export default {
  id: 'crossbow',
  kind: 'weapon',
  name: 'Crossbow',
  description: 'Very fast, piercing bolts with a slow reload.',
  icon: 'proc:crossbow',
  attack: { type: 'ranged', projectile: 'bolt', damage: 6, cooldown: 1.1, knockback: 4 },
} satisfies WeaponDef;
