import { Container, Sprite } from 'pixi.js';
import { TILE_PX, type LightDef, type MovementKind } from '@df/shared';
import { tex } from '../../engine/assets';

export type Team = 'player' | 'enemy' | 'neutral';

let nextId = 1;

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
    this.view.position.set(this.x * TILE_PX, this.y * TILE_PX);
    this.view.zIndex = this.y;
  }
}

/** Something with a sprite, a drop shadow and a hit flash. */
export abstract class Actor extends Entity {
  readonly sprite: Sprite;
  readonly shadow: Sprite;
  flash = 0;
  /** Knockback velocity, decays every frame. */
  kx = 0;
  ky = 0;

  constructor(spriteKey: string, scale = 1, tint?: number) {
    super();
    this.shadow = new Sprite(tex('proc:shadow'));
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.scale.set(scale);
    this.shadow.y = 6 * scale;
    this.sprite = new Sprite(tex(spriteKey));
    this.sprite.anchor.set(0.5, 0.75);
    this.sprite.scale.set(scale);
    this.baseTint = tint ?? 0xffffff;
    this.sprite.tint = this.baseTint;
    this.view.addChild(this.shadow, this.sprite);
  }

  protected baseTint: number;

  override syncView(): void {
    super.syncView();
    this.sprite.y = -this.z * TILE_PX + this.sprite.scale.y * 4;
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
