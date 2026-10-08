import type { WeaponDef } from '../../types';

export default {
  id: 'broadsword',
  kind: 'weapon',
  name: 'Broadsword',
  description: 'Slow, wide and long sweeping arc.',
  icon: 'td:106',
  attack: {
    type: 'melee',
    pattern: 'arc',
    range: 1.75,
    damage: 6,
    cooldown: 0.85,
    windup: 0.15,
    duration: 0.22,
    knockback: 8,
    arcDegrees: 170,
  },
} satisfies WeaponDef;
