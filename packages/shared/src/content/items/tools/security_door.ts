import type { ToolDef } from '../../types';

export default {
  id: 'security_door',
  kind: 'tool',
  name: 'Security Door',
  description: 'Fit a lockable door (tier 2): you walk through, monsters bash at it. Click it again to repair. 1 use each.',
  icon: 'proc:barricade:2',
  action: { id: 'barricade', params: { tier: 2 } },
  uses: 2,
  price: 25,
} satisfies ToolDef;
