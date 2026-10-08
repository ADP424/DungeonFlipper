import type { ArmorDef } from '../../types';

export default {
  id: 'leather_armor',
  kind: 'armor',
  name: 'Leather Armor',
  description: 'Grants 1 armor heart. Breaks when depleted.',
  icon: 'proc:armor:leather',
  halves: 2,
} satisfies ArmorDef;
