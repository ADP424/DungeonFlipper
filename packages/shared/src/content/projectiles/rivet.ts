import type { ProjectileDef } from '../types';

export default {
  id: 'rivet',
  trajectory: 'straight',
  speed: 20,
  radius: 0.12,
  lifetime: 1.2,
  pierce: 1,
  sprite: 'proc:bolt',
  orient: true,
} satisfies ProjectileDef;
