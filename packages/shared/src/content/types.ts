/**
 * Content definition types. Every game "thing" is a plain data def registered by string id.
 * Behaviour lives in named, parameterised modules (see BehaviorRef) resolved by the client,
 * so new content is usually a new def file and new mechanics are a new behaviour module.
 */

/** How an entity moves; obstacles declare which kinds they block. Extend freely (jump, climb, swim…). */
export type MovementKind = 'walk' | 'fly';
/** How a projectile travels; obstacles declare which kinds they block. */
export type TrajectoryKind = 'straight' | 'lobbed';

/**
 * Sprite reference. Strings are asset keys resolved by the client asset registry:
 *   'td:98'  → Kenney Tiny Dungeon tile 98
 *   'ri:170' → Kenney Roguelike Indoors tile 170
 *   'proc:bow' → procedurally drawn texture
 * Multi-tile sprites list tile keys row by row.
 */
export type SpriteKey = string;
export interface CompositeSprite { tiles: (SpriteKey | null)[][] }

/** Reference to a behaviour module with parameters. */
export interface BehaviorRef<P = Record<string, unknown>> {
  id: string;
  params?: P;
}

export interface LightDef {
  /** Radius in tiles. */
  radius: number;
  color: number;
  intensity?: number;
  /** 0..1 amount of flicker. */
  flicker?: number;
  /** Whether objects in the room cast shadows away from this light. */
  shadows?: boolean;
  /** Height of the flame / bulb above the floor, in tiles (default 1.5). Lower lights cast longer shadows. */
  height?: number;
}

// ───────────────────────────── Obstacles ─────────────────────────────

export type WallHeight = 'none' | 'short' | 'tall';

export interface ObstacleDef {
  id: string;
  name: string;
  sprite: SpriteKey;
  blocksMovement: MovementKind[];
  blocksProjectiles: TrajectoryKind[];
  /** Damage dealt (half-hearts for the player, hp for enemies) to entities standing on it. */
  hazard?: { damage: number; enemyDamage: number; affects: MovementKind[] };
  /** Visual / renovation height. Short walls cost 1 to build, demolish or paper; tall walls cost 2. Also sets shadow length. */
  height: WallHeight;
  /** Can take wallpaper. */
  isWall?: boolean;
  /** Wall material, for upgrading short→tall with the matching kit. */
  material?: string;
  /** Tool actions that can be performed on it, e.g. 'demolish', 'fill'. */
  renovate?: string[];
  /** Behaviour triggered when the player steps on the tile (e.g. stairs). */
  trigger?: BehaviorRef;
  /** Tiles of the same group visually connect (holes, walls). */
  connectGroup?: string;
  /**
   * Wall autotiling: the piece set the tile is composed from (`walls/<set>.png`, see assets.ts), and
   * the connect groups it joins with. Void (outside the room) always counts as joined.
   */
  autotile?: { set: string; joins: string[] };
  light?: LightDef;
}

// ───────────────────────────── Surfaces ─────────────────────────────

export interface SurfaceDef {
  id: string;
  name: string;
  applies: 'floor' | 'wall';
  /** Procedural pattern description; the client turns it into a texture. */
  pattern: {
    style: 'stripes' | 'damask' | 'planks' | 'checker' | 'solid' | 'weave' | 'diamond';
    base: number;
    accent: number;
  };
}

// ───────────────────────────── Furniture ─────────────────────────────

export interface FurnitureDef {
  id: string;
  name: string;
  /** Footprint at rotation 0. Odd rotations swap w/h. */
  size: { w: number; h: number };
  sprite: SpriteKey | CompositeSprite;
  rotatable: boolean;
  blocksMovement: MovementKind[];
  blocksProjectiles: TrajectoryKind[];
  light?: LightDef;
  /** Height in tiles, for shadow length (default 0.7). */
  height?: number;
  /** Container (e.g. storage chest): number of item slots. Containers open on click, lift on hold. */
  container?: { slots: number };
  /** Can't be lifted or moved (the apartment bed, elevators, utility sources…). */
  fixed?: boolean;
  /** A claim marker (the company flag): removed when its room is lost. */
  claimsRoom?: boolean;
  /** How desirable it is (1 = stool … 5 = piano). Only furniture with a value appears in furniture slots. */
  value?: number;
  /** Categories furniture slots can ask for ('light', 'seat', 'table', 'storage', 'plant', 'bed'…). */
  tags?: string[];
  /** Click action (client `furnitureUses` registry). Movable furniture with a use lifts on hold, like containers. */
  use?: BehaviorRef;
  /** Sold by the phone's Hardware app for this many dollars, delivered onto your apartment floor. */
  price?: number;
  /** Small enough to stand on a tabletop (a desk lamp, a plant). */
  small?: boolean;
  /** Small furniture can stand on it, drawn this many pixels up (its top surface). */
  tabletop?: number;
  /** Utilities (P6): a source of power / water, or a fixture that needs one to work. */
  utility?: { provides?: 'power' | 'water'; needs?: 'power' | 'water' };
}

