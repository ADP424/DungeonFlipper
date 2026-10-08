import type { WeaponDef } from '../../types';

export default {
  id: 'frost_staff',
  kind: 'weapon',
  name: 'Frost Staff',
  description: 'Slow orbs of frost that pierce several foes.',
  icon: 'td:130',
  attack: { type: 'ranged', projectile: 'frost_orb', damage: 3, cooldown: 0.6 },
  light: { radius: 1.5, color: 0x80d0ff, intensity: 0.4 },
} satisfies WeaponDef;
