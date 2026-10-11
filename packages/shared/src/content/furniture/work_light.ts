import type { FurnitureDef } from '../types';

export default {
  id: 'work_light',
  name: 'Work Light',
  size: { w: 1, h: 1 },
  sprite: 'furniture/work_light',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 1.2,
  // Solid only at its stand: you can walk behind the pole.
  collision: [{ x: 5, y: 12, w: 5, h: 4 }],
  light: { radius: 9, color: 0xffa040, intensity: 1.6, flicker: 0.3, shadows: true, height: 1.4 },
  value: 2,
  tags: ['light'],
  utility: { needs: 'power' },
} satisfies FurnitureDef;
