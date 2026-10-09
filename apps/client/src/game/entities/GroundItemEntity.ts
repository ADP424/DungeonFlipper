import { Sprite } from 'pixi.js';
import { TILE_PX, itemDef, type GroundItem } from '@df/shared';
import { tex } from '../../engine/assets';
import { Entity } from './Entity';

/** An item lying on the floor. Spawns with a short "spill" arc from where it dropped. */
export class GroundItemEntity extends Entity {
  readonly sprite: Sprite;
  readonly shadow: Sprite;
  private spill?: { fx: number; fy: number; t: number; dur: number };
  /** Can't be picked up until the player has stepped away (after dropping it themselves). */
  requiresExit = false;
  /** The room whose state lists it. */
  roomId = '';
  private bobT = Math.random() * 10;

  constructor(readonly data: GroundItem, spillFrom?: { x: number; y: number }) {
    super();
    this.x = data.x;
    this.y = data.y;
    this.radius = 0.3;
    const def = itemDef(data.item);
    this.shadow = new Sprite(tex('proc:shadow'));
    this.shadow.anchor.set(0.5);
    this.shadow.scale.set(0.6);
    this.shadow.y = 3;
    this.sprite = new Sprite(tex(def.kind === 'pickup' && def.sprite ? def.sprite : def.icon));
    this.sprite.anchor.set(0.5, 0.7);
    this.sprite.scale.set(def.kind === 'pickup' ? 0.75 : 0.85);
    this.view.addChild(this.shadow, this.sprite);
    if (spillFrom) this.spill = { fx: spillFrom.x, fy: spillFrom.y, t: 0, dur: 0.35 + Math.random() * 0.15 };
  }

  get settled(): boolean {
    return !this.spill;
  }

  update(dt: number): void {
    this.bobT += dt;
    if (this.spill) {
      this.spill.t += dt;
      const t = Math.min(1, this.spill.t / this.spill.dur);
      this.x = this.spill.fx + (this.data.x - this.spill.fx) * t;
      this.y = this.spill.fy + (this.data.y - this.spill.fy) * t;
      // Bounce: a high arc then a small hop.
      this.z = t < 0.75 ? Math.sin((t / 0.75) * Math.PI) * 0.8 : Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.15;
      if (t >= 1) {
        this.spill = undefined;
        this.z = 0;
        this.x = this.data.x;
        this.y = this.data.y;
      }
    }
  }

  override syncView(): void {
    super.syncView();
    const bob = this.spill ? 0 : Math.sin(this.bobT * 3) * 0.06;
    this.sprite.y = -(this.z + bob) * TILE_PX;
    this.view.zIndex = this.y - 0.2;
  }
}
