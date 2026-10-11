import type { ProjectileDef } from '../types';

export default {
  id: 'clipboard',
  trajectory: 'straight',
  speed: 6,
  radius: 0.18,
  lifetime: 3,
  sprite: 'projectiles/clipboard',
  orient: true,
} satisfies ProjectileDef;
