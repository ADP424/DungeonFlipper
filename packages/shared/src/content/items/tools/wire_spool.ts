import type { ToolDef } from '../../types';

export default {
  id: 'wire_spool',
  kind: 'tool',
  name: 'Wire Spool',
  description: 'Runs power through floors and walls: click or drag along tiles (1 per tile). While you hold it you see the wiring. Use it on sparking wire to fix it.',
  icon: 'items/tools/wire_spool',
  action: { id: 'layUtility', params: { kind: 'power' } },
  uses: 40,
  price: 8,
} satisfies ToolDef;
