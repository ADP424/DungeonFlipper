import type { FurnitureDef } from '../types';

export default {
  id: 'desk_lamp',
  name: 'Desk Lamp',
  size: { w: 1, h: 1 },
  sprite: 'furniture/desk_lamp',
  depth: 7,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 1,
  light: { radius: 7.5, color: 0xffd28a, intensity: 1.4, flicker: 0.12, shadows: true, height: 1.2 },
  value: 3,
  tags: ['light'],
  price: 12,
  utility: { needs: 'power' },
  small: true,
} satisfies FurnitureDef;
