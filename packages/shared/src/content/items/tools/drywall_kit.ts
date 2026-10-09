import type { ToolDef } from '../../types';

export default {
  id: 'drywall_kit',
  kind: 'tool',
  name: 'Drywall Kit',
  description: 'Build a low drywall partition (costs 1); click it again to raise it to full height (costs 1 more).',
  icon: 'proc:kit:plaster',
  action: { id: 'buildWall', params: { short: 'drywall_short', tall: 'drywall' } },
  uses: 16,
  price: 12,
} satisfies ToolDef;
