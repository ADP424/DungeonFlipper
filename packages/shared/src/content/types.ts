/**
 * Content definition types. Every game "thing" is a plain data def registered by string id.
 * Behaviour lives in named, parameterised modules (see BehaviorRef) resolved by the client,
 * so new content is usually a new def file and new mechanics are a new behaviour module.
 */
import type { AnimSpeed } from '../core/animation';
import type { BodyViewSet } from '../core/views';

/** How an entity moves; obstacles declare which kinds they block. Extend freely (jump, climb, swim…). */
export type MovementKind = 'walk' | 'fly';
/**
 * How a projectile travels; obstacles declare which kinds they block. `straight` flies at a body's
 * middle; `high` is a straight shot fired from the air (by a flyer, `shotTrajectory`), over anything
 * short; `lobbed` arcs over everything but what is tall.
 */
export type TrajectoryKind = 'straight' | 'high' | 'lobbed';

/**
 * Sprite reference: the path of a PNG under apps/client/art/, without the extension ('furniture/sofa').
 * A folder of numbered PNGs is an animation ('player/walk' → walk/0.png, walk/1.png…). Furniture art
 * covers its whole footprint (a 2×1 sofa is 32×16). The client also draws a few generated keys
 * (`wall:`, `auto:`… see engine/assets.ts).
 */
export type SpriteKey = string;

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
  /**
   * Furniture: where the light is on the floor plan, in art pixels within the footprint facing south
   * (it turns with the piece); its height is `height`. Default: centred, 0.4 tiles from the top.
   */
  at?: { x: number; y: number };
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
  /**
   * How much floor it stands on, front to back: art pixels up from the tile's south edge (default: the
   * whole tile). The rest of the tile is the thing rising up, which bodies can step behind (and are
   * drawn under) unless something else stands there. Walls of both heights are as deep as a tall
   * wall's top is drawn (the tile less its face), so bodies stop at the same spot behind either.
   */
  depth?: number;
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
   * Wall autotiling: the piece set the tile is composed from (the art folder `walls/<set>/`, named
   * after the obstacle; see assets.ts), and the connect groups it joins with. Void (outside the room)
   * always counts as joined.
   */
  autotile?: { set: string; joins: string[] };
  light?: LightDef;
}

// ───────────────────────────── Surfaces ─────────────────────────────

export interface SurfaceDef {
  id: string;
  name: string;
  applies: 'floor' | 'wall';
  /** A filled 16×16 texture that tiles with itself: `floor/<id>` or `wallpaper/<id>`. */
  sprite: string;
}

// ───────────────────────────── Furniture ─────────────────────────────

export interface FurnitureDef {
  id: string;
  name: string;
  /** Footprint (tiles it stands on) facing south. Odd facings swap w/h. */
  size: { w: number; h: number };
  /**
   * Art folder with a view per facing: `<sprite>/south.png`, `north.png` and `side.png` (facing east; west
   * mirrors it). Only south is required: a missing north or side is drawn as south.
   */
  sprite: SpriteKey;
  /**
   * What it turns around, in tiles from the footprint's top-left at facing 0: a cell centre or a grid
   * corner. Default: chosen from the shape (`defaultPivot` in world/furniture.ts).
   */
  pivot?: { x: number; y: number };
  /**
   * How much floor it stands on, front to back: art pixels up from the footprint's bottom edge as it's
   * drawn, in every facing or per view (the art's views needn't agree). Default: the whole footprint.
   * What's drawn above that is the piece rising up, which bodies can step behind.
   */
  depth?: number | { south: number; north: number; side: number };
  /**
   * What's solid, as boxes in art pixels within the footprint facing south (they turn with it), for
   * shapes `depth` can't say. A tall lamp is solid only at its base, so you can walk behind its pole.
   */
  collision?: { x: number; y: number; w: number; h: number }[];
  blocksMovement: MovementKind[];
  blocksProjectiles: TrajectoryKind[];
  light?: LightDef;
  /**
   * Height in tiles, for shadow length (default 0.7). A view with a painted height map
   * (`<sprite>/<view>_height.png`, see assets.ts) takes its heights from that instead; this is then
   * only how high things on its tabletop stand, and how tall its `collision` boxes are.
   */
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
  /** Sold by the phone's Hardware app for this much cash, delivered onto your apartment floor. */
  price?: number;
  /** People it sleeps (furniture tagged `bed`; default 1). */
  sleeps?: number;
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
  /** How it travels when the player or a walker throws it (`high` comes only from flyers, see `shotTrajectory`). */
  trajectory: Exclude<TrajectoryKind, 'high'>;
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
  /** A melee swing knocks it out of the air. */
  swattable?: boolean;
  /** What it leaves on the floor where it lands or bursts. */
  leaves?: PuddleDef;
  light?: LightDef;
}

