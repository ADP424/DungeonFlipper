import type { ToolDef } from '../../types';

export default {
  id: 'pipe_bundle',
  kind: 'tool',
  name: 'Pipe Bundle',
  description: 'Runs water through floors and walls: click or drag along tiles (1 per tile). While you hold it you see the plumbing. Use it on a leaking pipe to fix it.',
  icon: 'items/tools/pipe_bundle',
  action: { id: 'layUtility', params: { kind: 'water' } },
  uses: 40,
  price: 8,
} satisfies ToolDef;
