import { angleDiff, type MovementKind, type TrajectoryKind } from '@df/shared';
import type { Enemy } from '../entities/Enemy';
import type { BrainCtx } from './brain';

/**
 * Ways of moving, for brains to put together. Each sets the enemy's velocity for this frame (or
 * answers a question); none of them remembers anything.
 */

/** A `[min, max]` param: a time or a count that varies. */
export type Range = [number, number];
export const between = ([min, max]: Range) => min + Math.random() * (max - min);
export const pick = ([min, max]: Range) => min + Math.floor(Math.random() * (max - min + 1));
export const coin = (): 1 | -1 => (Math.random() < 0.5 ? 1 : -1);
export const rad = (degrees: number) => (degrees * Math.PI) / 180;

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

/** Walk toward the player along the room's flow field (around walls, holes and broken glass). */
export function chase({ game, e }: Who, speed = e.def.speed): void {
  const dir = game.room.pathDir(e);
  e.vx = dir.x * speed;
  e.vy = dir.y * speed;
}

/** Straight away from the player. */
export function flee(who: Who, speed = who.e.def.speed): void {
  const { dx, dy } = toPlayer(who);
  who.e.vx = -dx * speed;
  who.e.vy = -dy * speed;
}

/**
 * Circle the player (`side`: which way round). With a `radius`, drifts in or out to hold that
 * distance while circling.
 */
export function circle(who: Who, side: 1 | -1, speed: number, radius?: number): void {
  const { dx, dy, d } = toPlayer(who);
  const inward = radius === undefined ? 0 : Math.max(-1, Math.min(1, d - radius));
  const x = -dy * side + dx * inward, y = dx * side + dy * inward;
  const l = Math.hypot(x, y) || 1;
  who.e.vx = (x / l) * speed;
  who.e.vy = (y / l) * speed;
}

/** Head straight for a point, without overshooting it. True once there. */
export function moveTo(e: Enemy, x: number, y: number, speed: number, dt: number): boolean {
  const dx = x - e.x, dy = y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.08) return true;
  const v = Math.min(speed, d / dt);
  e.vx = (dx / d) * v;
  e.vy = (dy / d) * v;
  return false;
}

/** Turn an angle toward another by at most `step` radians. */
export function turnToward(from: number, to: number, step: number): number {
  const d = angleDiff(to, from);
  return from + Math.max(-step, Math.min(step, d));
}

/** Nothing in the way between the enemy and the player, for a shot (`straight`, `lobbed`) or a run (`walk`, `fly`). */
export function clearToPlayer({ game, e }: Who, mode: TrajectoryKind | MovementKind = 'straight'): boolean {
  return game.room.lineClear(e.x, e.y, game.player.x, game.player.y, mode);
}

/** Whether the player is looking at the enemy: it's within `cone` radians either side of where they aim, in plain sight. */
export function watched(who: Who, cone: number): boolean {
  const { angle } = toPlayer(who);
  return Math.abs(angleDiff(angle + Math.PI, who.game.player.aim)) <= cone && clearToPlayer(who);
}
