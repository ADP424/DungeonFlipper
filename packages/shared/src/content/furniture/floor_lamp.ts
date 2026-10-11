import type { FurnitureDef } from '../types';

export default {
  id: 'floor_lamp',
  name: 'Floor Lamp',
  size: { w: 1, h: 1 },
  sprite: 'furniture/floor_lamp',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 1.4,
  // Solid only at its stand: you can walk behind the pole.
  collision: [{ x: 4, y: 10, w: 8, h: 5 }],
  light: { radius: 9, color: 0xfff0c8, intensity: 1.5, shadows: true, height: 1.6 },
  value: 4,
  tags: ['light'],
  price: 15,
  utility: { needs: 'power' },
} satisfies FurnitureDef;
