import type { ProjectileDef } from '../types';

/** Slow, and it curves after you; a melee swing knocks it out of the air. */
export default {
  id: 'pen',
  trajectory: 'straight',
  speed: 3.4,
  radius: 0.14,
  lifetime: 5,
  homing: 1.7,
  swattable: true,
  sprite: 'projectiles/pen',
  orient: true,
} satisfies ProjectileDef;
