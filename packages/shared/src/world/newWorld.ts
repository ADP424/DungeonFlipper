import { CELL_H, CELL_W, HOTBAR_STORAGE_SLOTS } from '../core/constants';
import { uid } from '../core/ids';
import type { Command } from './commands';
import { generateFloor } from './generator';
import { createItem } from './items';
import { DAY_START_MINUTE } from './clock';
import { APARTMENT_FLOOR } from './difficulty';
import type { PhoneMessage } from './inbox';
import type { FloorState, PlayerState } from './types';

export const STARTING_RED_HALVES = 6;

/** Where a player appears when arriving on / respawning on a floor: the entry room's centre. */
export function entryPoint(floor: FloorState): { roomId: string; x: number; y: number } {
  const room = floor.rooms[floor.lobbyRoomId]!;
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
    cash: 0,
    redHalves: STARTING_RED_HALVES,
    baseRedMaxHalves: STARTING_RED_HALVES,
    hotbar: {
      main: createItem('crowbar'),
      off: null,
      armor: null,
      slots: Array.from({ length: HOTBAR_STORAGE_SLOTS }, () => null),
    },
    passives: [],
    carrying: null,
    deaths: 0,
  };
}

/** The opening text thread: sets up the premise on the phone, which opens on a new game. */
export const INTRO_MESSAGES: Omit<PhoneMessage, 'day' | 'minute'>[] = [
  { id: 'intro-1', severity: 'info', from: 'Landlord', text: "Reminder: rent's going up next month. Also your closet is humming again. Not my problem." },
  { id: 'intro-2', severity: 'info', from: 'Unknown number', text: "You've seen it, haven't you. The crack behind the coats." },
  { id: 'intro-3', severity: 'info', from: 'Unknown number', text: 'It goes on forever. Empty rooms, yellow wallpaper, nobody home. Nobody owns any of it. Yet.' },
  { id: 'intro-4', severity: 'info', from: 'Unknown number', text: "Clear a room and it's yours. Fix it up, rent it out, get rich. Try not to die in there. Walk into the crack to step through." },
];

/** The commands that create a brand-new world for a player: the apartment, Level 1, the player and the intro. */
export function newWorldCommands(ownerId: string, seed = Math.floor(Math.random() * 2 ** 31)): Command[] {
  const at = Date.now();
  const worldId = uid();
  const home = generateFloor(seed, APARTMENT_FLOOR);
  const level1 = generateFloor(seed, 1);
  return [
    { type: 'worldCreated', worldId, ownerId, seed, createdAt: at, at, actorId: ownerId },
    { type: 'floorGenerated', floor: home.floor, rooms: home.rooms, at, actorId: ownerId },
    { type: 'floorGenerated', floor: level1.floor, rooms: level1.rooms, at, actorId: ownerId },
    { type: 'playerCreated', player: createPlayer(ownerId, home.floor), at, actorId: ownerId },
    { type: 'clockSet', clock: { day: 1, minute: DAY_START_MINUTE }, at, actorId: ownerId },
    ...INTRO_MESSAGES.map((m): Command => ({
      type: 'messagePosted', playerId: ownerId, message: { ...m, day: 1, minute: DAY_START_MINUTE }, at, actorId: ownerId,
    })),
  ];
}
