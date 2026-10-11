import type { Game } from '../Game';
import type { Enemy } from '../entities/Enemy';

export interface BrainCtx<P = unknown> {
  game: Game;
  e: Enemy;
  dt: number;
  /** The def's `ai.params`: every number that tunes this enemy. */
  params: P;
}

/**
 * An enemy's whole behaviour: how it moves, when it attacks, what it does in between. Every enemy
 * has its own (`enemies/<def id>.ts`), so no two play alike; what they share is the vocabulary they're
 * written in (`steering.ts`, `actions.ts`, `Phased`), never a whole pattern.
 *
 * Each frame, before `update`, the enemy stands still, faces the player, hurts on touch, has no
 * shield up and shows its idle art. A brain changes whichever of those it means to, every frame it
 * means to (`e.vx`, `e.facing`, `e.contact`, `e.blockArc`, `e.pose()`), so there's nothing to undo
 * when it changes its mind.
 */
export interface Brain<P = unknown, S = unknown> {
  /**
   * Fresh state for one enemy. Look ids up here (projectiles, enemies to summon): it also runs once
   * per def at startup, so a wrong id in a def's params fails then, not mid-fight.
   */
  init(params: P): S;
  update(ctx: BrainCtx<P>, state: S): void;
}

export const defineBrain = <P, S>(brain: Brain<P, S>): Brain<P, S> => brain;

/** State of a brain that works in phases: which one, and for how long (seconds) so far. */
export interface Phased<K extends string> {
  phase: K;
  t: number;
}

export function enter<K extends string>(s: Phased<K>, phase: K): void {
  s.phase = phase;
  s.t = 0;
}
