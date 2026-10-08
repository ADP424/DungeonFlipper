import type { WeaponDef } from '../../types';

export default {
  id: 'short_sword',
  kind: 'weapon',
  name: 'Short Sword',
  description: 'A reliable sword with a medium swing.',
  icon: 'td:104',
  attack: {
    type: 'melee',
    pattern: 'arc',
    range: 1.25,
    damage: 3.5,
    cooldown: 0.4,
    windup: 0.05,
    duration: 0.15,
    knockback: 5,
    arcDegrees: 110,
  },
} satisfies WeaponDef;
