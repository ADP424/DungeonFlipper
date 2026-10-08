import type { PassiveDef } from '../../types';

export default {
  id: 'whetstone',
  kind: 'passive',
  name: 'Whetstone',
  description: '+1 damage to all attacks.',
  icon: 'proc:whetstone',
  mods: [{ stat: 'damage', add: 1 }],
} satisfies PassiveDef;
