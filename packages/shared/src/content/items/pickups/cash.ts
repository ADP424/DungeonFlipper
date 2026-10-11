import type { PickupDef } from '../../types';

export default {
  id: 'cash',
  kind: 'pickup',
  name: 'Cash',
  description: 'Crumpled bills.',
  icon: 'items/pickups/cash',
  effect: { id: 'cash' },
} satisfies PickupDef;
