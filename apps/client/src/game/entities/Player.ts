import { Container, Graphics, Sprite } from 'pixi.js';
import {
  Stats, TILE_PX, countLeft, footprint, itemDef, registry,
  type FurniturePlacement, type ItemInstance, type MeleeAttackDef, type RangedAttackDef,
} from '@df/shared';
import { tex } from '../../engine/assets';
import { moveAndCollide } from '../../engine/collision';
import { buildFurnitureView } from '../../render/RoomRenderer';
import { actionFor } from '../actions/tools';
import { MeleeSwing } from '../combat/MeleeSwing';
import type { Game } from '../Game';
import { Actor } from './Entity';

const REACH = 2.25;
const LIFT_HOLD = 0.4;

export class Player extends Actor {
  readonly stats = new Stats();
  aim = 0;
  iframes = 0;
  private cd = { main: 0, off: 0 };
  swing: MeleeSwing | null = null;
  private held: Sprite;
  private offHeld: Sprite;
  private carryView: Container | null = null;
  private carryKey = '';
  /** Ghost preview and target highlight, drawn above the lighting. */
  readonly overlay = new Container();
  private highlight = new Graphics();
  private ghost: Container | null = null;
  private ghostKey = '';
  ghostSpot: { x: number; y: number; valid: boolean } | null = null;
  private hold: { uid: string; t: number } | null = null;
  lastTile = '';

  constructor(private game: Game) {
    super('td:98');
    this.team = 'player';
    this.radius = 0.32;
    this.held = new Sprite();
    this.held.anchor.set(0.5, 0.85);
    this.offHeld = new Sprite();
    this.offHeld.anchor.set(0.5);
    this.view.addChild(this.held, this.offHeld);
    this.overlay.addChild(this.highlight);
    this.light = { radius: 5, color: 0xffe2b0, intensity: 0.9, flicker: 0.05 };
  }

  get state() {
    return this.game.session.player;
  }

  maxRedHalves(): number {
    return Math.max(2, this.state.baseRedMaxHalves + this.stats.get('maxRedHalves'));
  }

  refreshStats(): void {
    const s = this.state;
    s.passives.forEach((id, i) => {
      const d = registry.items.tryGet(id);
      this.stats.set(`passive:${i}`, d?.kind === 'passive' ? d.mods : undefined);
    });
    for (let i = s.passives.length; i < 64; i++) this.stats.clear(`passive:${i}`);
    const armor = s.hotbar.armor ? itemDef(s.hotbar.armor) : undefined;
    this.stats.set('armor', armor?.kind === 'armor' ? armor.mods : undefined);
  }

