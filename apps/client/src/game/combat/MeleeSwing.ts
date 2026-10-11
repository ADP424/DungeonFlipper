import { Container, Graphics, Sprite } from 'pixi.js';
import { TILE_PX, angleDiff, type MeleeAttackDef } from '@df/shared';
import { tex } from '../../engine/assets';
import type { Entity } from '../entities/Entity';

export interface SwingHit { target: Entity; dirX: number; dirY: number }

/**
 * A melee attack in progress. Patterns:
 *  stab  – a thrust of `range` tiles and `width` straight ahead
 *  arc   – a sweep of `arcDegrees` with radius `range`
 *  smash – a circular impact `range` tiles ahead at the end of the windup
 *  spin  – a full 360° sweep
 * Range is measured from the wielder's body edge, so 1.25 means 1¼ tiles of reach.
 */
export class MeleeSwing {
  t = 0;
  readonly hit = new Set<number>();
  readonly view = new Container();
  private gfx = new Graphics();
  private weapon: Sprite;
  done = false;

  constructor(
    readonly attack: MeleeAttackDef,
    readonly angle: number,
    /** Effective range in tiles (includes stat bonuses). */
    readonly range: number,
    readonly damage: number,
    readonly knockback: number,
    icon: string,
  ) {
    this.weapon = new Sprite(tex(icon));
    this.weapon.anchor.set(0.5, 0.9);
    this.view.addChild(this.gfx, this.weapon);
  }

  get active(): boolean {
    return this.t >= this.attack.windup && this.t <= this.attack.windup + this.attack.duration;
  }

  /** Progress of the active window, 0..1 (0 during windup). */
  get progress(): number {
    return Math.max(0, Math.min(1, (this.t - this.attack.windup) / this.attack.duration));
  }

  update(dt: number, ox: number, oy: number, ownerRadius: number, targets: Entity[], onHit: (h: SwingHit) => void): void {
    this.t += dt;
    const a = this.attack;
    const reach = ownerRadius + this.range;
    const dirX = Math.cos(this.angle), dirY = Math.sin(this.angle);
    if (this.active || (a.pattern === 'smash' && this.t >= a.windup && this.hit.size === 0 && !this.smashed)) {
      for (const tgt of targets) {
        if (tgt.dead || this.hit.has(tgt.id)) continue;
        if (this.hits(tgt, ox, oy, ownerRadius, reach, dirX, dirY)) {
          this.hit.add(tgt.id);
          const kx = tgt.x - ox, ky = tgt.y - oy;
          const l = Math.hypot(kx, ky) || 1;
          onHit({ target: tgt, dirX: kx / l, dirY: ky / l });
        }
      }
      if (a.pattern === 'smash') this.smashed = true;
    }
    this.draw(ox, oy, ownerRadius, reach);
    if (this.t > a.windup + a.duration + 0.05) this.done = true;
  }

  private smashed = false;

  private hits(tgt: Entity, ox: number, oy: number, ownerR: number, reach: number, dirX: number, dirY: number): boolean {
    const a = this.attack;
    const vx = tgt.x - ox, vy = tgt.y - oy;
    const d = Math.hypot(vx, vy);
    switch (a.pattern) {
      case 'stab': {
        const len = ownerR + this.range * (0.35 + 0.65 * this.progress);
        const along = vx * dirX + vy * dirY;
        const perp = Math.abs(-vx * dirY + vy * dirX);
        return along > 0 && along < len + tgt.radius && perp < (a.width ?? 0.4) / 2 + tgt.radius;
      }
      case 'smash': {
        const r = this.range / 2 + 0.25;
        const cx = ox + dirX * (ownerR + this.range / 2), cy = oy + dirY * (ownerR + this.range / 2);
        return Math.hypot(tgt.x - cx, tgt.y - cy) < r + tgt.radius;
      }
      case 'arc':
      case 'spin': {
        if (d > reach + tgt.radius) return false;
        const total = a.pattern === 'spin' ? Math.PI * 2 : ((a.arcDegrees ?? 90) * Math.PI) / 180;
        const start = -total / 2;
        const swept = start + total * this.progress;
        const tol = d > 0 ? Math.asin(Math.min(1, tgt.radius / d)) : Math.PI;
        if (a.pattern === 'spin') {
          const rel = (angleDiff(Math.atan2(vy, vx), this.angle) + Math.PI * 3) % (Math.PI * 2);
          return rel <= total * this.progress + tol;
        }
        const rel = angleDiff(Math.atan2(vy, vx), this.angle);
        return rel >= start - tol && rel <= swept + tol;
      }
    }
  }

  private draw(ox: number, oy: number, ownerR: number, reach: number): void {
    const a = this.attack;
    const g = this.gfx.clear();
    const P = TILE_PX;
    const cx = ox * P, cy = oy * P;
    const p = this.progress;
    const windup = this.t < a.windup;
    this.weapon.visible = true;
    switch (a.pattern) {
      case 'arc':
      case 'spin': {
        const total = a.pattern === 'spin' ? Math.PI * 2 : ((a.arcDegrees ?? 90) * Math.PI) / 180;
        const s = this.angle - total / 2;
        const cur = windup ? s : s + total * p;
        if (!windup) {
          g.moveTo(cx, cy).arc(cx, cy, reach * P, Math.max(s, cur - 1.2), cur).lineTo(cx, cy).fill({ color: 0xffffff, alpha: 0.22 });
          g.arc(cx, cy, reach * P, Math.max(s, cur - 1.2), cur).stroke({ color: 0xffffff, alpha: 0.6, width: 1 });
        }
        this.weapon.position.set(cx + Math.cos(cur) * ownerR * P, cy + Math.sin(cur) * ownerR * P);
        this.weapon.rotation = cur + Math.PI / 2;
        break;
      }
      case 'stab': {
        const ext = windup ? 0 : this.range * (0.35 + 0.65 * Math.sin(p * Math.PI * 0.5));
        const tipX = cx + Math.cos(this.angle) * (ownerR + ext) * P, tipY = cy + Math.sin(this.angle) * (ownerR + ext) * P;
        if (!windup) {
          g.moveTo(cx + Math.cos(this.angle) * ownerR * P, cy + Math.sin(this.angle) * ownerR * P).lineTo(tipX, tipY)
            .stroke({ color: 0xffffff, alpha: 0.35, width: (a.width ?? 0.4) * P });
        }
        this.weapon.position.set(tipX, tipY);
        this.weapon.anchor.set(0.5, 0.15);
        this.weapon.rotation = this.angle + Math.PI / 2;
        break;
      }
      case 'smash': {
        const r = (this.range / 2 + 0.25) * P;
        const ix = cx + Math.cos(this.angle) * (ownerR + this.range / 2) * P, iy = cy + Math.sin(this.angle) * (ownerR + this.range / 2) * P;
        const lift = windup ? this.t / a.windup : 1;
        this.weapon.position.set(cx + Math.cos(this.angle) * ownerR * P, cy + Math.sin(this.angle) * ownerR * P);
        this.weapon.rotation = this.angle + Math.PI / 2 - (1 - lift) * 0 - (windup ? 1.2 * lift : -0.3);
        if (!windup) g.circle(ix, iy, r * (0.6 + 0.4 * p)).stroke({ color: 0xffe0a0, alpha: 0.8 * (1 - p), width: 2 }).fill({ color: 0xffffff, alpha: 0.15 * (1 - p) });
        break;
      }
    }
  }
}
