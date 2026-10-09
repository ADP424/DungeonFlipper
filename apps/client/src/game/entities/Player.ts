import { Container, Graphics, Sprite } from 'pixi.js';
import {
  BARRICADE_TIERS, Stats, TILE_PX, countLeft, footprint, itemDef, registry, structuralWallTarget,
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
/** Seconds to break a wall you built by hand (no tool). */
const BREAK_LOW_WALL = 10;
const BREAK_TALL_WALL = 15;

type HandTool = NonNullable<ReturnType<typeof actionFor>>;
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
  /** The tile a held run-laying tool last worked on, per hand (null when not held). */
  private runTile: Record<'main' | 'off', string | null> = { main: null, off: null };
  private hold: { uid: string; t: number } | null = null;
  /** Holding the button on a barricade to tear it down: which door tile, and for how long. */
  private breaking: { key: string; t: number } | null = null;
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
          const f = g.room.layout.findFurniture(this.hold!.uid)?.f;
          this.hold = null;
          if (f) g.liftFurniture(f);
        }
      } else {
        const uid = this.hold.uid;
        this.hold = null;
        g.useFurniture(uid);
      }
      return;
    }
    // Tenants and applicants: click to talk (and haggle).
    const npc = g.npcUnderCursor();
    if (npc && Math.hypot(npc.x - this.x, npc.y - this.y) < 3) {
      this.highlight.circle(npc.x * TILE_PX, (npc.y - 0.2) * TILE_PX, 7).stroke({ color: 0x80c0ff, width: 1, alpha: 0.9 });
      if (input.primaryPressed) g.ui.openTenant(npc.tenantId);
      return;
    }
    // Clicking furniture lifts it, anywhere. With monsters alive in its room and a weapon in hand,
    // clicks go to the weapon instead, so you can still fight next to furniture. Things that share a tile
    // with furniture (flooring, pipe, wire) win when the tool in hand can do something there.
    const armed = !!hb.main && itemDef(hb.main).kind === 'weapon';
    const handHere = this.handTool(hb.main);
    const toolWorksHere = !!handHere && !!hb.main && this.toolCheck(handHere, hb.main).ok;
    if (target && !toolWorksHere && (!armed || g.room.calmAt(target.x, target.y))) {
      const def = registry.furniture.get(target.defId);
      this.drawTileOutline(target.x, target.y, footprint(def, target.rot), 0x80ff80);
      if (input.primaryPressed) {
        if (def.fixed) g.useFurniture(target.uid);
        else if (def.container || def.use) this.hold = { uid: target.uid, t: 0 };
        else g.liftFurniture(target);
      }
      return;
    }

    // Either hand: tools/rolls act on a tile; weapons attack. Left click is the main hand, right click
    // the off hand. Dual-use tools renovate where nothing is alive in the targeted room, and fight otherwise.
    const mainTool = this.handTool(hb.main);
    const offTool = this.handTool(hb.off);

    // A heavy tool on a structural wall between two rooms: hold to knock it through.
    const wall = this.structuralTarget(hb.main);
    if (wall) {
      this.holdTo(`wall:${wall.x},${wall.y}`, wall.x, wall.y, 1.5, input.primary, () => g.demolishWall(wall.x, wall.y), dt);
      this.useHand('off', offTool, input.secondaryPressed, input.secondary);
      return;
    }

    // A wall you built, under the cursor in a quiet room: holding the main button breaks it by hand,
    // slowly, unless the main hand can demolish it properly. Nobody can wall themselves in for good.
    const bw = this.builtWallTarget();
    if (bw && !(mainTool && this.toolCheck(mainTool, hb.main!).ok)) {
      this.holdTo(`bw:${bw.x},${bw.y}`, bw.x, bw.y, bw.secs, input.primary, () => g.breakBuiltWall(bw.x, bw.y), dt);
      this.useHand('off', offTool, input.secondaryPressed, input.secondary);
      return;
    }

    // A barricade under the cursor: holding the main button tears it down (a second per tier), unless
    // the main hand can work on it directly (a kit repairs it, a crowbar pries it off whole).
    this.drawBarricadeHealth();
    const bt = this.barricadeTarget();
    const mainWorksOnIt = !!bt && !!mainTool && this.toolCheck(mainTool, hb.main!).ok;
    if (bt && !mainWorksOnIt) {
      this.holdTo(`${bt.x},${bt.y}`, bt.x, bt.y, bt.tier, input.primary, () => g.breakBarricade(bt.x, bt.y), dt);
    } else {
      this.breaking = null;
      this.useHand('main', mainTool, input.primaryPressed, input.primary);
    }
    this.useHand('off', offTool, input.secondaryPressed, input.secondary);
  }

  /** Hold the main button on a tile for `secs` to do something (tear down, knock through), with a progress fill. */
  private holdTo(key: string, x: number, y: number, secs: number, held: boolean, done: () => void, dt: number): void {
    if (held) {
      this.breaking = this.breaking?.key === key ? { key, t: this.breaking.t + dt } : { key, t: 0 };
      if (this.breaking.t >= secs) {
        this.breaking = null;
        done();
      }
    } else {
      this.breaking = null;
    }
    const k = this.breaking ? this.breaking.t / secs : 0;
    this.drawTileOutline(x, y, { w: 1, h: 1 }, 0xffb040);
    if (k > 0) this.highlight.rect(x * TILE_PX + 1, (y + 1 - k) * TILE_PX, TILE_PX - 2, k * TILE_PX - 1).fill({ color: 0xffb040, alpha: 0.45 });
  }

  /**
   * A player-built wall under the cursor, within reach, in a room with nothing alive: what it takes to
   * break it by hand (low walls 10 s, tall 15 s). Dungeon walls (template and boundary) never qualify.
   */
  private builtWallTarget(): { x: number; y: number; secs: number } | null {
    const g = this.game;
    const m = g.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > REACH || !g.room.calmAt(x, y)) return null;
    const L = g.room.layout.roomAt(x, y);
    const placed = L?.state.tileOverrides[`${x},${y}`];
    if (typeof placed !== 'string') return null;
    const o = registry.obstacles.tryGet(placed);
    if (!o?.isWall) return null;
    return { x, y, secs: o.height === 'short' ? BREAK_LOW_WALL : BREAK_TALL_WALL };
  }

  /** A structural wall under the cursor that the heavy tool in hand may knock through. */
  private structuralTarget(item: ItemInstance | null): { x: number; y: number } | null {
    if (!item) return null;
    const def = itemDef(item);
    if (def.kind !== 'weapon' || !def.tool?.action.params?.structural || countLeft(item) < 2) return null;
    const g = this.game;
    const m = g.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > REACH || !g.room.layout.isStructural(x, y) || !g.room.calmAt(x, y)) return null;
    const L = g.room.layout.roomAt(x, y);
    return L && structuralWallTarget(g.session.state, L.info, x, y) ? { x, y } : null;
  }

  /**
   * The renovation action of an item in hand right now, or null when it fights (or does nothing).
   * Dual-use tools renovate when nothing is alive in the targeted tile's room.
   */
  private handTool(item: ItemInstance | null): HandTool | null {
    const t = this.toolTile();
    return actionFor(item, this.game.room.calmAt(t.x, t.y));
  }

  /** Whether a hand's tool can act on the targeted tile (and why not). */
  private toolCheck(tool: HandTool, item: ItemInstance): { ok: boolean; cost: number; reason?: string; x: number; y: number } {
    const g = this.game;
    const t = this.toolTile();
    const check = tool.action.check(g, t.x, t.y, tool.params, item);
    if (check.ok && check.cost > countLeft(item)) return { ok: false, cost: check.cost, reason: 'Not enough left for that', ...t };
    return { ...check, ...t };
  }

  private useHand(slot: 'main' | 'off', tool: HandTool | null, pressed: boolean, held: boolean): void {
    const g = this.game;
    const item = this.state.hotbar[slot];
    if (!item) return;
    if (tool) {
      const c = this.toolCheck(tool, item);
      this.drawTileOutline(c.x, c.y, { w: 1, h: 1 }, c.ok ? 0x80ff80 : 0xff6060);
      // Tools that lay runs (pipe, wire) keep going while held, a tile at a time; only the click explains a refusal.
      const tile = `${c.x},${c.y}`;
      const dragged = held && !!tool.action.repeat && this.runTile[slot] !== null && this.runTile[slot] !== tile;
      if (pressed || dragged) {
        if (c.ok) g.useTool(c.x, c.y, tool, c.cost, slot);
        else if (pressed) g.toast(c.reason ?? "Can't do that");
        this.runTile[slot] = tile;
      }
      if (!held) this.runTile[slot] = null;
    } else if (itemDef(item).kind === 'weapon' && held && this.cd[slot] <= 0) {
      this.attackWith(item, slot);
    }
  }

  /** Hovering a barricade (at any distance) shows its durability above it. */
  private drawBarricadeHealth(): void {
    const m = this.game.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    const b = this.game.room.layout.barricadeAt(x, y);
    if (!b) return;
    const k = Math.max(0, Math.min(1, b.hp / BARRICADE_TIERS[b.tier]!.hp));
    const px = x * TILE_PX + 1, py = y * TILE_PX - 4, w = TILE_PX - 2;
    this.highlight.rect(px - 0.5, py - 0.5, w + 1, 3).fill({ color: 0x000000, alpha: 0.7 });
    this.highlight.rect(px, py, w * k, 2).fill({ color: k > 0.66 ? 0x7ad05a : k > 0.33 ? 0xe0b040 : 0xe05040 });
  }

  /** A barricade on a door tile under the cursor, within reach. */
  private barricadeTarget(): { x: number; y: number; tier: number } | null {
    const m = this.game.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > REACH) return null;
    const b = this.game.room.layout.barricadeAt(x, y);
    return b ? { x, y, tier: b.tier } : null;
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
    const mx = Math.floor(m.x), my = Math.floor(m.y);
    const f = L.furnitureAtTile(mx, my);
    if (f) {
      const def = registry.furniture.get(f.defId);
      const { w, h } = footprint(def, f.rot);
      const nx = Math.max(f.x, Math.min(this.x, f.x + w)), ny = Math.max(f.y, Math.min(this.y, f.y + h));
      if (Math.hypot(nx - this.x, ny - this.y) <= REACH - 0.5) return f;
    }
    // Pointing at an empty tile within reach means that tile (for the tool in hand), not the
    // furniture in front of you; the front tile only stands in when the cursor is out of reach.
    if (Math.hypot(mx + 0.5 - this.x, my + 0.5 - this.y) <= REACH) return undefined;
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
    const valid = !overlapsMe && g.room.layout.canPlaceFurniture(def, x0, y0, c.rot);
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
      else g.toast("It won't fit there");
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
