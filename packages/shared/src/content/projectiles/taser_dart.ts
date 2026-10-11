import type { ProjectileDef } from '../types';

export default {
  id: 'taser_dart',
  trajectory: 'straight',
  speed: 11,
  radius: 0.12,
  lifetime: 1.2,
  sprite: 'projectiles/taser_dart',
  orient: true,
  light: { radius: 1.2, color: 0x80c0ff, intensity: 0.6 },
} satisfies ProjectileDef;
