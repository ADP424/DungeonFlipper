import type { WeaponDef } from '../../types';

export default {
  id: 'blowtorch',
  kind: 'weapon',
  name: 'Blowtorch',
  description: 'Spits slow, bursting fireballs.',
  icon: 'items/weapons/blowtorch',
  attack: { type: 'ranged', projectile: 'torch_flame', damage: 5, cooldown: 0.7, knockback: 3 },
  light: { radius: 1.5, color: 0xff8030, intensity: 0.4 },
} satisfies WeaponDef;
