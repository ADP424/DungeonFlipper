import type { KitDef } from '../../types';

/** A toolbox for the hotbar: six renovation tools in one slot. Click it to open; double-click a tool to take it in hand. */
export default {
  id: 'toolkit',
  kind: 'kit',
  name: 'Toolkit',
  description: 'Holds up to six tools, rolls or tool-weapons in one hotbar slot. Click it to open it.',
  icon: 'proc:toolkit',
  slots: 6,
  price: 12,
} satisfies KitDef;
