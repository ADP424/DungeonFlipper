import type { ToolDef } from '../../types';

export default {
  id: 'plaster_kit',
  kind: 'tool',
  name: 'Plaster Wall Kit',
  description: 'Build a low plaster wall (costs 1); click it again to raise it to full height (costs 1 more).',
  icon: 'proc:kit:plaster',
  action: { id: 'buildWall', params: { short: 'plaster_wall_short', tall: 'plaster_wall' } },
  uses: 16,
} satisfies ToolDef;
