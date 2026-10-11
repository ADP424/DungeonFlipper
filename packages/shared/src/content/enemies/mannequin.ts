import type { EnemyDef } from '../types';

/** Stock-still while you face it. Faster than you the moment you look away. */
export default {
  id: 'mannequin',
  name: 'Mannequin',
  sprite: 'enemies/mannequin/idle',
  tint: 0xe8e2d0,
  radius: 0.35,
  hp: 16,
  difficulty: 1,
  speed: 5.4,
  movementKind: 'walk',
  ai: { id: 'mannequin', params: { watchedCone: 70, thaw: 0.2 } },
  contactDamage: 1,
} satisfies EnemyDef;
