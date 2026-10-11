import type { PickupDef } from '../../types';

export default {
  id: 'sandwich',
  kind: 'pickup',
  name: 'Sandwich',
  description: 'Heals one heart.',
  icon: 'items/pickups/sandwich',
  effect: { id: 'heal', params: { halves: 2 } },
} satisfies PickupDef;
