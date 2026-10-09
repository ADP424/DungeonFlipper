import type { ToolDef } from '../../types';

export default {
  id: 'plank_barricade',
  kind: 'tool',
  name: 'Plank Barricade',
  description: 'Board up a door (tier 1). Blocks you too: pry it off with a crowbar to pass. Click it again to repair. 1 use each.',
  icon: 'proc:barricade:1',
  action: { id: 'barricade', params: { tier: 1 } },
  uses: 3,
  price: 5,
} satisfies ToolDef;
