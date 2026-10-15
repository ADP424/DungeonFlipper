import { shotTrajectory, type ProjectileDef } from '@df/shared';
import type { Enemy } from '../entities/Enemy';
import type { BrainCtx } from './brain';

/** Things an enemy does to the room, for brains to put together. */

type Who = Pick<BrainCtx, 'game' | 'e'>;

export interface Shot {
  damage: number;
  speedMul?: number;
}

/**
 * One projectile along an angle. Lobbed ones land where the player is standing now; straight ones
 * fired from the air fly over anything short (`shotTrajectory`).
 */
export function shoot({ game, e }: Who, def: ProjectileDef, angle: number, shot: Shot): void {
  game.spawnProjectile({
    def, trajectory: shotTrajectory(def, e.movementKind), team: 'enemy', x: e.x, y: e.y, dx: Math.cos(angle), dy: Math.sin(angle),
    damage: shot.damage, knockback: 0, speedMul: shot.speedMul, targetX: game.player.x, targetY: game.player.y,
  });
}

/** `count` projectiles spread evenly around an angle, `spread` radians apart. */
export function fan(who: Who, def: ProjectileDef, angle: number, count: number, spread: number, shot: Shot): void {
  for (let i = 0; i < count; i++) shoot(who, def, angle + (i - (count - 1) / 2) * spread, shot);
}

/** `count` projectiles in every direction, starting from a random angle. */
export function ring(who: Who, def: ProjectileDef, count: number, shot: Shot): void {
  const offset = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) shoot(who, def, offset + (i / count) * Math.PI * 2, shot);
}

/**
 * Bring in another enemy near a spot (transient: it isn't part of the room's roster). It belongs to
 * whoever called it: the same room, the same realtor.
 */
export function summon({ game, e }: Who, defId: string, x: number, y: number): Enemy | null {
  const s = game.spawnEnemy(defId, x, y);
  if (!s) return null;
  s.roomId = e.roomId;
  s.realtorId = e.realtorId;
  s.summonedBy = e.id;
  return s;
}

/** How many of an enemy's summons are alive. */
export function summonsOf({ game, e }: Who): number {
  return game.room.enemies.filter((x) => !x.dead && x.summonedBy === e.id).length;
}
