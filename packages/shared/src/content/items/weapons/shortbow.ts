import type { WeaponDef } from '../../types';

export default {
  id: 'shortbow',
  kind: 'weapon',
  name: 'Shortbow',
  description: 'Fires fast arrows.',
  icon: 'proc:bow',
  attack: { type: 'ranged', projectile: 'arrow', damage: 3, cooldown: 0.45, spread: 3, knockback: 2 },
} satisfies WeaponDef;
