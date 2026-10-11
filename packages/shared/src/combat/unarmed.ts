import type { MeleeAttackDef } from '../content/types';

/**
 * What an empty hand does: a jab with the reach of a box cutter and a fraction of its damage, so
 * nobody is ever defenceless. It's the player's own attack, not an item: it can't be dropped or lost.
 */
export const UNARMED_ATTACK: MeleeAttackDef = {
  type: 'melee',
  pattern: 'stab',
  range: 0.75,
  damage: 1.5,
  cooldown: 0.3,
  windup: 0.03,
  duration: 0.1,
  knockback: 2,
  width: 0.4,
};
