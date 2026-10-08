import type { WeaponDef } from '../../types';

export default {
  id: 'mace',
  kind: 'weapon',
  name: 'Mace',
  description: 'Smashes the ground in front of you, knocking foes back.',
  icon: 'proc:mace',
  attack: {
    type: 'melee',
    pattern: 'smash',
    range: 1.25,
    damage: 7,
    cooldown: 1,
    windup: 0.25,
    duration: 0.1,
    knockback: 12,
  },
} satisfies WeaponDef;
