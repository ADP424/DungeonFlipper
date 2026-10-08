import type { PassiveDef } from '../../types';

export default {
  id: 'quickdraw',
  kind: 'passive',
  name: 'Quickdraw Gloves',
  description: 'Attack 20% more often.',
  icon: 'proc:gloves',
  mods: [{ stat: 'cooldown', mul: 0.8 }],
} satisfies PassiveDef;
