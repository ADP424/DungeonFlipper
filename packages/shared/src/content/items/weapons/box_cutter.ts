import type { WeaponDef } from '../../types';

export default {
  id: 'box_cutter',
  kind: 'weapon',
  name: 'Box Cutter',
  description: 'A quick, short slash right in front of you.',
  icon: 'items/weapons/box_cutter',
  attack: {
    type: 'melee',
    pattern: 'stab',
    range: 0.75,
    damage: 2.5,
    cooldown: 0.22,
    windup: 0.02,
    duration: 0.1,
    knockback: 3,
    width: 0.45,
  },
} satisfies WeaponDef;
