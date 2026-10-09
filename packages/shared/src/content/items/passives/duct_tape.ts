import type { PassiveDef } from '../../types';

export default {
  id: 'duct_tape',
  kind: 'passive',
  name: 'Duct Tape',
  description: '+1 damage to all attacks. It fixes everything.',
  icon: 'proc:whetstone',
  mods: [{ stat: 'damage', add: 1 }],
} satisfies PassiveDef;
