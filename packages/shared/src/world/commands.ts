import { DEATH_KEEPS_PASSIVES } from '../core/constants';
import { tileKey } from '../core/geometry';
import type {
  DocKey, FloorState, FurniturePlacement, GroundItem, PlayerState, RoomState, WorldState,
} from './types';
import { SCHEMA_VERSION } from '../save/schema';

/**
 * Every persistent change to the world is a Command. Commands are applied by one pure reducer that
 * runs identically on the client (immediately) and on the server (when synced). This keeps the
 * client and server consistent, gives a natural validation point, and is the basis for multiplayer.
 */
interface Base {
  /** Player that caused the change (multiplayer-ready). */
  actorId?: string;
  /** Client timestamp (ms). */
  at?: number;
}

export type Command = Base & (
  | { type: 'worldCreated'; worldId: string; ownerId: string; seed: number; createdAt: number }
  | { type: 'floorGenerated'; floor: FloorState; rooms: RoomState[] }
  | { type: 'playerCreated'; player: PlayerState }
  | { type: 'playerMoved'; playerId: string; floor: number; roomId: string; x: number; y: number }
  | { type: 'playerUpdated'; playerId: string; patch: PlayerPatch }
  | { type: 'playerDied'; playerId: string; respawn: { floor: number; roomId: string; x: number; y: number }; redHalves: number }
  | { type: 'enemyKilled'; roomId: string; spawnId: string }
  | { type: 'roomOwned'; roomId: string }
  | { type: 'groundItemAdded'; roomId: string; item: GroundItem }
  | { type: 'groundItemRemoved'; roomId: string; uid: string }
  | { type: 'furniturePlaced'; roomId: string; placement: FurniturePlacement }
  | { type: 'furnitureRemoved'; roomId: string; uid: string }
  | { type: 'furnitureUpdated'; roomId: string; placement: FurniturePlacement }
  | { type: 'tileSet'; roomId: string; x: number; y: number; obstacle: string | null }
  | { type: 'surfaceSet'; roomId: string; x: number; y: number; layer: 'floor' | 'wall'; surface: string | null }
  | { type: 'globalSet'; key: string; value: unknown }
);

export type CommandType = Command['type'];
export type PlayerPatch = Partial<Pick<PlayerState, 'gold' | 'redHalves' | 'baseRedMaxHalves' | 'hotbar' | 'passives' | 'carrying'>>;

export function emptyWorld(): WorldState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worldId: '',
    ownerId: '',
    seed: 0,
    createdAt: 0,
    revision: 0,
    floors: {},
    rooms: {},
    players: {},
    globals: {},
  };
}

export class CommandError extends Error {}

function room(state: WorldState, id: string): RoomState {
  const r = state.rooms[id];
  if (!r) throw new CommandError(`Unknown room ${id}`);
  return r;
}

function player(state: WorldState, id: string): PlayerState {
  const p = state.players[id];
  if (!p) throw new CommandError(`Unknown player ${id}`);
  return p;
}

/**
 * Apply a command to the world state (mutating it) and return the keys of documents it touched.
 * Must stay deterministic: no randomness or clocks — those belong in the command payload.
 */
