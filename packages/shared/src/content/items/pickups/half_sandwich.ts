import type { PickupDef } from '../../types';

export default {
  id: 'half_sandwich',
  kind: 'pickup',
  name: 'Half Sandwich',
  description: 'Heals half a heart.',
  icon: 'items/pickups/half_sandwich',
  effect: { id: 'heal', params: { halves: 1 } },
} satisfies PickupDef;
