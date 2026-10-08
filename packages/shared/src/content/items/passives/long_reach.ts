import type { PassiveDef } from '../../types';

export default {
  id: 'long_reach',
  kind: 'passive',
  name: 'Long Reach',
  description: 'Melee weapons reach a quarter tile further.',
  icon: 'proc:reach',
  mods: [{ stat: 'meleeRange', add: 0.25 }],
} satisfies PassiveDef;
