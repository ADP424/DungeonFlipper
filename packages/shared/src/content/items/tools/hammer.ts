import type { ToolDef } from '../../types';

export default {
  id: 'hammer',
  kind: 'tool',
  name: 'Hammer',
  description: 'Demolish walls and spikes in rooms you own. Low walls cost 1, everything else 2.',
  icon: 'td:117',
  action: { id: 'demolish' },
  uses: 20,
} satisfies ToolDef;
