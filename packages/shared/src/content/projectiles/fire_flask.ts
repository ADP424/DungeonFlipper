import type { ProjectileDef } from '../types';

export default {
  id: 'fire_flask',
  trajectory: 'lobbed',
  speed: 7,
  radius: 0.18,
  lifetime: 2,
  lobHeight: 1.6,
  splash: 1.25,
  sprite: 'proc:flask',
  light: { radius: 1.5, color: 0xff9040, intensity: 0.5 },
} satisfies ProjectileDef;
