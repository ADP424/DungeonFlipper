import type { FurnitureDef } from '../types';

export default {
  id: 'floor_lamp',
  name: 'Floor Lamp',
  size: { w: 1, h: 1 },
  sprite: 'ri:154',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 1.4,
  light: { radius: 9, color: 0xfff0c8, intensity: 1.5, shadows: true, height: 1.6 },
} satisfies FurnitureDef;
