import type { PassiveDef } from '../../types';

export default {
  id: 'fletching',
  kind: 'passive',
  name: 'Fine Fletching',
  description: 'Projectiles fly 30% faster.',
  icon: 'proc:feather',
  mods: [{ stat: 'projectileSpeed', mul: 1.3 }],
} satisfies PassiveDef;
