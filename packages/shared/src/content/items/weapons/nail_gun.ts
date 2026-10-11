import type { WeaponDef } from '../../types';

export default {
  id: 'nail_gun',
  kind: 'weapon',
  name: 'Nail Gun',
  description: 'Fires fast nails. Hold it on a worn barricade to nail it back together (10 durability a use).',
  icon: 'items/weapons/nail_gun',
  attack: { type: 'ranged', projectile: 'nail', damage: 3, cooldown: 0.45, spread: 3, knockback: 2 },
  tool: { action: { id: 'repairBarricade', params: { hp: 10 } }, uses: 4 },
} satisfies WeaponDef;
