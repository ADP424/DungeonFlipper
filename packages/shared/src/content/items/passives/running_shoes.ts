import type { PassiveDef } from '../../types';

export default {
  id: 'running_shoes',
  kind: 'passive',
  name: 'Running Shoes',
  description: 'Move 20% faster.',
  icon: 'proc:boots',
  mods: [{ stat: 'moveSpeed', mul: 1.2 }],
} satisfies PassiveDef;
