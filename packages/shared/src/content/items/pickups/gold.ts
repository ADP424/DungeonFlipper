import type { PickupDef } from '../../types';

export default {
  id: 'gold',
  kind: 'pickup',
  name: 'Gold',
  description: 'Shiny coins.',
  icon: 'proc:coin',
  effect: { id: 'gold' },
} satisfies PickupDef;
