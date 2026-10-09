import type { ToolDef } from '../../types';

export default {
  id: 'plywood',
  kind: 'tool',
  name: 'Plywood',
  description: 'Patch over missing floor. Each hole costs 1.',
  icon: 'proc:planks',
  action: { id: 'fill', params: { surface: 'plywood_patch' } },
  uses: 12,
  price: 8,
} satisfies ToolDef;
