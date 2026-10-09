import type { DoorInfo, WorldState } from './types';

export const doorKey = (d: { x: number; y: number }): string => `${d.x},${d.y}`;

/** A room's door by its tile key. */
export function doorAt(state: WorldState, roomId: string, key: string): DoorInfo | undefined {
  const room = state.rooms[roomId];
  return room ? state.floors[room.floor]?.rooms[roomId]?.doors.find((d) => doorKey(d) === key) : undefined;
}

/**
 * The other half of a doorway: the neighbouring room's door tile next to this one. Barricades belong
 * to the doorway, so they're mirrored onto both tiles (one shared HP).
 */
export function partnerDoor(state: WorldState, roomId: string, key: string): { roomId: string; key: string } | undefined {
  const d = doorAt(state, roomId, key);
  if (!d) return undefined;
  const other = state.rooms[d.toRoom];
  const info = other && state.floors[other.floor]?.rooms[d.toRoom];
  const p = info?.doors.find((o) => o.toRoom === roomId && Math.abs(o.x - d.x) + Math.abs(o.y - d.y) === 1);
  return p ? { roomId: d.toRoom, key: doorKey(p) } : undefined;
}
