import type { Game } from '../Game';
import type { Enemy } from '../entities/Enemy';
import { movement } from './movement';
import { attacks } from './attacks';
import { facilityManager } from './bosses/facilityManager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BehaviorState = Record<string, any>;

export interface BehaviorCtx<P = Record<string, unknown>> {
  game: Game;
  e: Enemy;
  dt: number;
  params: P;
  /** Per-enemy, per-behaviour scratch state. */
  state: BehaviorState;
}

/** Sets the enemy's desired velocity (vx, vy) and may drive z/airborne/alpha. */
export type MovementBehavior = (ctx: BehaviorCtx<any>) => void;
/** Runs alongside movement; any number per enemy. */
export type AttackBehavior = (ctx: BehaviorCtx<any>) => void;

/** Registries referenced by id from EnemyDef.movement / EnemyDef.attacks. Add new mechanics here. */
export const movementBehaviors: Record<string, MovementBehavior> = { ...movement, facilityManager };
export const attackBehaviors: Record<string, AttackBehavior> = { ...attacks };
