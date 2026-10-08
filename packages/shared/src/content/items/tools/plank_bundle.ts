import type { ToolDef } from '../../types';

export default {
  id: 'plank_bundle',
  kind: 'tool',
  name: 'Plank Bundle',
  description: 'Floor over pits in rooms you own. Each pit costs 1.',
  icon: 'proc:planks',
  action: { id: 'fill', params: { surface: 'wood_rough' } },
  uses: 12,
} satisfies ToolDef;