export function applyCommand(state: WorldState, cmd: Command): DocKey[] {
  switch (cmd.type) {
    case 'worldCreated':
      state.worldId = cmd.worldId;
      state.ownerId = cmd.ownerId;
      state.seed = cmd.seed;
      state.createdAt = cmd.createdAt;
      state.schemaVersion = SCHEMA_VERSION;
      return ['world'];

    case 'floorGenerated': {
      state.floors[cmd.floor.index] = structuredClone(cmd.floor);
      const keys: DocKey[] = [`floor:${cmd.floor.index}`];
      for (const r of cmd.rooms) {
        state.rooms[r.id] = structuredClone(r);
        keys.push(`room:${r.id}`);
      }
      return keys;
    }

    case 'playerCreated':
      state.players[cmd.player.id] = structuredClone(cmd.player);
      return [`player:${cmd.player.id}`];

    case 'playerMoved': {
      const p = player(state, cmd.playerId);
      p.floor = cmd.floor;
      p.roomId = cmd.roomId;
      p.x = cmd.x;
      p.y = cmd.y;
      const keys: DocKey[] = [`player:${p.id}`];
      const r = room(state, cmd.roomId);
      if (!r.visited || !r.discovered) {
        r.visited = r.discovered = true;
        keys.push(`room:${r.id}`);
      }
      // Rooms behind this room's doors become discovered (shown on the map).
      const info = state.floors[cmd.floor]?.rooms[cmd.roomId];
      for (const d of info?.doors ?? []) {
        const n = state.rooms[d.toRoom];
        if (n && !n.discovered) {
          n.discovered = true;
          keys.push(`room:${n.id}`);
        }
      }
      return keys;
    }

    case 'playerUpdated': {
      const p = player(state, cmd.playerId);
      Object.assign(p, structuredClone(cmd.patch));
      return [`player:${p.id}`];
    }

    case 'playerDied': {
      const p = player(state, cmd.playerId);
      p.hotbar = { main: null, off: null, armor: null, slots: p.hotbar.slots.map(() => null) };
      if (!DEATH_KEEPS_PASSIVES) p.passives = [];
      p.carrying = null;
      p.floor = cmd.respawn.floor;
      p.roomId = cmd.respawn.roomId;
      p.x = cmd.respawn.x;
      p.y = cmd.respawn.y;
      p.redHalves = cmd.redHalves;
      p.deaths++;
      return [`player:${p.id}`];
    }

    case 'enemyKilled': {
      const r = room(state, cmd.roomId);
      if (!r.deadSpawnIds.includes(cmd.spawnId)) r.deadSpawnIds.push(cmd.spawnId);
      return [`room:${r.id}`];
    }

    case 'roomOwned': {
      const r = room(state, cmd.roomId);
      r.owned = true;
      return [`room:${r.id}`];
    }

    case 'groundItemAdded': {
      const r = room(state, cmd.roomId);
      r.groundItems = r.groundItems.filter((g) => g.uid !== cmd.item.uid);
      r.groundItems.push(structuredClone(cmd.item));
      return [`room:${r.id}`];
    }

    case 'groundItemRemoved': {
      const r = room(state, cmd.roomId);
      r.groundItems = r.groundItems.filter((g) => g.uid !== cmd.uid);
      return [`room:${r.id}`];
    }

    case 'furniturePlaced':
    case 'furnitureUpdated': {
      const r = room(state, cmd.roomId);
      r.furniture = r.furniture.filter((f) => f.uid !== cmd.placement.uid);
      r.furniture.push(structuredClone(cmd.placement));
      return [`room:${r.id}`];
    }

    case 'furnitureRemoved': {
      const r = room(state, cmd.roomId);
      r.furniture = r.furniture.filter((f) => f.uid !== cmd.uid);
      return [`room:${r.id}`];
    }

    case 'tileSet': {
      const r = room(state, cmd.roomId);
      const k = tileKey(cmd.x, cmd.y);
      r.tileOverrides[k] = cmd.obstacle;
      // Wallpaper doesn't survive its wall being removed.
      if (!cmd.obstacle) delete r.wallSurfaces[k];
      return [`room:${r.id}`];
    }

    case 'surfaceSet': {
      const r = room(state, cmd.roomId);
      const map = cmd.layer === 'floor' ? r.floorSurfaces : r.wallSurfaces;
      const k = tileKey(cmd.x, cmd.y);
      if (cmd.surface) map[k] = cmd.surface;
      else delete map[k];
      return [`room:${r.id}`];
    }

    case 'globalSet':
      state.globals[cmd.key] = structuredClone(cmd.value);
      return [`global:${cmd.key}`];
  }
}

/** Apply a batch, returning the union of touched document keys. */
export function applyCommands(state: WorldState, cmds: Command[]): Set<DocKey> {
  const touched = new Set<DocKey>();
  for (const c of cmds) for (const k of applyCommand(state, c)) touched.add(k);
  return touched;
}
