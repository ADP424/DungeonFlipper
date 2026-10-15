import type { EnemyDef } from '../types';

/** Stock-still while you face it. Faster than you the moment you look away. */
export default {
  id: 'mannequin',
  name: 'Mannequin',
  sprite: 'enemies/mannequin/idle',
  views: 'sided',
  radius: 0.35,
  hp: 16,
  difficulty: 1,
  speed: 5.4,
  movementKind: 'walk',
  ai: { id: 'mannequin', params: { watchedCone: 45 } },
  contactDamage: 1,
  anims: { sprint: { frames: 'enemies/mannequin/sprint', loop: true, speed: 'fastest' } },
} satisfies EnemyDef;
