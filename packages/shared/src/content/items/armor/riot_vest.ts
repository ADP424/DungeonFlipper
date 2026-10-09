import type { ArmorDef } from '../../types';

export default {
  id: 'riot_vest',
  kind: 'armor',
  name: 'Riot Vest',
  description: 'Grants 3 armor hearts, but slows you a little.',
  icon: 'proc:armor:plate',
  halves: 6,
  mods: [{ stat: 'moveSpeed', mul: 0.9 }],
} satisfies ArmorDef;
