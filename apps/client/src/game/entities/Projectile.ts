import { Sprite } from 'pixi.js';
import { TILE_PX, type ProjectileDef } from '@df/shared';
import { tex } from '../../engine/assets';
import { Entity, type Team } from './Entity';

export interface ProjectileInit {
  def: ProjectileDef;
  team: Team;
  x: number;
  y: number;
  /** Unit direction. */
  dx: number;
  dy: number;
  damage: number;
  knockback: number;
  speedMul?: number;
  /** For lobbed projectiles: landing point. */
  targetX?: number;
  targetY?: number;
}

export class Projectile extends Entity {
  readonly def: ProjectileDef;
  damage: number;
  knockback: number;
  pierceLeft: number;
  age = 0;
  readonly hit = new Set<number>();
  readonly sprite: Sprite;
  readonly shadow: Sprite;
  /** Lob flight: start, target and duration. */
  lob?: { sx: number; sy: number; tx: number; ty: number; dur: number };

  constructor(init: ProjectileInit) {
    super();
    this.def = init.def;
    this.team = init.team;
    this.x = init.x;
    this.y = init.y;
    this.radius = init.def.radius;
    this.damage = init.damage;
    this.knockback = init.knockback;
    this.pierceLeft = init.def.pierce ?? 0;
    this.light = init.def.light;
    const speed = init.def.speed * (init.speedMul ?? 1);
    this.vx = init.dx * speed;
    this.vy = init.dy * speed;
    if (init.def.trajectory === 'lobbed') {
      const tx = init.targetX ?? init.x + init.dx * 4;
      const ty = init.targetY ?? init.y + init.dy * 4;
      const d = Math.hypot(tx - init.x, ty - init.y);
      this.lob = { sx: init.x, sy: init.y, tx, ty, dur: Math.max(0.25, d / speed) };
    }
    this.shadow = new Sprite(tex('proc:shadow'));
    this.shadow.anchor.set(0.5);
    this.shadow.scale.set(0.5);
    this.shadow.visible = !!this.lob;
    this.sprite = new Sprite(tex(init.def.sprite));
    this.sprite.anchor.set(0.5);
    if (init.def.orient) this.sprite.rotation = Math.atan2(init.dy, init.dx);
    this.view.addChild(this.shadow, this.sprite);
  }

  override syncView(): void {
    super.syncView();
    this.sprite.y = -this.z * TILE_PX - (this.lob ? 0 : 4);
    this.view.zIndex = this.y + 0.5;
  }
}
