import type { ToolDef } from '../../types';

/** Plant one in a cleared room to claim it for the company. Found as loot, or $10 from the Hardware app. */
export default {
  id: 'company_flag',
  kind: 'tool',
  name: 'Company Flag',
  description: 'Plant it in a cleared room to claim the room as company property. One per room.',
  icon: 'proc:flag',
  action: { id: 'plantFlag' },
  uses: 1,
  price: 10,
} satisfies ToolDef;
