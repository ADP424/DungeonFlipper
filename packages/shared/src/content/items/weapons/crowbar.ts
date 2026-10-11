import type { WeaponDef } from '../../types';

export default {
  id: 'crowbar',
  kind: 'weapon',
  name: 'Crowbar',
  description: 'A trusty crowbar with a medium swing. Hold it on a low wall to pry it out, or on a barricade to pry it off whole, so you can put it up again (1 use each).',
  icon: 'items/weapons/crowbar',
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
  tool: { action: { id: 'demolish', params: { maxHeight: 'short', pry: true } }, uses: 6 },
} satisfies WeaponDef;
