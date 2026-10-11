import type { ToolDef } from '../../types';

/** Put it down in a unit of your property to list it for rent. Applicants come up from the lobby. */
export default {
  id: 'for_rent_sign',
  kind: 'tool',
  name: 'For Rent Sign',
  description: 'Stand it on the floor of a furnished unit (with a bed) to list it. Click it to open or close the listing; lift it like furniture to move it.',
  icon: 'items/tools/for_rent_sign',
  action: { id: 'placeSign' },
  uses: 1,
  price: 10,
} satisfies ToolDef;
