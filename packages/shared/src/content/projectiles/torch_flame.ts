import type { ProjectileDef } from '../types';

export default {
  id: 'torch_flame',
  trajectory: 'straight',
  speed: 5,
  radius: 0.25,
  lifetime: 2.5,
  splash: 0.9,
  sprite: 'proc:fireball',
  light: { radius: 2.5, color: 0xff8030, intensity: 0.9, flicker: 0.3 },
} satisfies ProjectileDef;
