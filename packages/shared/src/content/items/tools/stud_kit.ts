import type { ToolDef } from '../../types';

export default {
  id: 'stud_kit',
  kind: 'tool',
  name: 'Stud Kit',
  description: 'Build a low timber partition (costs 1); click it again to raise it to full height (costs 1 more).',
  icon: 'items/tools/stud_kit',
  action: { id: 'buildWall', params: { short: 'timber_wall_short', tall: 'timber_wall' } },
  uses: 16,
  price: 10,
} satisfies ToolDef;