/** A patch on the floor that slows whoever walks through it, for a while. */
export interface PuddleDef {
  sprite: SpriteKey;
  /** Radius in tiles. */
  radius: number;
  /** Seconds it lasts. */
  duration: number;
  /** Move-speed multiplier for the player while standing in it. */
  slow: number;
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
   * Dual-use tools: a click attacks as ever, and holding the button on a tile renovates it with this
   * action. Renovating spends `count` uses (starting at `uses`); attacking never does.
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
/** Consumed on touch (hearts, coins…). */
export interface PickupDef extends ItemBase { kind: 'pickup'; effect: BehaviorRef; sprite?: SpriteKey }

/** Carries other items in the hotbar (a toolkit): `slots` of them, of the kinds `kitAccepts` allows. */
export interface KitDef extends ItemBase { kind: 'kit'; slots: number }
export type ItemDef = WeaponDef | ArmorDef | ToolDef | RollDef | PickupDef | KitDef;
export type ItemKind = ItemDef['kind'];

// ───────────────────────────── Enemies ─────────────────────────────

/**
 * A named animation of an enemy: a wind-up, a stagger, a phone call… Brains play them by name. One
 * named `idle` plays whenever the brain poses nothing (without it the enemy rests on its `sprite`).
 */
export interface EnemyAnimDef {
  /**
   * A folder of numbered PNGs (`enemies/<id>/windup`), or one image for a single held pose. For an
   * enemy with `views`, a folder holding one of either per view (`sprint/left/0.png…`, `idle/left.png`).
   */
  frames: SpriteKey;
  /** Its own pace (default `fast`). A brain may instead spread the frames over a duration. */
  speed?: AnimSpeed;
  /** Start over after the last frame instead of holding it. Loops everywhere run on one clock, so they stay in step. */
  loop?: boolean;
  /** Flickers: swaps with the resting art and back at this speed. */
  flicker?: AnimSpeed;
}

/**
 * Something an enemy holds, drawn like the player's items. `aimed`: out in front, swinging around the
 * body to wherever the enemy faces (weapons, shields). `carried`: upright in the hand (anything that
 * doesn't need to touch things).
 */
export interface HeldItemDef {
  sprite: SpriteKey;
  grip: 'aimed' | 'carried';
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Its resting art: `enemies/<id>/idle` (with `views`, a folder of one image per view). */
  sprite: SpriteKey;
  /**
   * Drawn once per direction it faces (`Enemy.facing`): which views its art has (`BODY_VIEWS`). All of
   * its art is then per view. Without it, one drawing serves every direction.
   */
  views?: BodyViewSet;
  tint?: number;
  /** How wide it is: half its width in tiles, for collision and for what hits it. */
  radius: number;
  /** How deep its footing is, in art pixels (default 2): how far short of a thing's base its feet stop. */
  depth?: number;
  /** The same everywhere: an enemy is never scaled by where it's found. */
  hp: number;
  /**
   * How hard it is, as a description, on roughly the same scale as room difficulty (any positive
   * number). Only spilling through doors reads it, as the cost of one of these against the capacity
   * the room they come from gives (`spillCapacity`).
   */
  difficulty: number;
  /** Tiles per second. */
  speed: number;
  movementKind: MovementKind;
  /** Its brain (client `behaviors/enemies/<id>.ts`): one per enemy, with every tunable number in `params`. */
  ai: BehaviorRef;
  /** Half-hearts dealt on touch while it's on the ground and visible; none if absent. */
  contactDamage?: number;
  anims?: Record<string, EnemyAnimDef>;
  held?: HeldItemDef;
  hazardImmune?: boolean;
  /** 0 = full knockback, 1 = immune. */
  knockbackResist?: number;
  /** What it drops: every drop rolls on its own (see `rollLoot`). */
  loot?: LootDrop[];
  light?: LightDef;
  /** A person (realtor, guard, thug): never part of a room's monster roster, only spawned by the game. */
  npc?: boolean;
  /** Present for bosses: shows a health bar. */
  boss?: { title: string };
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


// ───────────────────────────── Rooms ─────────────────────────────

/** `lobby`: a floor's entry room (elevator, NPC arrivals). `home`: your real-world apartment (floor 0). */
export type RoomTag = 'normal' | 'safe' | 'boss' | 'stairsDown' | 'stairsUp' | 'lobby' | 'home';

export interface CellCoord { cx: number; cy: number }

export interface RoomTemplateDef {
  id: string;
  /** Cells covered, relative to (0,0). */
  cells: CellCoord[];
  tags: RoomTag[];
  /** Relative chance among the templates that may appear somewhere (default 1). */
  weight?: number;
  /**
   * How hard the room is, as its designer rates it (any number ≥ 0; default 0). It decides where the
   * room may appear (only at a depth of at least this, more often farther out: `templateWeight`), the
   * barricade its doors need, and how much it spills. It never changes what's in the room.
   */
  difficulty?: number;
  /** Rooms with these tags are attached behind this one when it is generated (boss room → stairs down). */
  attach?: RoomTag[];
  /**
   * ASCII layout of the room's bounding box *minus its outer 1-tile wall ring*. Characters on derived
   * boundary/void tiles are ignored. Structure (walls, holes, stairs) uses the shared characters of
   * roomTemplates/legend.ts; everything else is a slot this template names in `legend`.
   */
  map: string[];
  /**
   * What this room's own map characters hold: exactly which enemy stands there, exactly which piece
   * of furniture. Any character works and means something only in this template (merged over the
   * shared legend), so rooms never run out of letters.
   */
  legend?: Record<string, LegendEntry>;
  /** Default floor / wall surface of the room (unpapered tiles); the Backrooms carpet and wallpaper otherwise. */
  floorSurface?: string;
  wallSurface?: string;
  /** Rooms with this flag start owned (safe room). */
  startsOwned?: boolean;
}

/** What a container starts with: item ids by slot; a kit can be given its own contents. */
export type TemplateContents = (string | { id: string; contents: string[] } | null)[];

export type LegendEntry =
  | { obstacle: string }
  /** This enemy starts here. */
  | { enemy: string }
  /**
   * This piece of furniture stands here (the character marks its footprint's top-left tile as drawn;
   * the rest of the footprint is plain floor in the map). It can be lifted like any other.
   */
  | { furniture: string; rot?: number; contents?: TemplateContents }
  | { floor: true };
