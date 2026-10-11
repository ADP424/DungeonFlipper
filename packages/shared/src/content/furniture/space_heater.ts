import type { FurnitureDef } from '../types';

export default {
  id: 'space_heater',
  name: 'Space Heater',
  size: { w: 1, h: 1 },
  sprite: 'furniture/space_heater',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.9,
  light: { radius: 8, color: 0xffa040, intensity: 1.5, flicker: 0.25, shadows: true, height: 1.1 },
  value: 2,
  tags: ['light'],
  utility: { needs: 'power' },
} satisfies FurnitureDef;
