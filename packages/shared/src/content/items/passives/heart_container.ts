import type { PassiveDef } from '../../types';

export default {
  id: 'heart_container',
  kind: 'passive',
  name: 'Heart Container',
  description: '+1 max heart, and heals one heart.',
  icon: 'proc:heart_container',
  mods: [{ stat: 'maxRedHalves', add: 2 }],
  effects: [{ id: 'heal', params: { halves: 2 } }],
} satisfies PassiveDef;
