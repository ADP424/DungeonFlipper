import type { PassiveDef } from '../../types';

export default {
  id: 'double_nozzle',
  kind: 'passive',
  name: 'Double Nozzle',
  description: 'Ranged tools fire one extra projectile.',
  icon: 'proc:twin',
  mods: [{ stat: 'extraProjectiles', add: 1 }],
} satisfies PassiveDef;
