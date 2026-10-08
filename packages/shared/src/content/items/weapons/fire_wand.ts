import type { WeaponDef } from '../../types';

export default {
  id: 'fire_wand',
  kind: 'weapon',
  name: 'Fire Wand',
  description: 'Casts slow, bursting fireballs.',
  icon: 'td:129',
  attack: { type: 'ranged', projectile: 'fireball', damage: 5, cooldown: 0.7, knockback: 3 },
  light: { radius: 1.5, color: 0xff8030, intensity: 0.4 },
} satisfies WeaponDef;
