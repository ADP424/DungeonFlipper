import type { PassiveDef } from '../../types';

export default {
  id: 'energy_drink',
  kind: 'passive',
  name: 'Energy Drink',
  description: '+1 max heart, and heals one heart.',
  icon: 'proc:heart_container',
  mods: [{ stat: 'maxRedHalves', add: 2 }],
  effects: [{ id: 'heal', params: { halves: 2 } }],
} satisfies PassiveDef;
