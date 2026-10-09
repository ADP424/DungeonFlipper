import type { ToolDef } from '../../types';

export default {
  id: 'blast_door',
  kind: 'tool',
  name: 'Blast Door',
  description: 'Fit a blast door (tier 4), for the deepest frontiers. Click it again to repair. 1 use each.',
  icon: 'proc:barricade:4',
  action: { id: 'barricade', params: { tier: 4 } },
  uses: 2,
  price: 150,
} satisfies ToolDef;
