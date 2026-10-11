import type { ToolDef } from '../../types';

export default {
  id: 'steel_door',
  kind: 'tool',
  name: 'Steel Door',
  description: 'Fit a steel door (tier 3). Click it again to repair. 1 use each.',
  icon: 'items/tools/steel_door',
  action: { id: 'barricade', params: { tier: 3 } },
  uses: 2,
  price: 60,
} satisfies ToolDef;
