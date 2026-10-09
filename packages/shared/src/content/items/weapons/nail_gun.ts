import type { WeaponDef } from '../../types';

export default {
  id: 'nail_gun',
  kind: 'weapon',
  name: 'Nail Gun',
  description: 'Fires fast nails. With nothing alive in the room, it nails plywood over missing floor (1 use each).',
  icon: 'proc:bow',
  attack: { type: 'ranged', projectile: 'nail', damage: 3, cooldown: 0.45, spread: 3, knockback: 2 },
  tool: { action: { id: 'fill', params: { surface: 'plywood_patch' } }, uses: 4 },
} satisfies WeaponDef;
