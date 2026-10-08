import type { WeaponDef } from '../../types';

export default {
  id: 'alchemist_flask',
  kind: 'weapon',
  name: "Alchemist's Flasks",
  description: 'Lob fire flasks over low walls.',
  icon: 'td:115',
  attack: { type: 'ranged', projectile: 'fire_flask', damage: 6, cooldown: 1, knockback: 6 },
} satisfies WeaponDef;
