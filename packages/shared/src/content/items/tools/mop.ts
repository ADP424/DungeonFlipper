import type { ToolDef } from '../../types';

export default {
  id: 'mop',
  kind: 'tool',
  name: 'Mop',
  description: 'Cleans up mess, a tile at a time: click, or hold and drag across the floor. Tenants hate living in a tip.',
  icon: 'items/tools/mop',
  action: { id: 'clean' },
  uses: 80,
  price: 6,
} satisfies ToolDef;
