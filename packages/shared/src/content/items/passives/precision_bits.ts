import type { PassiveDef } from '../../types';

export default {
  id: 'precision_bits',
  kind: 'passive',
  name: 'Precision Bits',
  description: 'Projectiles fly 30% faster.',
  icon: 'proc:feather',
  mods: [{ stat: 'projectileSpeed', mul: 1.3 }],
} satisfies PassiveDef;
