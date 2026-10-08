import type { PassiveDef } from '../../types';

export default {
  id: 'twin_shot',
  kind: 'passive',
  name: 'Twin Shot',
  description: 'Ranged weapons fire one extra projectile.',
  icon: 'proc:twin',
  mods: [{ stat: 'extraProjectiles', add: 1 }],
} satisfies PassiveDef;
