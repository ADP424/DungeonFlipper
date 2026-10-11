import type { WeaponDef } from '../../types';

export default {
  id: 'pipe_wrench',
  kind: 'weapon',
  name: 'Pipe Wrench',
  description: 'Smashes the floor in front of you, knocking things back.',
  icon: 'items/weapons/pipe_wrench',
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
