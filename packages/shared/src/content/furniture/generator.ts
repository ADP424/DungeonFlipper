import type { FurnitureDef } from '../types';

/** A humming diesel generator: powers every wire connected to it (P6). Every lobby has one. */
export default {
  id: 'generator',
  name: 'Generator',
  size: { w: 2, h: 1 },
  sprite: { tiles: [['proc:generator_l', 'proc:generator_r']] },
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.9,
  light: { radius: 2.2, color: 0x80ff90, intensity: 0.6, flicker: 0.1, height: 0.8 },
  fixed: true,
  utility: { provides: 'power' },
} satisfies FurnitureDef;
