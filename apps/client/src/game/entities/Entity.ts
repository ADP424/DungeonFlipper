import { Container, Sprite } from 'pixi.js';
import { TILE_PX, type LightDef, type MovementKind } from '@df/shared';
import { tex } from '../../engine/assets';

export type Team = 'player' | 'enemy' | 'neutral';

let nextId = 1;

/**
 * Where something at a tile position is drawn: on a whole art pixel. Things move by fractions of a
 * pixel but are drawn on the art's grid, the one the light and shadow maps are on, so the light on a
 * sprite and the shadow it casts line up with it exactly.
 */
export const artPixel = (tiles: number) => Math.round(tiles * TILE_PX);

/** Base for everything that lives in a room at runtime. Positions are tile units (floats). */
export abstract class Entity {
  readonly id = nextId++;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 0.35;
  team: Team = 'neutral';
  movementKind: MovementKind = 'walk';
  /** Visual height above the ground (tiles), for hops and lobs. */
  z = 0;
  dead = false;
  light?: LightDef;
  readonly view = new Container();

  /** Sync the view to the simulation state. */
  syncView(): void {
    this.view.position.set(artPixel(this.x), artPixel(this.y));
    this.view.zIndex = this.y;
  }
}

/** Something with a sprite, a drop shadow and a hit flash. */
export abstract class Actor extends Entity {
  readonly sprite: Sprite;
  readonly shadow: Sprite;
  /** The sprite's texture key (its silhouette casts the shadow). */
  spriteKey: string;
  flash = 0;
  /** Knockback velocity, decays every frame. */
  kx = 0;
  ky = 0;

  /**
   * Sprites are never scaled (every art pixel is the same size on screen): a bigger actor has bigger
   * art, and gets the large shadow.
   */
  constructor(spriteKey: string, tint?: number) {
    super();
    this.spriteKey = spriteKey;
    this.sprite = new Sprite(tex(spriteKey));
    this.sprite.anchor.set(0.5, 0.75);
    const h = this.sprite.texture.height;
    this.shadow = new Sprite(tex(this.sprite.texture.width > 16 ? 'fx/shadow_large' : 'fx/shadow'));
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.y = Math.round(h * 0.375);
    this.baseTint = tint ?? 0xffffff;
    this.sprite.tint = this.baseTint;
    this.view.addChild(this.shadow, this.sprite);
  }

  protected baseTint: number;

  /** Show another sprite (an animation frame, a pose); its silhouette then casts the shadow. */
  setSprite(key: string): void {
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    this.sprite.texture = tex(key);
  }

  override syncView(): void {
    super.syncView();
    this.sprite.y = -artPixel(this.z) + this.sprite.texture.height / 4;
    this.sprite.tint = this.flash > 0 ? 0xff6060 : this.baseTint;
    this.sprite.alpha = 1;
  }

  /** Apply decaying knockback. Returns the displacement for this step. */
  knockStep(dt: number): { dx: number; dy: number } {
    const dx = this.kx * dt, dy = this.ky * dt;
    const decay = Math.exp(-10 * dt);
    this.kx *= decay;
    this.ky *= decay;
    if (Math.abs(this.kx) < 0.05) this.kx = 0;
    if (Math.abs(this.ky) < 0.05) this.ky = 0;
    return { dx, dy };
  }
}
