import type { FurnitureDef } from '../types';

/** The glowing crack between your apartment closet and Level 1's lobby. Walk into it to step through (with whatever you're carrying). */
export default {
  id: 'portal',
  name: 'The Crack',
  size: { w: 1, h: 1 },
  sprite: 'proc:portal',
  rotatable: false,
  height: 1.8,
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: [],
  light: { radius: 3.5, color: 0xffe9a0, intensity: 0.7, flicker: 0.25, height: 1.2 },
  fixed: true,
} satisfies FurnitureDef;
