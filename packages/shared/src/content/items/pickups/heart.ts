import type { PickupDef } from '../../types';

export default {
  id: 'heart',
  kind: 'pickup',
  name: 'Heart',
  description: 'Heals one heart.',
  icon: 'proc:heart',
  effect: { id: 'heal', params: { halves: 2 } },
} satisfies PickupDef;
