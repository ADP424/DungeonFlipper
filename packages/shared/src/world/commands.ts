import { REALTORS_KEY, type Realtor } from './realtors';
import { reputationKey, type Reputation } from './reputation';
import { STAFF_KEY, type Staff } from './staff';
/** The worst a tile's mess gets. */
export const MAX_MESS = 3;
import type { UtilityKind } from './utilities';
import { tileKey } from '../core/geometry';
import type {
  Barricade, DocKey, FloorState, FurniturePlacement, GroundItem, MonsterRecord, PlayerState, RoomInfo, RoomState, WorldState,
} from './types';
import { SCHEMA_VERSION } from '../save/schema';
import { CLOCK_KEY, getClock, type Clock } from './clock';
import { getInbox, inboxKey, type PhoneMessage } from './inbox';
import { WORLD_OWNER } from './ownership';
import { regionKeyOf, regionKeys } from './regions';
import { partnerDoor } from './doors';
import type { Tenant } from './tenants';

const TENANTS_KEY = 'tenants';

const ordersKey = (playerId: string): string => `orders:${playerId}`;

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
  /** A room was expanded: new and changed RoomInfos (new doors) plus the new rooms' initial states. */
  | { type: 'roomsGenerated'; floor: number; infos: RoomInfo[]; states: RoomState[] }
  /** Stairs down were taken from this room: stairs up from the floor below lead back here. */
  | { type: 'stairsDescended'; floor: number; roomId: string }
  | { type: 'playerCreated'; player: PlayerState }
  | { type: 'playerMoved'; playerId: string; floor: number; roomId: string; x: number; y: number }
  | { type: 'playerUpdated'; playerId: string; patch: PlayerPatch }
  | { type: 'playerDied'; playerId: string; respawn: { floor: number; roomId: string; x: number; y: number }; redHalves: number }
  | { type: 'monsterKilled'; roomId: string; monsterId: string }
  /** Persist monsters' health when leaving a room (records not listed are dropped). */
  | { type: 'rosterSynced'; roomId: string; monsters: MonsterRecord[] }
  | { type: 'roomOwned'; roomId: string; ownerId: string }
  | { type: 'roomOwnerCleared'; roomId: string }
  /** Install, repair, upgrade or remove (null) a doorway's barricade (given by either side's door tile; both sides change). */
  | { type: 'barricadeSet'; roomId: string; door: string; barricade: Barricade | null }
  /** Wear: new HP per door tile of this room (mirrored to the other side of each doorway). */
  | { type: 'barricadesDamaged'; roomId: string; hp: Record<string, number> }
  /** A monster walked from one room of an area into another (it no longer has a spawn tile). */
  | { type: 'monsterMoved'; from: string; to: string; monsterId: string }
  /** A monster spilled in through a door. */
  | { type: 'monsterAdded'; roomId: string; record: MonsterRecord }
  /** Start (day) or clear (null) an owned room's securing deadline. */
  | { type: 'roomInsecure'; roomId: string; since: number | null }
  /** Buy from the Hardware app: cash now, delivery when the day ends. */
  | { type: 'orderPlaced'; playerId: string; items: string[]; cost: number }
  /** Orders arrived; `remaining` (furniture that didn't fit) stays on order for the next day. */
  | { type: 'ordersDelivered'; playerId: string; remaining?: string[] }
  /** Add or update a tenant / applicant record. */
  | { type: 'tenantSet'; tenant: Tenant }
  | { type: 'tenantRemoved'; id: string }
  | { type: 'timePassed'; minutes: number }
  | { type: 'clockSet'; clock: Clock }
  /** The player slept: the clock jumps to the wake time and health is set. */
  | { type: 'slept'; playerId: string; clock: Clock; redHalves: number }
  | { type: 'messagePosted'; playerId: string; message: PhoneMessage }
  | { type: 'messagesRead'; playerId: string }
  | { type: 'groundItemAdded'; roomId: string; item: GroundItem }
  | { type: 'groundItemRemoved'; roomId: string; uid: string }
  | { type: 'furniturePlaced'; roomId: string; placement: FurniturePlacement }
  | { type: 'furnitureRemoved'; roomId: string; uid: string }
  | { type: 'furnitureUpdated'; roomId: string; placement: FurniturePlacement }
  | { type: 'tileSet'; roomId: string; x: number; y: number; obstacle: string | null }
  /** Lay / take up a pipe or wire segment on a tile (P6). */
  | { type: 'utilityLaid'; roomId: string; x: number; y: number; kind: UtilityKind }
  /** Mess on a tile gets worse (up to 3) / is cleaned up (P7). */
  | { type: 'messAdded'; roomId: string; x: number; y: number }
  | { type: 'messCleared'; roomId: string; x: number; y: number }
  /** Reputation goes up or down (D20). */
  | { type: 'reputationAdded'; playerId: string; delta: number }
  /** Hire / update, and let go of, a member of staff (P7). */
  | { type: 'staffSet'; staff: Staff }
  | { type: 'staffRemoved'; id: string }
  /** Add / update, and remove, a rival realtor (P8). */
  | { type: 'realtorSet'; realtor: Realtor }
  | { type: 'realtorRemoved'; id: string }
  | { type: 'utilityRemoved'; roomId: string; x: number; y: number; kind: UtilityKind }
  /** A segment fails (`fault: true`) or is repaired. */
  | { type: 'utilityFault'; roomId: string; x: number; y: number; kind: UtilityKind; fault: boolean }
  | { type: 'surfaceSet'; roomId: string; x: number; y: number; layer: 'floor' | 'wall'; surface: string | null }
  | { type: 'globalSet'; key: string; value: unknown }
);

