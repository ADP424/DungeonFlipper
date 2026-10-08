import type { PickupDef } from '../../types';

export default {
  id: 'heart_half',
  kind: 'pickup',
  name: 'Half Heart',
  description: 'Heals half a heart.',
  icon: 'proc:heart_half',
  effect: { id: 'heal', params: { halves: 1 } },
} satisfies PickupDef;
