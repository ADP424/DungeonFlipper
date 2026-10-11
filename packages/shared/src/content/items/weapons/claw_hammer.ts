import type { WeaponDef } from '../../types';

export default {
  id: 'claw_hammer',
  kind: 'weapon',
  name: 'Claw Hammer',
  description: 'A light, quick hit. Hold it on a wall or broken glass to demolish it (1 use each).',
  icon: 'items/weapons/claw_hammer',
  attack: {
    type: 'melee',
    pattern: 'stab',
    range: 0.7,
    damage: 2,
    cooldown: 0.3,
    windup: 0.04,
    duration: 0.1,
    knockback: 4,
    width: 0.6,
  },
  tool: { action: { id: 'demolish' }, uses: 20 },
} satisfies WeaponDef;
