import type { FurnitureDef } from '../types';

export default {
  id: 'brazier',
  name: 'Brazier',
  size: { w: 1, h: 1 },
  sprite: 'ri:182',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.9,
  light: { radius: 8, color: 0xffa040, intensity: 1.5, flicker: 0.25, shadows: true, height: 1.1 },
} satisfies FurnitureDef;
