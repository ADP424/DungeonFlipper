import type { WeaponDef } from '../../types';

export default {
  id: 'rivet_gun',
  kind: 'weapon',
  name: 'Rivet Gun',
  description: 'Very fast, piercing rivets with a slow reload.',
  icon: 'proc:crossbow',
  attack: { type: 'ranged', projectile: 'rivet', damage: 6, cooldown: 1.1, knockback: 4 },
} satisfies WeaponDef;
