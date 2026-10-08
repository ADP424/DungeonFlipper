import { CELL_H, CELL_W, HOTBAR_STORAGE_SLOTS } from '../core/constants';
import { uid } from '../core/ids';
import type { Command } from './commands';
import { generateFloor } from './generator';
import { createItem } from './items';
import type { FloorState, PlayerState } from './types';

export const STARTING_RED_HALVES = 6;

/** Where a player appears when arriving on / respawning on a floor: the entry room's centre. */
export function entryPoint(floor: FloorState): { roomId: string; x: number; y: number } {
  const room = floor.rooms[floor.entryRoomId]!;
  const c = room.cells[0]!;
  return { roomId: room.id, x: c.cx * CELL_W + CELL_W / 2, y: c.cy * CELL_H + CELL_H / 2 + 1 };
}

export function createPlayer(id: string, floor: FloorState): PlayerState {
  const e = entryPoint(floor);
  return {
    id,
    floor: floor.index,
    roomId: e.roomId,
    x: e.x,
    y: e.y,
    gold: 0,
    redHalves: STARTING_RED_HALVES,
    baseRedMaxHalves: STARTING_RED_HALVES,
    hotbar: {
      main: createItem('short_sword'),
      off: null,
      armor: null,
      slots: Array.from({ length: HOTBAR_STORAGE_SLOTS }, () => null),
    },
    passives: [],
    carrying: null,
    deaths: 0,
  };
}

/** The commands that create a brand-new world for a player. */
export function newWorldCommands(ownerId: string, seed = Math.floor(Math.random() * 2 ** 31)): Command[] {
  const at = Date.now();
  const worldId = uid();
  const { floor, rooms } = generateFloor(seed, 1);
  return [
    { type: 'worldCreated', worldId, ownerId, seed, createdAt: at, at, actorId: ownerId },
    { type: 'floorGenerated', floor, rooms, at, actorId: ownerId },
    { type: 'playerCreated', player: createPlayer(ownerId, floor), at, actorId: ownerId },
  ];
}