// ───────────────────────────── Projectiles ─────────────────────────────

export interface ProjectileDef {
  id: string;
  trajectory: TrajectoryKind;
  /** Tiles per second. */
  speed: number;
  /** Collision radius in tiles. */
  radius: number;
  /** Seconds before it expires (straight) – lobbed projectiles land at their target instead. */
  lifetime: number;
  /** Extra targets it can pass through. */
  pierce?: number;
  /** Radians per second the projectile can turn towards its target. */
  homing?: number;
  /** Peak height (tiles) for lobbed projectiles. */
  lobHeight?: number;
  /** Area radius (tiles) on landing / impact. */
  splash?: number;
  sprite: SpriteKey;
  /** Rotate sprite to face travel direction. */
  orient?: boolean;
  light?: LightDef;
}

// ───────────────────────────── Items ─────────────────────────────

export type MeleePattern = 'stab' | 'arc' | 'smash' | 'spin';

export interface MeleeAttackDef {
  type: 'melee';
  pattern: MeleePattern;
  /** Reach beyond the wielder's body, in tiles (quarter-tile precision, e.g. 1.25). */
  range: number;
  /** Width in tiles for 'stab'. */
  width?: number;
  /** Total sweep for 'arc'. */
  arcDegrees?: number;
  damage: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** Seconds before the hitbox becomes active. */
  windup: number;
  /** Seconds the hitbox is active. */
  duration: number;
  /** Knockback impulse (tiles/s). */
  knockback: number;
}

export interface RangedAttackDef {
  type: 'ranged';
  projectile: string;
  damage: number;
  cooldown: number;
  count?: number;
  /** Degrees between projectiles when count > 1, or random spread for single shots. */
  spread?: number;
  knockback?: number;
}

export type AttackDef = MeleeAttackDef | RangedAttackDef;

export interface StatMod { stat: StatName; add?: number; mul?: number }

export type StatName =
  | 'moveSpeed'
  | 'damage'
  | 'cooldown'
  | 'projectileSpeed'
  | 'extraProjectiles'
  | 'meleeRange'
  | 'maxRedHalves'
  | 'knockback';

interface ItemBase {
  id: string;
  name: string;
  description: string;
  icon: SpriteKey;
  /** Sold by the phone's Hardware app for this much cash (delivered to the apartment next morning). */
  price?: number;
}

export interface WeaponDef extends ItemBase {
  kind: 'weapon';
  attack: AttackDef;
  light?: LightDef;
  /**
   * Dual-use tools: in any room with no enemies alive, left click renovates with this action
   * instead of attacking. Renovating spends `count` uses (starting at `uses`); attacking never does.
   */
  tool?: { action: BehaviorRef; uses: number };
}
export interface ArmorDef extends ItemBase { kind: 'armor'; halves: number; mods?: StatMod[] }
export interface ToolDef extends ItemBase {
  kind: 'tool';
  /** Tool action module id (client): 'demolish' | 'fill' | 'buildWall' … */
  action: BehaviorRef;
  /** Starting uses, stored on the instance as `count`. Tools stack up to MAX_STACK. */
  uses: number;
}
/** `coverage` is the starting count; rolls stack up to MAX_STACK. */
export interface RollDef extends ItemBase { kind: 'roll'; surface: string; coverage: number }
export interface PassiveDef extends ItemBase { kind: 'passive'; mods?: StatMod[]; effects?: BehaviorRef[] }
/** Consumed on touch (hearts, coins…). */
export interface PickupDef extends ItemBase { kind: 'pickup'; effect: BehaviorRef; sprite?: SpriteKey }

/** Carries other items in the hotbar (a toolkit): `slots` of them, of the kinds `kitAccepts` allows. */
export interface KitDef extends ItemBase { kind: 'kit'; slots: number }
export type ItemDef = WeaponDef | ArmorDef | ToolDef | RollDef | PassiveDef | PickupDef | KitDef;
export type ItemKind = ItemDef['kind'];

