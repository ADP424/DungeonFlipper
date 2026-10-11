import { Sprite } from 'pixi.js';
import type { PuddleDef } from '@df/shared';
import { tex } from '../../engine/assets';
import { Entity } from './Entity';

/** Seconds a puddle takes to dry away at the end of its life. */
const FADE = 1;

/** A patch left on the floor (a burst water glob) that slows the player while they stand in it. */
export class Puddle extends Entity {
  age = 0;
  private readonly sprite: Sprite;

  constructor(readonly def: PuddleDef, x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    this.sprite = new Sprite(tex(def.sprite));
    this.sprite.anchor.set(0.5);
    this.view.addChild(this.sprite);
  }

  update(dt: number): void {
    this.age += dt;
    if (this.age >= this.def.duration) this.dead = true;
  }

  contains(x: number, y: number): boolean {
    return !this.dead && Math.hypot(x - this.x, y - this.y) <= this.radius;
  }

  override syncView(): void {
    super.syncView();
    this.sprite.alpha = Math.min(1, (this.def.duration - this.age) / FADE);
    // On the floor: under anything standing in it.
    this.view.zIndex = this.y - this.radius - 0.1;
  }
}
