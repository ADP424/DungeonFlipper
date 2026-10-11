import { Container, Graphics, Sprite } from 'pixi.js';
import {
  BARRICADE_TIERS, Stats, TILE_PX, UNARMED_ATTACK, countLeft, footprint, itemDef, pivotIn, registry, structuralWallTarget,
  type AttackDef, type FurniturePlacement, type ItemInstance,
} from '@df/shared';
import { frameKeys, tex } from '../../engine/assets';
import { moveAndCollide } from '../../engine/collision';
import { buildFurnitureView } from '../../render/RoomRenderer';
import { actionFor } from '../actions/tools';
import { MeleeSwing } from '../combat/MeleeSwing';
import type { Game } from '../Game';
import type { Enemy } from './Enemy';
import { Actor } from './Entity';
import { Projectile } from './Projectile';

const REACH = 2.25;
/** What an empty hand swings (art/player/fist.png, drawn pointing up like an item's icon). */
const FIST = 'player/fist';
/** Seconds to break a wall you built by hand (no tool). */
const BREAK_LOW_WALL = 10;
const BREAK_TALL_WALL = 15;

type HandTool = NonNullable<ReturnType<typeof actionFor>>;
type Slot = 'main' | 'off';
/** Work done by holding a hand's button on a tile for `secs`. */
interface HoldJob { key: string; x: number; y: number; secs: number; done: () => void }
const LIFT_HOLD = 0.4;
/** Seconds a weapon is held on a tile to use it as the tool it doubles as. */
const WORK_HOLD = 0.5;
/** Seconds a heavy tool is held on the structural wall between two rooms to knock it through. */
const STRUCTURAL_HOLD = 1.5;
/** Tiles covered per walk frame, so the feet keep pace with the speed. */
const STRIDE = 0.4;
/** Seconds per idle (breathing) frame: a light breath. */
const BREATH_FRAME = 0.8;
/**
 * The player is drawn as a body (art/player/body/<view>/idle/0.png… and walk/0.png…) facing where they
 * walk, and a head on top (art/player/head/<view>.png) facing the mouse. The eight directions (east
 * first, clockwise on screen) use five views drawn facing right; the left side mirrors them.
 */
const VIEWS: [view: string, mirror: boolean][] = [
  ['side', false], ['front_diag', false], ['front', false], ['front_diag', true],
  ['side', true], ['back_diag', true], ['back', false], ['back_diag', false],
];
/**
 * Where each hand is in a body view (px from the player's feet, as drawn facing right), and whether
 * it's on the far side of the body. Held items grip there by their bottom centre: the main item (L
 * slot) in the left hand, the off-hand item (R slot) in the right. Facing left mirrors these and swaps
 * the hands.
 */
