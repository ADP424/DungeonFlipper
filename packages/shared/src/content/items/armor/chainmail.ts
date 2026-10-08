import type { ArmorDef } from '../../types';

export default {
  id: 'chainmail',
  kind: 'armor',
  name: 'Chainmail',
  description: 'Grants 2 armor hearts. Breaks when depleted.',
  icon: 'proc:armor:chain',
  halves: 4,
} satisfies ArmorDef;
