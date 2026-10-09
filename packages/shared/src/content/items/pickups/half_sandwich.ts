import type { PickupDef } from '../../types';

export default {
  id: 'half_sandwich',
  kind: 'pickup',
  name: 'Half Sandwich',
  description: 'Heals half a heart.',
  icon: 'proc:heart_half',
  effect: { id: 'heal', params: { halves: 1 } },
} satisfies PickupDef;