export type CommandType = Command['type'];
export type PlayerPatch = Partial<Pick<PlayerState, 'cash' | 'redHalves' | 'baseRedMaxHalves' | 'hotbar' | 'carrying'>>;

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
      const keys: DocKey[] = [`floor:${cmd.floor.index}`, ...regionKeys(cmd.floor)];
      for (const r of cmd.rooms) {
        state.rooms[r.id] = structuredClone(r);
        if (r.ownerId === WORLD_OWNER) state.rooms[r.id]!.ownerId = state.ownerId;
        keys.push(`room:${r.id}`);
      }
      return keys;
    }

    case 'roomsGenerated': {
      const floor = state.floors[cmd.floor];
      if (!floor) throw new CommandError(`Unknown floor ${cmd.floor}`);
      const keys = new Set<DocKey>();
      for (const info of cmd.infos) {
        floor.rooms[info.id] = structuredClone(info);
        for (const c of info.cells) floor.cells[`${c.cx},${c.cy}`] = info.id;
        keys.add(regionKeyOf(cmd.floor, info));
      }
      for (const r of cmd.states) {
        state.rooms[r.id] = structuredClone(r);
        if (r.ownerId === WORLD_OWNER) state.rooms[r.id]!.ownerId = state.ownerId;
        keys.add(`room:${r.id}`);
      }
      return [...keys];
    }

    case 'stairsDescended': {
      const floor = state.floors[cmd.floor];
      if (!floor) throw new CommandError(`Unknown floor ${cmd.floor}`);
      floor.lastStairsDown = cmd.roomId;
      return [`floor:${cmd.floor}`];
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
      p.carrying = null;
      p.floor = cmd.respawn.floor;
      p.roomId = cmd.respawn.roomId;
      p.x = cmd.respawn.x;
      p.y = cmd.respawn.y;
      p.redHalves = cmd.redHalves;
      p.deaths++;
      return [`player:${p.id}`];
    }

    case 'monsterKilled': {
      const r = room(state, cmd.roomId);
      r.monsters = r.monsters.filter((m) => m.id !== cmd.monsterId);
      return [`room:${r.id}`];
    }

    case 'rosterSynced': {
      const r = room(state, cmd.roomId);
      r.monsters = structuredClone(cmd.monsters);
      return [`room:${r.id}`];
    }

    case 'roomOwned': {
      const r = room(state, cmd.roomId);
      r.ownerId = cmd.ownerId;
      return [`room:${r.id}`];
    }

    case 'roomOwnerCleared': {
      const r = room(state, cmd.roomId);
      r.ownerId = null;
      delete r.insecureSince;
      return [`room:${r.id}`];
    }

    case 'barricadeSet': {
      const keys: DocKey[] = [];
      for (const side of [{ roomId: cmd.roomId, key: cmd.door }, partnerDoor(state, cmd.roomId, cmd.door)]) {
        if (!side) continue;
        const r = room(state, side.roomId);
        if (cmd.barricade) r.barricades[side.key] = { ...cmd.barricade };
        else delete r.barricades[side.key];
        keys.push(`room:${r.id}`);
      }
      return keys;
    }

    case 'barricadesDamaged': {
      const keys = new Set<DocKey>();
      for (const [door, hp] of Object.entries(cmd.hp)) {
        for (const side of [{ roomId: cmd.roomId, key: door }, partnerDoor(state, cmd.roomId, door)]) {
          if (!side) continue;
          const r = state.rooms[side.roomId];
          if (!r?.barricades[side.key]) continue;
          r.barricades[side.key]!.hp = hp;
          keys.add(`room:${r.id}`);
        }
      }
      return [...keys];
    }

    case 'monsterMoved': {
      const a = room(state, cmd.from);
      const b = room(state, cmd.to);
      const rec = a.monsters.find((m) => m.id === cmd.monsterId);
      if (!rec) return [];
      a.monsters = a.monsters.filter((m) => m.id !== cmd.monsterId);
      const { spawnId: _s, door: _d, ...rest } = rec;
      b.monsters = [...b.monsters.filter((m) => m.id !== cmd.monsterId), rest];
      return [`room:${a.id}`, `room:${b.id}`];
    }

    case 'monsterAdded': {
      const r = room(state, cmd.roomId);
      r.monsters = [...r.monsters.filter((m) => m.id !== cmd.record.id), structuredClone(cmd.record)];
      return [`room:${r.id}`];
    }

    case 'roomInsecure': {
      const r = room(state, cmd.roomId);
      if (cmd.since === null) delete r.insecureSince;
      else r.insecureSince = cmd.since;
      return [`room:${r.id}`];
    }

    case 'orderPlaced': {
      const p = player(state, cmd.playerId);
      if (p.cash < cmd.cost) throw new CommandError('Not enough cash');
      p.cash -= cmd.cost;
      const prev = (state.globals[ordersKey(p.id)] as { items: string[] } | undefined)?.items ?? [];
      state.globals[ordersKey(p.id)] = { items: [...prev, ...cmd.items] };
      return [`player:${p.id}`, `global:${ordersKey(p.id)}`];
    }

    case 'tenantSet': {
      const all = { ...((state.globals[TENANTS_KEY] as Record<string, Tenant> | undefined) ?? {}) };
      all[cmd.tenant.id] = structuredClone(cmd.tenant);
      state.globals[TENANTS_KEY] = all;
      return [`global:${TENANTS_KEY}`];
    }

    case 'tenantRemoved': {
      const all = { ...((state.globals[TENANTS_KEY] as Record<string, Tenant> | undefined) ?? {}) };
      delete all[cmd.id];
      state.globals[TENANTS_KEY] = all;
      return [`global:${TENANTS_KEY}`];
    }

    case 'ordersDelivered':
      state.globals[ordersKey(cmd.playerId)] = { items: cmd.remaining ?? [] };
      return [`global:${ordersKey(cmd.playerId)}`];

    case 'timePassed': {
      const c = getClock(state);
      state.globals[CLOCK_KEY] = { day: c.day, minute: c.minute + cmd.minutes };
      return [`global:${CLOCK_KEY}`];
    }

    case 'clockSet':
      state.globals[CLOCK_KEY] = { ...cmd.clock };
      return [`global:${CLOCK_KEY}`];

    case 'slept': {
      const p = player(state, cmd.playerId);
      p.redHalves = cmd.redHalves;
      state.globals[CLOCK_KEY] = { ...cmd.clock };
      return [`player:${p.id}`, `global:${CLOCK_KEY}`];
    }

    case 'messagePosted': {
      const box = getInbox(state, cmd.playerId);
      const messages = [...box.messages.filter((m) => m.id !== cmd.message.id), structuredClone(cmd.message)];
      state.globals[inboxKey(cmd.playerId)] = { messages, unread: Math.min(messages.length, box.unread + 1) };
      return [`global:${inboxKey(cmd.playerId)}`];
    }

    case 'messagesRead': {
      const box = getInbox(state, cmd.playerId);
      state.globals[inboxKey(cmd.playerId)] = { messages: box.messages, unread: 0 };
      return [`global:${inboxKey(cmd.playerId)}`];
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

    case 'messAdded': {
      const r = room(state, cmd.roomId);
      const k = tileKey(cmd.x, cmd.y);
      r.mess ??= {};
      r.mess[k] = Math.min(MAX_MESS, (r.mess[k] ?? 0) + 1);
      return [`room:${r.id}`];
    }

    case 'messCleared': {
      const r = room(state, cmd.roomId);
      const k = tileKey(cmd.x, cmd.y);
      if (!r.mess?.[k]) return [];
      delete r.mess[k];
      return [`room:${r.id}`];
    }

    case 'reputationAdded': {
      const key = reputationKey(cmd.playerId);
      const prev = (state.globals[key] as Reputation | undefined)?.points ?? 0;
      // It can go negative: infamy (see `infamyFactor`).
      state.globals[key] = { points: prev + cmd.delta };
      return [`global:${key}`];
    }

    case 'staffSet': {
      state.globals[STAFF_KEY] = { ...((state.globals[STAFF_KEY] as Record<string, Staff> | undefined) ?? {}), [cmd.staff.id]: structuredClone(cmd.staff) };
      return [`global:${STAFF_KEY}`];
    }

    case 'realtorSet': {
      state.globals[REALTORS_KEY] = { ...((state.globals[REALTORS_KEY] as Record<string, Realtor> | undefined) ?? {}), [cmd.realtor.id]: structuredClone(cmd.realtor) };
      return [`global:${REALTORS_KEY}`];
    }

    case 'realtorRemoved': {
      const all = { ...((state.globals[REALTORS_KEY] as Record<string, Realtor> | undefined) ?? {}) };
      delete all[cmd.id];
      state.globals[REALTORS_KEY] = all;
      return [`global:${REALTORS_KEY}`];
    }

    case 'staffRemoved': {
      const all = { ...((state.globals[STAFF_KEY] as Record<string, Staff> | undefined) ?? {}) };
      delete all[cmd.id];
      state.globals[STAFF_KEY] = all;
      return [`global:${STAFF_KEY}`];
    }

    case 'utilityLaid': {
      const r = room(state, cmd.roomId);
      const k = tileKey(cmd.x, cmd.y);
      r.utilities ??= {};
      r.utilities[k] = { ...r.utilities[k], [cmd.kind]: {} };
      return [`room:${r.id}`];
    }

    case 'utilityRemoved': {
      const r = room(state, cmd.roomId);
      const k = tileKey(cmd.x, cmd.y);
      const t = r.utilities?.[k];
      if (!t) return [];
      delete t[cmd.kind];
      if (!Object.keys(t).length) delete r.utilities![k];
      return [`room:${r.id}`];
    }

    case 'utilityFault': {
      const r = room(state, cmd.roomId);
      const seg = r.utilities?.[tileKey(cmd.x, cmd.y)]?.[cmd.kind];
      if (!seg) return [];
      if (cmd.fault) seg.fault = true;
      else delete seg.fault;
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
