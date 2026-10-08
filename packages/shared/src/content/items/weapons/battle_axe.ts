import type { WeaponDef } from '../../types';

export default {
  id: 'battle_axe',
  kind: 'weapon',
  name: 'Battle Axe',
  description: 'Spin to hit everything around you.',
  icon: 'td:118',
  attack: {
    type: 'melee',
    pattern: 'spin',
    range: 1.25,
    damage: 5,
    cooldown: 1.1,
    windup: 0.1,
    duration: 0.3,
    knockback: 9,
  },
} satisfies WeaponDef;
