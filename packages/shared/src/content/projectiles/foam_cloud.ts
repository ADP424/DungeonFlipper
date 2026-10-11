import type { ProjectileDef } from '../types';

export default {
  id: 'foam_cloud',
  trajectory: 'straight',
  speed: 4.5,
  radius: 0.22,
  lifetime: 2.5,
  pierce: 3,
  sprite: 'projectiles/foam_cloud',
  light: { radius: 2, color: 0x80d0ff, intensity: 0.8 },
} satisfies ProjectileDef;
