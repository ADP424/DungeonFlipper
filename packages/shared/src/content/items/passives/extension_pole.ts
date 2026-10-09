import type { PassiveDef } from '../../types';

export default {
  id: 'extension_pole',
  kind: 'passive',
  name: 'Extension Pole',
  description: 'Melee tools reach a quarter tile further.',
  icon: 'proc:reach',
  mods: [{ stat: 'meleeRange', add: 0.25 }],
} satisfies PassiveDef;