  update(dt: number): void {
    const g = this.game;
    const input = g.input;
    this.refreshStats();
    this.flash = Math.max(0, this.flash - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.cd.main -= dt;
    this.cd.off -= dt;

    // Movement
    const mv = input.moveVector();
    let speed = this.stats.get('moveSpeed');
    if (this.state.carrying) speed *= 0.75;
    const kn = this.knockStep(dt);
    const res = moveAndCollide(this.x, this.y, this.radius, mv.x * speed * dt + kn.dx, mv.y * speed * dt + kn.dy, g.room.blockerFor('walk', 'player'));
    this.x = res.x;
    this.y = res.y;

    // Aim
    const m = g.mouseWorld();
    this.aim = Math.atan2(m.y - this.y, m.x - this.x);

    // Hazards
    const o = g.room.layout.obstacleAt(Math.floor(this.x), Math.floor(this.y));
    if (o?.hazard && o.hazard.affects.includes(this.movementKind)) g.hurtPlayer(o.hazard.damage, this.x, this.y, true);

    if (!g.uiBlocking) this.handleActions(dt);
    else this.hold = null;

    // Melee swing in progress
    if (this.swing) {
      const s = this.swing;
      s.update(dt, this.x, this.y, this.radius, g.room.enemies, (h) => {
        const e = h.target as import('./Enemy').Enemy;
        g.damageEnemy(e, s.damage, h.dirX, h.dirY, s.knockback);
      });
      if (s.done) {
        s.view.destroy({ children: true });
        this.swing = null;
      }
    }
    this.updateVisuals(dt);
  }

  private handleActions(dt: number): void {
    const g = this.game;
    const input = g.input;
    const st = this.state;
    const hb = st.hotbar;

    this.ghostSpot = null;
    this.highlight.clear();

    if (st.carrying) {
      this.updateCarry(input.wheel, input.primaryPressed);
      return;
    }
    if (input.wheel !== 0) g.cycleMainHand(input.wheel > 0 ? 1 : -1);

    // Furniture under the cursor (within reach) or in front of us.
    const target = this.furnitureTarget();
    if (this.hold) {
      if (input.primary) {
        this.hold.t += dt;
        if (this.hold.t >= LIFT_HOLD) {
          const f = g.room.layout.state.furniture.find((x) => x.uid === this.hold!.uid);
          this.hold = null;
          if (f) g.liftFurniture(f);
        }
      } else {
        const uid = this.hold.uid;
        this.hold = null;
        g.openStorage(uid);
      }
      return;
    }
    // In owned rooms, clicking furniture lifts it (whatever is in your hands); in uncleared
    // rooms clicks fall through to your weapon so you can still fight next to dropped furniture.
    if (target && g.room.owned) {
      const def = registry.furniture.get(target.defId);
      this.drawTileOutline(target.x, target.y, footprint(def, target.rot), 0x80ff80);
      if (input.primaryPressed) {
        if (def.container) this.hold = { uid: target.uid, t: 0 };
        else g.liftFurniture(target);
      }
      return;
    }

    // Main hand: tools/rolls act on a tile; weapons attack.
    const tool = actionFor(hb.main);
    if (tool && hb.main) {
      const t = this.toolTile();
      const check = g.room.owned ? tool.action.check(g, t.x, t.y, tool.params, hb.main) : { ok: false, cost: 0, reason: 'You can only renovate rooms you own' };
      const enough = check.cost <= countLeft(hb.main);
      this.drawTileOutline(t.x, t.y, { w: 1, h: 1 }, check.ok && enough ? 0x80ff80 : 0xff6060);
      if (input.primaryPressed) {
        if (!check.ok) g.toast(check.reason ?? "Can't do that");
        else if (!enough) g.toast('Not enough left for that');
        else g.useTool(t.x, t.y, tool, check.cost);
      }
    } else if (hb.main && input.primary && this.cd.main <= 0) {
      this.attackWith(hb.main, 'main');
    }
    const offDef = hb.off ? itemDef(hb.off) : undefined;
    if (hb.off && offDef?.kind === 'weapon' && input.secondary && this.cd.off <= 0) this.attackWith(hb.off, 'off');
  }

  private attackWith(item: ItemInstance, slot: 'main' | 'off'): void {
    const def = itemDef(item);
    if (def.kind !== 'weapon') return;
    const g = this.game;
    const a = def.attack;
    const cdMul = this.stats.get('cooldown');
    if (a.type === 'melee') {
      if (this.swing) return;
      this.cd[slot] = a.cooldown * cdMul;
      this.swing = new MeleeSwing(
        a as MeleeAttackDef,
        this.aim,
        a.range + this.stats.get('meleeRange'),
        a.damage + this.stats.get('damage'),
        a.knockback * this.stats.get('knockback'),
        def.icon,
      );
      g.fxLayer.addChild(this.swing.view);
    } else {
      const r = a as RangedAttackDef;
      this.cd[slot] = r.cooldown * cdMul;
      const pdef = registry.projectiles.get(r.projectile);
      const count = (r.count ?? 1) + Math.round(this.stats.get('extraProjectiles'));
      const fan = (12 * Math.PI) / 180;
      const m = g.mouseWorld();
      for (let i = 0; i < count; i++) {
        let ang = this.aim + (i - (count - 1) / 2) * fan;
        if (count === 1 && r.spread) ang += ((Math.random() - 0.5) * r.spread * Math.PI) / 180;
        const reachMax = pdef.speed * this.stats.get('projectileSpeed') * pdef.lifetime;
        const md = Math.min(reachMax, Math.hypot(m.x - this.x, m.y - this.y));
        g.spawnProjectile({
          def: pdef, team: 'player',
          x: this.x + Math.cos(ang) * 0.3, y: this.y + Math.sin(ang) * 0.3 - 0.1,
          dx: Math.cos(ang), dy: Math.sin(ang),
          damage: r.damage + this.stats.get('damage'),
          knockback: (r.knockback ?? 2) * this.stats.get('knockback'),
          speedMul: this.stats.get('projectileSpeed'),
          targetX: this.x + Math.cos(ang) * md, targetY: this.y + Math.sin(ang) * md,
        });
      }
    }
  }

  /** The tile directly in front of the player toward the mouse. */
  frontTile(): { x: number; y: number } {
    return { x: Math.floor(this.x + Math.cos(this.aim) * 1.0), y: Math.floor(this.y + Math.sin(this.aim) * 1.0) };
  }

  /** Target tile for tools: the cursor tile when within reach, else the tile in front. */
  toolTile(): { x: number; y: number } {
    const m = this.game.mouseWorld();
    const tx = Math.floor(m.x), ty = Math.floor(m.y);
    if (Math.hypot(tx + 0.5 - this.x, ty + 0.5 - this.y) <= REACH) return { x: tx, y: ty };
    return this.frontTile();
  }

  private furnitureTarget(): FurniturePlacement | undefined {
    const L = this.game.room.layout;
    const m = this.game.mouseWorld();
    const f = L.furnitureAtTile(Math.floor(m.x), Math.floor(m.y));
    if (f) {
      const def = registry.furniture.get(f.defId);
      const { w, h } = footprint(def, f.rot);
      const nx = Math.max(f.x, Math.min(this.x, f.x + w)), ny = Math.max(f.y, Math.min(this.y, f.y + h));
      if (Math.hypot(nx - this.x, ny - this.y) <= REACH - 0.5) return f;
    }
    const t = this.frontTile();
    return L.furnitureAtTile(t.x, t.y);
  }

  private updateCarry(wheel: number, place: boolean): void {
    const g = this.game;
    const c = this.state.carrying!;
    const def = registry.furniture.get(c.defId);
    if (wheel !== 0 && def.rotatable) {
      c.rot = (c.rot + (wheel > 0 ? 1 : 3)) % 4;
    }
    const { w, h } = footprint(def, c.rot);
    const f = this.frontTile();
    const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
    let x0: number, y0: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
      x0 = dx > 0 ? f.x : f.x - w + 1;
      y0 = f.y - Math.floor((h - 1) / 2);
    } else {
      y0 = dy > 0 ? f.y : f.y - h + 1;
      x0 = f.x - Math.floor((w - 1) / 2);
    }
    // Don't drop it on our own feet.
    const overlapsMe = this.x + this.radius > x0 && this.x - this.radius < x0 + w && this.y + this.radius > y0 && this.y - this.radius < y0 + h;
    const valid = g.room.owned && !overlapsMe && g.room.layout.canPlaceFurniture(def, x0, y0, c.rot);
    this.ghostSpot = { x: x0, y: y0, valid };
    const key = `${c.defId}:${c.rot}`;
    if (this.ghostKey !== key) {
      this.ghost?.destroy({ children: true });
      this.ghost = buildFurnitureView(c.defId, c.rot);
      this.ghost.alpha = 0.6;
      this.overlay.addChild(this.ghost);
      this.ghostKey = key;
    }
    this.ghost!.visible = true;
    this.ghost!.position.set((x0 + w / 2) * TILE_PX, (y0 + h / 2) * TILE_PX);
    (this.ghost!.children[0] as Container).children.forEach((s) => ((s as Sprite).tint = valid ? 0xa0ffa0 : 0xff8080));
    this.drawTileOutline(x0, y0, { w, h }, valid ? 0x80ff80 : 0xff6060);
    if (place) {
      if (valid) g.placeCarried(x0, y0);
      else g.toast(g.room.owned ? "It won't fit there" : 'You can only furnish rooms you own');
    }
  }