// ───────────────────────────── Enemies ─────────────────────────────

export interface EnemyDef {
  id: string;
  name: string;
  sprite: SpriteKey;
  /** Sprite scale relative to one tile. */
  scale?: number;
  tint?: number;
  /** Collision radius in tiles. */
  radius: number;
  hp: number;
  /** Spawn-budget cost (~1–10 for normal enemies). Rooms fill spawn slots by difficulty from this. */
  threat: number;
  /** Free-form traits spawn slots can ask for ('flyer', 'ranged', 'swarm', 'brute'…). */
  tags: string[];
  /** Tiles per second. */
  speed: number;
  movementKind: MovementKind;
  movement: BehaviorRef;
  /** Any number of attack behaviours run together (contact, shooting, summoning…). */
  attacks: BehaviorRef[];
  hazardImmune?: boolean;
  /** 0 = full knockback, 1 = immune. */
  knockbackResist?: number;
  lootTable?: string;
  light?: LightDef;
  /** Present for bosses: shows a health bar. Boss rooms only appear at or beyond `minDifficulty`. */
  boss?: { title: string; minDifficulty: number };
}

// ───────────────────────────── Health layers ─────────────────────────────

export interface HealthLayerDef {
  id: string;
  name: string;
  /** Higher drains first. */
  priority: number;
  color: number;
  /** When a layer bound to an item empties, that item breaks. */
  breaksBoundItem?: boolean;
}

// ───────────────────────────── Loot ─────────────────────────────

export type LootEntry =
  | { chance: number; item: string }
  | { chance: number; cash: number | [number, number] };

export interface LootDrop {
  /** Probability this drop happens at all. */
  chance: number;
  /** If the drop happens, exactly one entry is chosen by these chances; leftover = nothing. */
  entries: LootEntry[];
}

export interface LootTableDef { id: string; drops: LootDrop[] }

// ───────────────────────────── Rooms ─────────────────────────────

/** `lobby`: a floor's entry room (elevator, NPC arrivals). `home`: your real-world apartment (floor 0). */
export type RoomTag = 'normal' | 'safe' | 'boss' | 'stairsDown' | 'stairsUp' | 'lobby' | 'home';

export interface CellCoord { cx: number; cy: number }

export interface RoomTemplateDef {
  id: string;
  /** Cells covered, relative to (0,0). */
  cells: CellCoord[];
  tags: RoomTag[];
  weight?: number;
  /** Only generated where room difficulty is at least this. */
  minDifficulty?: number;
  /** Rooms with these tags are attached behind this one when it is generated (boss room → stairs down). */
  attach?: RoomTag[];
  /**
   * ASCII layout of the room's bounding box *minus its outer 1-tile wall ring*.
   * Characters on derived boundary/void tiles are ignored. See layout legend in roomTemplates/legend.ts.
   */
  map: string[];
  /** Extra per-template legend entries (merged over the default legend). */
  legend?: Record<string, LegendEntry>;
  /** Furniture placed at generation time (e.g. safe room starters), coordinates relative to the map. */
  /** Container contents by item id; a kit can be given its own contents: `{ id: 'toolkit', contents: [...] }`. */
  furniture?: { def: string; x: number; y: number; rot?: number; contents?: (string | { id: string; contents: string[] } | null)[] }[];
  /** Default floor / wall surface of the room (unpapered tiles); the Backrooms carpet and wallpaper otherwise. */
  floorSurface?: string;
  wallSurface?: string;
  /** Rooms with this flag start owned (safe room). */
  startsOwned?: boolean;
}

/**
 * An enemy spawn point. Generation picks the enemy from the room's difficulty and threat budget:
 *  - `{}`: any normal enemy; `tags`: only enemies having all of them;
 *  - `enemies`: one of exactly these (a single entry pins the enemy). Always spawns, ignores the difficulty cap;
 *  - `boss`: the hardest boss eligible at the room's difficulty.
 */
export interface SpawnSlot { tags?: string[]; enemies?: string[]; boss?: boolean }

export type LegendEntry =
  | { obstacle: string }
  /** Shorthand for a slot pinned to one enemy. */
  | { enemy: string }
  | { slot: SpawnSlot }
  /** Furniture placed on the tile when the room is generated (it can be lifted like any other). */
  | { furniture: string }
  /** Maybe furniture, chosen at generation by difficulty (better pieces farther out); `tags` narrow it. */
  | { furnitureSlot: { tags?: string[]; chance?: number } }
  | { floor: true };
