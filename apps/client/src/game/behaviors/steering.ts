import { angleDiff, shotTrajectory, type MovementKind, type ProjectileDef, type TrajectoryKind, type Vec2 } from '@df/shared';
import type { Enemy } from '../entities/Enemy';
import type { BrainCtx } from './brain';

/**
 * Ways of moving, for brains to put together. Each sets the enemy's velocity for this frame (or
 * answers a question); none of them remembers anything. All but `go` find their way round whatever its
 * way of moving can't cross (`Pathing`); `go` is for committing to a line (a charge, a lunge), where
 * running into a wall is the point.
 */

/** A `[min, max]` param: a time or a count that varies. */
export type Range = [number, number];
export const between = ([min, max]: Range) => min + Math.random() * (max - min);
export const pick = ([min, max]: Range) => min + Math.floor(Math.random() * (max - min + 1));
export const coin = (): 1 | -1 => (Math.random() < 0.5 ? 1 : -1);
export const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Fleeing takes a way with at least this much of "away" in it (-1…1): sideways out of a corner, never back past the player. */
const CORNERED = -0.25;

type Who = Pick<BrainCtx, 'game' | 'e'>;

/** Unit direction, distance and angle from the enemy to the player. */
export function toPlayer({ game, e }: Who): { dx: number; dy: number; d: number; angle: number } {
  const x = game.player.x - e.x, y = game.player.y - e.y;
  const d = Math.hypot(x, y) || 1;
  return { dx: x / d, dy: y / d, d, angle: Math.atan2(y, x) };
}

/** Head along an angle. */
export function go(e: Enemy, angle: number, speed: number): void {
  e.vx = Math.cos(angle) * speed;
  e.vy = Math.sin(angle) * speed;
}

/** Move along a unit direction (nothing: stand still). */
function along(e: Enemy, dir: Vec2, speed: number): void {
  e.vx = dir.x * speed;
  e.vy = dir.y * speed;
}

/** Make for the player by the cheapest way round (walkers round walls, furniture and holes; flyers over what's short). */
export function chase({ game, e }: Who, speed = e.def.speed): void {
  along(e, game.room.paths.dirTo(e, game.player.x, game.player.y), speed);
}

/** Make for a point by the cheapest way round, without overshooting it. True once there. */
export function moveTo({ game, e }: Who, x: number, y: number, speed: number, dt: number): boolean {
  const d = Math.hypot(x - e.x, y - e.y);
  if (d < 0.08) return true;
  along(e, game.room.paths.dirTo(e, x, y), Math.min(speed, d / dt));
  return false;
}

/**
 * The open way most directly away from the player. Getting away comes first: it doesn't weigh up
 * routes, it runs, sliding along walls and out of corners sideways. Nothing when it's cornered.
 */
export function fleeDir(who: Who): Vec2 {
  const { dx, dy } = toPlayer(who);
  return who.game.room.paths.steer(who.e, -dx, -dy, CORNERED);
}

/** Away from the player (see `fleeDir`). */
export function flee(who: Who, speed = who.e.def.speed): void {
  along(who.e, fleeDir(who), speed);
}

/**
 * Circle the player (`side`: which way round). With a `radius`, drifts in or out to hold that
 * distance while circling. Something in the way turns it whichever way round is open.
 */
export function circle(who: Who, side: 1 | -1, speed: number, radius?: number): void {
  const { dx, dy, d } = toPlayer(who);
  const inward = radius === undefined ? 0 : Math.max(-1, Math.min(1, d - radius));
  const x = -dy * side + dx * inward, y = dx * side + dy * inward;
  const l = Math.hypot(x, y) || 1;
  along(who.e, who.game.room.paths.steer(who.e, x / l, y / l), speed);
}

/** Turn an angle toward another by at most `step` radians. */
export function turnToward(from: number, to: number, step: number): number {
  const d = angleDiff(to, from);
  return from + Math.max(-step, Math.min(step, d));
}

/** Nothing in the way between the enemy and the player, for sight or a shot (a trajectory) or a run (`walk`, `fly`). */
export function clearToPlayer({ game, e }: Who, mode: TrajectoryKind | MovementKind = 'straight'): boolean {
  return game.room.lineClear(e.x, e.y, game.player.x, game.player.y, mode);
}

/** A projectile the enemy fires would reach the player: over what it flies over (`shotTrajectory`), short of anything that stops it. */
export function clearShot(who: Who, def: ProjectileDef): boolean {
  return clearToPlayer(who, shotTrajectory(def, who.e.movementKind));
}

/**
 * Whether the player is looking at the enemy: it's in plain sight, within `cone` radians either side of
 * where their head is turned (`Player.lookAngle`, the direction their art shows).
 */
export function watched(who: Who, cone: number): boolean {
  const { angle } = toPlayer(who);
  return Math.abs(angleDiff(angle + Math.PI, who.game.player.lookAngle)) <= cone && clearToPlayer(who);
}
