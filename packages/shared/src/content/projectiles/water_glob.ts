import type { ProjectileDef } from '../types';

export default {
  id: 'water_glob',
  trajectory: 'lobbed',
  speed: 5,
  radius: 0.2,
  lifetime: 3,
  lobHeight: 2,
  splash: 0.7,
  leaves: { sprite: 'fx/puddle', radius: 0.9, duration: 6, slow: 0.55 },
  sprite: 'projectiles/water_glob',
} satisfies ProjectileDef;
