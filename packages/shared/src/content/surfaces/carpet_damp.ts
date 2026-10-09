import type { SurfaceDef } from '../types';

/** The default Backrooms floor: moist, beige office carpet. */
export default {
  id: 'carpet_damp',
  name: 'Damp Carpet',
  applies: 'floor',
  pattern: { style: 'weave', base: 0x9a8c62, accent: 0x8c7e56 },
} satisfies SurfaceDef;
