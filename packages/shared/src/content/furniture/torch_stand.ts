import type { FurnitureDef } from '../types';

export default {
  id: 'torch_stand',
  name: 'Torch Stand',
  size: { w: 1, h: 1 },
  sprite: 'ri:182',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 1.2,
  light: { radius: 9, color: 0xffa040, intensity: 1.6, flicker: 0.3, shadows: true, height: 1.4 },
} satisfies FurnitureDef;
