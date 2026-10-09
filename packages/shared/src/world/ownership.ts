import type { RoomState } from './types';

/**
 * Placeholder owner written by the generator for rooms that start owned (the floor is generated
 * before any player exists). `floorGenerated` resolves it to the world's owner.
 */
export const WORLD_OWNER = '@world';

export function isOwned(room: RoomState | undefined): boolean {
  return !!room?.ownerId;
}

export function isOwnedBy(room: RoomState | undefined, actorId: string): boolean {
  return !!room && room.ownerId === actorId;
}