type Hand = { x: number; y: number; behind: boolean };
const HANDS: Record<string, { left: Hand; right: Hand }> = {
  front: { left: { x: 3, y: 4, behind: false }, right: { x: -3, y: 4, behind: false } },
  front_diag: { left: { x: 3, y: 4, behind: false }, right: { x: -3, y: 4, behind: false } },
  side: { left: { x: 1.5, y: 3, behind: true }, right: { x: 0.5, y: 4, behind: false } },
  back_diag: { left: { x: -3, y: 4, behind: false }, right: { x: 3, y: 4, behind: false } },
  back: { left: { x: -3, y: 4, behind: false }, right: { x: 3, y: 4, behind: false } },
};
function handOf(view: string, mirror: boolean, side: 'left' | 'right'): Hand {
  const hands = HANDS[view]!;
  if (!mirror) return hands[side];
  const h = hands[side === 'left' ? 'right' : 'left'];
  return { ...h, x: -h.x };
}
/** Draw order inside the player's view: shadow, things behind the body, body, head, things in front. */
const Z = { shadow: -2, behind: -1, body: 0, head: 1, front: 2, carried: 3 };
const dirOf = (angle: number) => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
/** Steps between two of the eight directions (0–4). */
const dirGap = (a: number, b: number) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

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
  /** The job each hand's button is being held on (see `holdJob`), and for how long. */
  private work: Record<Slot, { key: string; t: number } | null> = { main: null, off: null };
  /** The tile of the job each hand last finished without its button coming up since. */
  private finished: Record<Slot, string | null> = { main: null, off: null };
  lastTile = '';
  /** Distance walked since last standing still (drives the walk cycle). */
  private walked = 0;
  /** Seconds since last walking (drives the idle breathing). */
  private stood = 0;
  /** Which way the body faces (0–7, see VIEWS): where they last walked, or the opposite if backwards. */
  private bodyDir = 2;
  /** Walking away from where they look: the walk cycle plays in reverse. */
  private backwards = false;
  readonly head: Sprite;
  /** The head's texture key (its silhouette casts a shadow too). */
  headKey = 'player/head/front';

  constructor(private game: Game) {
    super('player/body/front/idle');
    this.team = 'player';
    this.radius = 0.32;
    this.head = new Sprite(tex(this.headKey));
    this.head.anchor.set(0.5, 0.75);
    this.view.addChildAt(this.head, this.view.getChildIndex(this.sprite) + 1);
    this.shadow.zIndex = Z.shadow;
    this.sprite.zIndex = Z.body;
    this.head.zIndex = Z.head;
    // Items are gripped by their bottom centre.
    this.held = new Sprite();
    this.held.anchor.set(0.5, 1);
    this.offHeld = new Sprite();
    this.offHeld.anchor.set(0.5, 1);
    this.view.addChild(this.held, this.offHeld);
    this.overlay.addChild(this.highlight);
  }

  get state() {
    return this.game.session.player;
  }

  maxRedHalves(): number {
    return Math.max(2, this.state.baseRedMaxHalves + this.stats.get('maxRedHalves'));
  }

  refreshStats(): void {
    const s = this.state;
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
    speed *= g.room.slowAt(this.x, this.y);
    const kn = this.knockStep(dt);
    const res = moveAndCollide(this.x, this.y, this.radius, mv.x * speed * dt + kn.dx, mv.y * speed * dt + kn.dy, g.room.blockerFor('walk', 'player'));
    const moved = Math.hypot(res.x - this.x, res.y - this.y);
    this.walked = (mv.x || mv.y) && moved > 1e-4 ? this.walked + moved : 0;
    this.stood = this.walked ? 0 : this.stood + dt;
    this.x = res.x;
    this.y = res.y;

    // Aim
    const m = g.mouseWorld();
    this.aim = Math.atan2(m.y - this.y, m.x - this.x);
    // The body faces the way they walk, unless that's over 90° from where they look: then it keeps
    // facing the other way and they walk backwards.
    if (mv.x || mv.y) {
      const walkDir = dirOf(Math.atan2(mv.y, mv.x));
      this.backwards = dirGap(dirOf(this.aim), walkDir) > 2;
      this.bodyDir = this.backwards ? (walkDir + 4) % 8 : walkDir;
    }

    // Hazards
    const o = g.room.layout.obstacleAt(Math.floor(this.x), Math.floor(this.y));
    if (o?.hazard && o.hazard.affects.includes(this.movementKind)) g.hurtPlayer(o.hazard.damage, this.x, this.y, true);

    if (!g.uiBlocking) this.handleActions(dt);
    else this.hold = null;

    // Melee swing in progress
    if (this.swing) {
      const s = this.swing;
      // A swing hits enemies, and knocks down what they've thrown that can be.
      const targets = [...g.room.enemies.filter((e) => e.targetable), ...g.room.projectiles.filter((p) => p.team === 'enemy' && p.def.swattable)];
      s.update(dt, this.x, this.y, this.radius, targets, (h) => {
        if (h.target instanceof Projectile) g.swatProjectile(h.target);
        else {
          this.interruptWork();
          g.damageEnemy(h.target as Enemy, s.damage, h.dirX, h.dirY, s.knockback);
        }
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
    // A realtor in their office: click to talk (trade). Attacks that land on them anyway are assaults.
    const realtor = g.realtorUnderCursor();
    if (realtor?.realtorId && Math.hypot(realtor.x - this.x, realtor.y - this.y) < 3) {
      this.highlight.circle(realtor.x * TILE_PX, (realtor.y - 0.2) * TILE_PX, 7).stroke({ color: 0xffd080, width: 1, alpha: 0.9 });
      if (input.primaryPressed) g.ui.openRealtor(realtor.realtorId);
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
    const handHere = actionFor(hb.main);
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

    // Either hand: left click is the main hand, right click the off hand. Tools and rolls act on a tile
    // at a click. Weapons and fists always attack; holding the button on a tile works on it as well.
    this.drawBarricadeHealth();
    this.useHand('main', input.primaryPressed, input.primary, dt);
    this.useHand('off', input.secondaryPressed, input.secondary, dt);
  }

  /**
   * What holding a hand's button on the targeted tile does, if anything. A weapon's tool works that way
   * (its click only ever attacks), and a heavy one knocks through the structural wall between two rooms.
   * The main button also breaks things by hand, slowly, when the item in it can't do better: a barricade
   * (a second per tier), or a wall you built, so nobody can wall themselves in for good.
   */
  private holdJob(slot: Slot, item: ItemInstance | null, tool: HandTool | null): HoldJob | null {
    const g = this.game;
    const main = slot === 'main';
    const wall = main ? this.structuralTarget(item) : null;
    if (wall) return { key: `wall:${wall.x},${wall.y}`, ...wall, secs: STRUCTURAL_HOLD, done: () => g.demolishWall(wall.x, wall.y) };
    if (tool && item) {
      const c = this.toolCheck(tool, item);
      if (c.ok) {
        if (itemDef(item).kind !== 'weapon') return null;
        return { key: `tool:${c.x},${c.y}`, x: c.x, y: c.y, secs: WORK_HOLD, done: () => g.useTool(c.x, c.y, tool, c.cost, slot) };
      }
    }
    if (!main) return null;
    const bw = this.builtWallTarget();
    if (bw) return { key: `bw:${bw.x},${bw.y}`, ...bw, done: () => g.breakBuiltWall(bw.x, bw.y) };
    const bt = this.barricadeTarget();
    return bt ? { key: `barricade:${bt.x},${bt.y}`, x: bt.x, y: bt.y, secs: bt.tier, done: () => g.breakBarricade(bt.x, bt.y) } : null;
  }

  /**
   * Keep a hand's button held on a job's tile until it's done, with a progress fill. Moving on to
   * another tile with the button still down starts the job there; the tile just finished gets no
   * second job until the button has come up.
   */
  private holdTo(slot: Slot, job: HoldJob | null, held: boolean, dt: number): void {
    if (!held) this.finished[slot] = null;
    const before = this.work[slot];
    this.work[slot] = null;
    if (!job) return;
    const tile = `${job.x},${job.y}`;
    let k = 0;
    if (held && this.finished[slot] !== tile) {
      const t = before?.key === job.key ? before.t + dt : 0;
      if (t >= job.secs) {
        this.finished[slot] = tile;
        job.done();
        return;
      }
      this.work[slot] = { key: job.key, t };
      k = t / job.secs;
    }
    this.drawTileOutline(job.x, job.y, { w: 1, h: 1 }, 0xffb040);
    if (k > 0) this.highlight.rect(job.x * TILE_PX + 1, (job.y + 1 - k) * TILE_PX, TILE_PX - 2, k * TILE_PX - 1).fill({ color: 0xffb040, alpha: 0.45 });
  }

  /** Landing a hit on something starts any held work over: fighting next to a wall never takes it down by accident. */
  interruptWork(): void {
    this.work.main = this.work.off = null;
  }

  /**
   * A player-built wall under the cursor, within reach: what it takes to break it by hand (low walls
   * 10 s, tall 15 s). Dungeon walls (template and boundary) never qualify.
   */
  private builtWallTarget(): { x: number; y: number; secs: number } | null {
    const g = this.game;
    const m = g.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > REACH) return null;
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
    if (def.kind !== 'weapon' || !def.tool?.action.params?.structural || countLeft(item) < 1) return null;
    const g = this.game;
    const m = g.mouseWorld();
    const x = Math.floor(m.x), y = Math.floor(m.y);
    if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > REACH || !g.room.layout.isStructural(x, y)) return null;
    const L = g.room.layout.roomAt(x, y);
    return L && structuralWallTarget(g.session.state, L.info, x, y) ? { x, y } : null;
  }

  /** Whether a hand's tool can act on the targeted tile (and why not). */
  private toolCheck(tool: HandTool, item: ItemInstance): { ok: boolean; cost: number; reason?: string; x: number; y: number } {
    const g = this.game;
    const t = this.toolTile();
    const check = tool.action.check(g, t.x, t.y, tool.params, item);
    if (check.ok && check.cost > countLeft(item)) return { ok: false, cost: check.cost, reason: 'Not enough left for that', ...t };
    return { ...check, ...t };
  }

  private useHand(slot: Slot, pressed: boolean, held: boolean, dt: number): void {
    const g = this.game;
    const item = this.state.hotbar[slot];
    const def = item ? itemDef(item) : null;
    const tool = actionFor(item);
    const job = this.holdJob(slot, item, tool);
    this.holdTo(slot, job, held, dt);
    // A weapon attacks and an empty hand punches, whatever else the button is being held for.
    if (!def || def.kind === 'weapon') {
      if (held && this.cd[slot] <= 0) this.attack(def ? def.attack : UNARMED_ATTACK, def ? def.icon : FIST, slot);
      return;
    }
    if (!tool || !item || job) return;
    const c = this.toolCheck(tool, item);
    this.drawTileOutline(c.x, c.y, { w: 1, h: 1 }, c.ok ? 0x80ff80 : 0xff6060);
    // A held tool keeps going as the target moves on, a tile at a time; only the click explains a refusal.
    const tile = `${c.x},${c.y}`;
    const dragged = held && this.runTile[slot] !== null && this.runTile[slot] !== tile;
    if (pressed || dragged) {
      if (c.ok) g.useTool(c.x, c.y, tool, c.cost, slot);
      else if (pressed) g.toast(c.reason ?? "Can't do that");
      this.runTile[slot] = tile;
    }
    if (!held) this.runTile[slot] = null;
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

  /** Attack from a hand: `icon` is what's swung (the weapon's art, or the fist). */
  private attack(a: AttackDef, icon: string, slot: 'main' | 'off'): void {
    const g = this.game;
    const cdMul = this.stats.get('cooldown');
    if (a.type === 'melee') {
      if (this.swing) return;
      this.cd[slot] = a.cooldown * cdMul;
      this.swing = new MeleeSwing(
        a,
        this.aim,
        a.range + this.stats.get('meleeRange'),
        a.damage + this.stats.get('damage'),
        a.knockback * this.stats.get('knockback'),
        icon,
      );
      g.fxLayer.addChild(this.swing.view);
    } else {
      const r = a;
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
    // What you see under the mouse: a tall piece's top counts, over the tile behind it.
    const f = this.game.room.furnitureAtPoint(m.x, m.y) ?? L.furnitureAtTile(mx, my);
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
    // Where it goes: over the tile in front of you but not on you, with its pivot as near that tile's
    // centre as it can be (so turning it swings it around that spot), then reaching away from you.
    const { w, h } = footprint(def, c.rot);
    const f = this.frontTile();
    const pv = pivotIn(def, c.rot);
    const onMe = (x0: number, y0: number) =>
      this.x + this.radius > x0 && this.x - this.radius < x0 + w && this.y + this.radius > y0 && this.y - this.radius < y0 + h;
    let x0 = f.x, y0 = f.y, bestKey: number[] | null = null;
    for (let y = f.y - h + 1; y <= f.y; y++) {
      for (let x = f.x - w + 1; x <= f.x; x++) {
        const key = [onMe(x, y) ? 1 : 0, Math.hypot(x + pv.x - (f.x + 0.5), y + pv.y - (f.y + 0.5)), -Math.hypot(x + w / 2 - this.x, y + h / 2 - this.y)];
        const i = bestKey ? key.findIndex((v, j) => Math.abs(v - bestKey![j]!) > 1e-9) : 0;
        if (!bestKey || (i >= 0 && key[i]! < bestKey[i]!)) [x0, y0, bestKey] = [x, y, key];
      }
    }
    const valid = !onMe(x0, y0) && g.room.layout.canPlaceFurniture(def, x0, y0, c.rot);
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
    for (const s of this.ghost!.children) (s as Sprite).tint = valid ? 0xa0ffa0 : 0xff8080;
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
    // The head looks at the mouse; standing still, the body turns to follow once it looks over 90° away.
    const headDir = dirOf(this.aim);
    if (!this.walked && dirGap(headDir, this.bodyDir) > 2) this.bodyDir = headDir;
    const [bodyView, bodyMirror] = VIEWS[this.bodyDir]!;
    const idle = `player/body/${bodyView}/idle`;
    // Walk cycle: a frame per STRIDE tiles, starting on a step, in reverse order when walking
    // backwards. Standing still breathes, a frame per BREATH_FRAME seconds, starting from rest.
    const walk = frameKeys(`player/body/${bodyView}/walk`), breath = frameKeys(idle);
    const step = Math.floor(this.walked / STRIDE + 1) % walk.length;
    this.setSprite(this.walked > 0
      ? walk[this.backwards ? (walk.length - step) % walk.length : step]!
      : breath[Math.floor(this.stood / BREATH_FRAME) % breath.length]!);
    this.sprite.scale.x = bodyMirror ? -1 : 1;
    const [headView, headMirror] = VIEWS[headDir]!;
    this.headKey = `player/head/${headView}`;
    this.head.texture = tex(this.headKey);
    this.head.scale.x = headMirror ? -1 : 1;
    // Main-hand item, in the left hand, pointing at the mouse (hidden while a swing animates it).
    // It's behind you in your far hand, or pointing away from the camera.
    const main = hb.main ? itemDef(hb.main) : undefined;
    this.held.visible = !!main && !this.swing && !st.carrying;
    if (main) {
      const hand = handOf(bodyView, bodyMirror, 'left');
      this.held.texture = tex(main.icon);
      this.held.position.set(hand.x, hand.y);
      this.held.rotation = this.aim + Math.PI / 2;
      this.held.zIndex = hand.behind || Math.sin(this.aim) < -0.3 ? Z.behind : Z.front;
    }
    // Off-hand item, carried upright in the right hand, leaning away from the body. It's behind you in
    // your far hand, or when you face away.
    const off = hb.off ? itemDef(hb.off) : undefined;
    this.offHeld.visible = !!off && !st.carrying;
    if (off) {
      const hand = handOf(bodyView, bodyMirror, 'right');
      this.offHeld.texture = tex(off.icon);
      const out = hand.x < 0 ? -1 : 1;
      this.offHeld.position.set(hand.x, hand.y);
      this.offHeld.rotation = 0.25 * out;
      this.offHeld.alpha = 0.9;
      this.offHeld.zIndex = hand.behind || bodyView.startsWith('back') ? Z.behind : Z.front;
    }
    // Carried furniture overhead
    const key = st.carrying ? `${st.carrying.defId}:${st.carrying.rot}` : '';
    if (key !== this.carryKey) {
      this.carryView?.destroy({ children: true });
      this.carryView = null;
      this.carryKey = key;
      if (st.carrying) {
        this.carryView = buildFurnitureView(st.carrying.defId, st.carrying.rot);
        this.carryView.zIndex = Z.carried;
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
    this.head.position.set(this.sprite.x, this.sprite.y);
    this.head.tint = this.sprite.tint;
    this.head.alpha = a;
  }
}
