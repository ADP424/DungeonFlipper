import type { WeaponDef } from '../../types';

export default {
  id: 'fire_axe',
  kind: 'weapon',
  name: 'Fire Axe',
  description: 'Spin to hit everything around you. With nothing alive in the room, it chops down walls (low 1 use, tall 2).',
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
  tool: { action: { id: 'demolish' }, uses: 6 },
} satisfies WeaponDef;
