import type { UtilityTile } from './utilities';
import type { CellCoord, RoomTag } from '../content/types';

/** A concrete item the player owns / that lies on the ground. Mutable per-instance data lives in `data`. */
export interface ItemInstance {
  uid: string;
  defId: string;
  /**
   * Per-instance state. Conventions:
   *   armorHalves – remaining gray half-hearts on armor
   *   count       – remaining tool uses / roll coverage (stacks up to MAX_STACK)
   *   amount      – cash amount on a cash pickup
   */
  data: Record<string, number | string | boolean>;
  /** Items carried inside this one (a toolkit's slots; null = empty). */
  contents?: (ItemInstance | null)[];
}

export type Dir = 'n' | 's' | 'e' | 'w';

export interface DoorInfo {
  /** Global tile coordinate of this room's door tile. */
  x: number;
  y: number;
  dir: Dir;
  toRoom: string;
}

/** Static (generated) room info, stored on its floor. */
export interface RoomInfo {
  id: string;
  floor: number;
  templateId: string;
  /** Mirror transform applied to the template. */
  mirrorX: boolean;
  mirrorY: boolean;
  /** Absolute cell coordinates on the floor. */
  cells: CellCoord[];
  doors: DoorInfo[];
  tags: RoomTag[];
  /** Its template's difficulty, as designed: the barricades its doors need, and how much it spills. */
  difficulty: number;
  /**
   * True once the room's door list is final (the player has been inside). Rooms behind its doors
   * exist; unexpanded rooms may still gain doors to new neighbours.
   */
  expanded: boolean;
}

export interface FloorState {
  index: number;
  seed: number;
  /** Sparse, unbounded map of "cx,cy" → room id. */
  cells: Record<string, string>;
  rooms: Record<string, RoomInfo>;
  /** The floor's entry room (safe room on floor 1, stairs up below): where you arrive; has the elevator. */
  lobbyRoomId: string;
  /** The stairs room last used to go down from this floor: where the stairs up from below lead. */
  lastStairsDown?: string;
}

export interface FurniturePlacement {
  uid: string;
  defId: string;
  /** Global tile coordinates of the footprint's top-left. */
  x: number;
  y: number;
  /** Quarter turns, 0..3. */
  rot: number;
  /** Container contents, for container furniture. */
  contents?: (ItemInstance | null)[];
  /** Per-piece state (e.g. a For Rent sign's `closed` listing). */
  data?: Record<string, number | string | boolean>;
}

export interface GroundItem {
  uid: string;
  /** Global tile coordinates (float). */
  x: number;
  y: number;
  item: ItemInstance;
}

/** Persistent, mutable state of a single room: diffs over its template. */
/**
 * A monster persisted in a room's roster. Template spawns never respawn; later, incursions add
 * records without a `spawnId` (placed near the door they came through).
 */
export interface MonsterRecord {
  id: string;
  defId: string;
  /** Remaining health as a fraction of max (0..1]; absent = full health. */
  hpFrac?: number;
  /** Template spawn ("mx,my") the monster stands on when the room loads. */
  spawnId?: string;
  /** Door tile ("x,y") it came in through, for monsters that spilled in: placed just inside it. */
  door?: string;
}

/** A barricade on one of a room's door tiles. Tier 1 (planks) also blocks the player. */
export interface Barricade {
  tier: number;
  hp: number;
}

export interface RoomState {
  id: string;
  floor: number;
  /** Actor (player / realtor) owning the room, or null. Generated rooms may hold WORLD_OWNER. */
  ownerId: string | null;
  discovered: boolean;
  visited: boolean;
  /** Every monster in the room. Empty = cleared. */
  monsters: MonsterRecord[];
  /** Door tile "x,y" (this room's side) → barricade. */
  barricades: Record<string, Barricade>;
  /** Day an owned room became insecure; lost if still insecure at the end of a later day. */
  insecureSince?: number;
  /** "x,y" (global) → obstacle id, or null for "obstacle removed". */
  tileOverrides: Record<string, string | null>;
  /** "x,y" → floor surface id. */
  floorSurfaces: Record<string, string>;
  /** "x,y" → wall surface id (wallpaper). */
  wallSurfaces: Record<string, string>;
  furniture: FurniturePlacement[];
  groundItems: GroundItem[];
  /** "x,y" (global) → pipe / wire segments laid there (P6). Absent = none anywhere. */
  utilities?: Record<string, UtilityTile>;
  /** "x,y" (global) → how messy the tile is, 1–3 (P7). */
  mess?: Record<string, number>;
}

export interface Hotbar {
  main: ItemInstance | null;
  off: ItemInstance | null;
  armor: ItemInstance | null;
  slots: (ItemInstance | null)[];
}

export type HotbarSlotId = 'main' | 'off' | 'armor' | number;

export interface PlayerState {
  id: string;
  floor: number;
  roomId: string;
  /** Global tile coordinates. */
  x: number;
  y: number;
  cash: number;
  /** Current red health in half-hearts (max is `baseRedMaxHalves` plus what's worn). */
  redHalves: number;
  baseRedMaxHalves: number;
  hotbar: Hotbar;
  /** Furniture currently being carried overhead. */
  carrying: FurniturePlacement | null;
  deaths: number;
}

export interface WorldState {
  schemaVersion: number;
  worldId: string;
  ownerId: string;
  seed: number;
  createdAt: number;
  /** Server revision this state corresponds to (client-side bookkeeping). */
  revision: number;
  floors: Record<number, FloorState>;
  rooms: Record<string, RoomState>;
  players: Record<string, PlayerState>;
  /** Room-independent state (NPCs, timers, cooking…). Resolved lazily by `advance()`. */
  globals: Record<string, unknown>;
}

/** Identifies a separately persisted document. */
export type DocKey = 'world' | `floor:${number}` | `region:${number}:${string}` | `room:${string}` | `player:${string}` | `global:${string}`;
