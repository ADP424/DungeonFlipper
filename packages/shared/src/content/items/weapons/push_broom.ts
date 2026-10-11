import type { WeaponDef } from '../../types';

export default {
  id: 'push_broom',
  kind: 'weapon',
  name: 'Push Broom',
  description: 'A long reaching jab.',
  icon: 'items/weapons/push_broom',
  attack: {
    type: 'melee',
    pattern: 'stab',
    range: 2.25,
    damage: 4,
    cooldown: 0.55,
    windup: 0.08,
    duration: 0.14,
    knockback: 6,
    width: 0.4,
  },
} satisfies WeaponDef;
