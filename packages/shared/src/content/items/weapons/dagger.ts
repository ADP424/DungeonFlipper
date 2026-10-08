import type { WeaponDef } from '../../types';

export default {
  id: 'dagger',
  kind: 'weapon',
  name: 'Dagger',
  description: 'A quick, short stab right in front of you.',
  icon: 'td:103',
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
