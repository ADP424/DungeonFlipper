import type { ToolDef } from '../../types';

export default {
  id: 'wood_kit',
  kind: 'tool',
  name: 'Wood Wall Kit',
  description: 'Build a low wood wall (costs 1); click it again to raise it to full height (costs 1 more).',
  icon: 'proc:kit:wood',
  action: { id: 'buildWall', params: { short: 'wood_wall_short', tall: 'wood_wall' } },
  uses: 16,
} satisfies ToolDef;
