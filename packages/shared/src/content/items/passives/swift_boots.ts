import type { PassiveDef } from '../../types';

export default {
  id: 'swift_boots',
  kind: 'passive',
  name: 'Swift Boots',
  description: 'Move 20% faster.',
  icon: 'proc:boots',
  mods: [{ stat: 'moveSpeed', mul: 1.2 }],
} satisfies PassiveDef;
