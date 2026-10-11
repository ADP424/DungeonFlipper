import type { RollDef } from '../../types';

export default {
  id: 'roll_wood_oak',
  kind: 'roll',
  name: 'Oak Flooring',
  description: 'Covers floor tiles (and doorways). Each tile costs 1.',
  icon: 'items/rolls/roll_wood_oak',
  surface: 'wood_oak',
  coverage: 32,
} satisfies RollDef;
