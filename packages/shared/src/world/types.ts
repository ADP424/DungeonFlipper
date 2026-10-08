import type { CellCoord, RoomTag } from '../content/types';

/** A concrete item the player owns / that lies on the ground. Mutable per-instance data lives in `data`. */
export interface ItemInstance {
  uid: string;
  defId: string;
  /**
   * Per-instance state. Conventions:
   *   armorHalves – remaining gray half-hearts on armor
   *   count       – remaining tool uses / roll coverage (stacks up to MAX_STACK)
   *   amount      – gold amount on a gold pickup
   */
  data: Record<string, number | string | boolean>;
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
}

export interface FloorState {
  index: number;
  seed: number;
  /** Sparse, unbounded map of "cx,cy" → room id. */
  cells: Record<string, string>;
  rooms: Record<string, RoomInfo>;
  /** Room containing the up stairs (or safe room on floor 1) – where you arrive. */
  entryRoomId: string;
  /** Room containing the down stairs, if any. */
  stairsDownRoomId?: string;
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
}

export interface GroundItem {
  uid: string;
  /** Global tile coordinates (float). */
  x: number;
  y: number;
  item: ItemInstance;
}

/** Persistent, mutable state of a single room: diffs over its template. */
export interface RoomState {
  id: string;
  floor: number;
  owned: boolean;
  discovered: boolean;
  visited: boolean;
  /** Template spawn ids that have been killed. Enemies never respawn (for now). */
  deadSpawnIds: string[];
  /** "x,y" (global) → obstacle id, or null for "obstacle removed". */
  tileOverrides: Record<string, string | null>;
  /** "x,y" → floor surface id. */
  floorSurfaces: Record<string, string>;
  /** "x,y" → wall surface id (wallpaper). */
  wallSurfaces: Record<string, string>;
  furniture: FurniturePlacement[];
  groundItems: GroundItem[];
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
  gold: number;
  /** Current red health in half-hearts (max is derived from base + passives). */
  redHalves: number;
  baseRedMaxHalves: number;
  hotbar: Hotbar;
  /** Passive item def ids, in pickup order. */
  passives: string[];
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
export type DocKey = 'world' | `floor:${number}` | `room:${string}` | `player:${string}` | `global:${string}`;
