import type { ProjectileDef } from '../types';

export default {
  id: 'memo',
  trajectory: 'straight',
  speed: 3.5,
  radius: 0.22,
  lifetime: 4,
  sprite: 'proc:magic_orb',
  light: { radius: 1.8, color: 0xc070ff, intensity: 0.8 },
} satisfies ProjectileDef;
