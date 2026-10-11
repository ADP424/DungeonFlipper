import type { WeaponDef } from '../../types';

export default {
  id: 'sledgehammer',
  kind: 'weapon',
  name: 'Sledgehammer',
  description: 'Slow, wide and heavy. Hold it on any wall to knock it down, or on the structural wall between two rooms to knock it through (1 use each).',
  icon: 'items/weapons/sledgehammer',
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
  tool: { action: { id: 'demolish', params: { structural: true } }, uses: 8 },
} satisfies WeaponDef;
