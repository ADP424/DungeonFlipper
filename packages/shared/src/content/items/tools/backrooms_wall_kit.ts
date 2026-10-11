import type { ToolDef } from '../../types';

export default {
  id: 'backrooms_wall_kit',
  kind: 'tool',
  name: 'Backrooms Wall Kit',
  description: 'Build a low wall like the ones down here (costs 1); click it again to raise it to full height (costs 1 more).',
  icon: 'items/tools/backrooms_wall_kit',
  action: { id: 'buildWall', params: { short: 'backrooms_wall_short', tall: 'backrooms_wall' } },
  uses: 16,
} satisfies ToolDef;
