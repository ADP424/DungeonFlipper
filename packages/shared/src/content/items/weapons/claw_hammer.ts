import type { WeaponDef } from '../../types';

export default {
  id: 'claw_hammer',
  kind: 'weapon',
  name: 'Claw Hammer',
  description: 'A light, quick hit. With nothing alive in the room, it demolishes walls and broken glass (low walls 1 use, everything else 2).',
  icon: 'td:117',
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