  private drawTileOutline(x: number, y: number, size: { w: number; h: number }, color: number): void {
    this.highlight.rect(x * TILE_PX + 0.5, y * TILE_PX + 0.5, size.w * TILE_PX - 1, size.h * TILE_PX - 1).stroke({ color, width: 1, alpha: 0.9 });
  }

  private updateVisuals(_dt: number): void {
    const st = this.state;
    const hb = st.hotbar;
    // Facing
    const faceLeft = Math.cos(this.aim) < 0;
    this.sprite.scale.x = faceLeft ? -1 : 1;
    // Held main-hand item (hidden while a swing animates it)
    const main = hb.main ? itemDef(hb.main) : undefined;
    this.held.visible = !!main && !this.swing && !st.carrying;
    if (main) {
      this.held.texture = tex(main.icon);
      this.held.position.set(Math.cos(this.aim) * 5, Math.sin(this.aim) * 5 - 2);
      this.held.rotation = this.aim + Math.PI / 2;
      this.held.scale.set(0.8);
    }
    // Off-hand weapon, carried at the side
    const off = hb.off ? itemDef(hb.off) : undefined;
    this.offHeld.visible = !!off && !st.carrying;
    if (off) {
      this.offHeld.texture = tex(off.icon);
      this.offHeld.position.set(faceLeft ? 4 : -4, -1);
      this.offHeld.scale.set(0.6);
      this.offHeld.alpha = 0.9;
      this.offHeld.zIndex = Math.sin(this.aim) < 0 ? -1 : 1;
    }
    // Carried furniture overhead
    const key = st.carrying ? `${st.carrying.defId}:${st.carrying.rot}` : '';
    if (key !== this.carryKey) {
      this.carryView?.destroy({ children: true });
      this.carryView = null;
      this.carryKey = key;
      if (st.carrying) {
        this.carryView = buildFurnitureView(st.carrying.defId, st.carrying.rot);
        this.carryView.scale.set(0.8);
        this.view.addChild(this.carryView);
      }
    }
    if (this.carryView) this.carryView.position.set(0, -22);
    if (!st.carrying && this.ghost) {
      this.ghost.destroy({ children: true });
      this.ghost = null;
      this.ghostKey = '';
    }
    this.sprite.alpha = this.iframes > 0 && Math.floor(this.iframes * 12) % 2 === 0 ? 0.4 : 1;
  }

  override syncView(): void {
    const a = this.sprite.alpha;
    super.syncView();
    this.sprite.alpha = a;
  }
}
