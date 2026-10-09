import { Application, Container, Graphics, Text, Sprite } from 'pixi.js';
import {
  AWAY_SLEEP_HEAL_FRACTION, CELL_H, CELL_W, HealthStack, MIDNIGHT_MINUTE, CLOCK_STEP, MINUTES_PER_SECOND, PASS_OUT_MINUTE, Rng,
  TILE_PX, addToHotbar, advanceClock, canHold, countLeft, createItem, entryPoint, expandRoom, footprint,
  APARTMENT_FLOOR, BARRICADE_TIERS, RoomLayout, barricadeKit, areaRooms, formatTime, partnerDoor, securityNeeds, generateFloor, getClock,
  getInbox, registerAllResolvers, UTILITY_KINDS, fixtureSupplied, utilityNets, type UtilityKind, type UtilityNets, stairsDownRooms, structuralWallTarget, findSign, getTenants, unitAt,
  type Barricade, isOwned, isOwnedBy, isSecure, itemDef, registry, rollLoot, tileKey, uid, wakeTime,
  type Command, type FurniturePlacement, type HealthLayer, type Hotbar, type ItemInstance, type LightDef,
  type MonsterRecord, type PhoneMessage, type Tenant,
} from '@df/shared';
import { Input } from '../engine/input';
import { Lighting, type LightInstance } from '../render/Lighting';
import { ACTOR_HEIGHT, ShadowMaps, type ShadowBlob } from '../render/Shadows';
import { effects } from './actions/effects';
import { furnitureUses } from './actions/furnitureUses';
import type { ToolAction } from './actions/tools';
import { triggers } from './actions/triggers';
import { Enemy } from './entities/Enemy';
import { GroundItemEntity } from './entities/GroundItemEntity';
import { Player } from './entities/Player';
import { TenantNpc } from './entities/TenantNpc';
import { Projectile, type ProjectileInit } from './entities/Projectile';
import { AreaRuntime } from './AreaRuntime';
import type { Session } from './Session';
import { Ui } from '../ui/Ui';
import { settings } from '../settings';

const STEP = 1 / 60;
const AMBIENT_DUNGEON = 0x3a3644;
const AMBIENT_OWNED = 0x5a5250;
/** Seconds to fade out before the night is resolved, then to hold the dark screen before waking. */
const SLEEP_FADE = 0.9;
const SLEEP_HOLD = 1.2;

/** A monster spawning closer than this to the player is moved away... */
const SPAWN_CLEARANCE = 4;
/** ...to open floor at least this far from them. */
const SPAWN_AWAY = 7;

interface Fx { view: Container; life: number; update(dt: number): void }

/** How the player fell asleep: in a bed, on the floor (phone), forced at midnight, or passed out at 2 AM. */
type SleepKind = 'bed' | 'floor' | 'collapse' | 'passOut';
interface SleepState { kind: SleepKind; homeBed: boolean; t: number; applied: boolean }

export class Game {
  readonly input: Input;
  readonly world = new Container();
  readonly floorLayer = new Container();
  readonly wallLayer = new Container();
  readonly entityLayer = new Container();
  readonly fxLayer = new Container();
  /** World-space overlays drawn above the darkness (previews, damage numbers). */
  readonly overWorld = new Container();
  readonly lighting: Lighting;
  readonly ui: Ui;
  readonly player: Player;
  /** The area the player is in: one dungeon room, or the whole estate (all your connected rooms). */
  room!: AreaRuntime;
  /** Room boundaries overlay (phone toggle): the true cells of each room in the estate. */
  private readonly boundaries = new Graphics();
  showBoundaries = false;
  rng = new Rng(Date.now() >>> 0);
  scale = 1;
  cam = { x: 0, y: 0 };
  private shakeT = 0;
  private fx: Fx[] = [];
  private acc = 0;
  private dying = 0;
  private sleeping: SleepState | null = null;
  /** Game minutes run but not yet committed to the clock (it's saved in CLOCK_STEP steps). */
  private clockAcc = 0;
  /** Utility networks of the current floor, cached per world change. */
  private nets: UtilityNets | null = null;
  private netsKey = '';
  /** Pipe / wire x-ray (over the lighting) and fault symptoms (puddles, sparks; under it). */
  private readonly xray = new Graphics();
  private readonly symptoms = new Graphics();
  private xrayKey = '';
  /** The crack fires on contact once you've been away from it (see `checkPortal`). */
  private portalArmed = true;
  /** The room you came from through the last door: kept quiet (see `quietRooms`). */
  private prevRoomId: string | null = null;
  /** The "barricade N doors" banner was shown for the current cleared room. */
  private clearNoted = false;
  private toastCd = new Map<string, number>();
  private staticLights: LightInstance[] = [];
  private readonly shadows = new ShadowMaps();
  time = 0;

  constructor(readonly app: Application, readonly session: Session) {
    registerAllResolvers();
    this.input = new Input(app.canvas);
    this.entityLayer.sortableChildren = true;
    this.world.addChild(this.floorLayer, this.symptoms, this.wallLayer, this.entityLayer, this.fxLayer);
    this.lighting = new Lighting(app.screen.width, app.screen.height);
    app.stage.addChild(this.world, this.lighting.overlay, this.overWorld);
    this.player = new Player(this);
    this.player.view.sortableChildren = true;
    this.overWorld.addChild(this.xray, this.player.overlay, this.boundaries);
    this.ui = new Ui(this);
    this.resize();

    const p = session.player;
    this.player.x = p.x;
    this.player.y = p.y;
    this.loadRoom(p.roomId, false);
    this.checkCurfew();
    // A brand-new world starts with the intro thread waiting on the phone.
    if (getInbox(session.state, session.playerId).messages.some((m) => m.id.startsWith('intro-')) && getInbox(session.state, session.playerId).unread > 0) {
      this.ui.openPhone('messages');
    }
    app.ticker.add((t) => this.frame(Math.min(0.1, t.deltaMS / 1000)));
  }

  get uiBlocking(): boolean {
    return this.ui.blocking;
  }

  get floorIndex(): number {
    return this.session.player.floor;
  }

  dispatch(cmd: Command): void {
    this.session.dispatch(cmd);
  }

  // ───────────────────────────── frame / camera ─────────────────────────────

  private screenW = 0;
  private screenH = 0;

  /**
   * Called every frame: Pixi applies `resizeTo` changes a frame after the window's resize event,
   * so polling the actual screen size is the only reliable way to stay in sync.
   */
  private resize(): void {
    const w = this.app.screen.width, h = this.app.screen.height;
    if (w === this.screenW && h === this.screenH) return;
    this.screenW = w;
    this.screenH = h;
    // Fit one cell (the default room) to the screen, keeping it clear of the right-hand hotbar
    // (mirrored on the left so the room stays centred). The HUD scales with `--u` (styles.css).
    const u = Math.min(window.innerHeight, window.innerWidth * 0.5625) / 720;
    const hudMargin = 84 * u;
    this.scale = Math.max(1, Math.min((w - 2 * hudMargin) / (CELL_W * TILE_PX), h / (CELL_H * TILE_PX)));
    this.lighting.resize(w / this.scale, h / this.scale);
  }

  mouseWorld(): { x: number; y: number } {
    return {
      x: (this.input.mouseX / this.scale + this.cam.x) / TILE_PX,
      y: (this.input.mouseY / this.scale + this.cam.y) / TILE_PX,
    };
  }

  private frame(dt: number): void {
    if (this.ui.paused) {
      // Paused: nothing simulates and no input reaches the game, but the frozen frame still draws
      // (and follows window resizes).
      this.input.endFrame();
      this.render(0);
      return;
    }
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.update(STEP);
      this.input.endFrame();
    }
    this.render(dt);
  }

  private updateCamera(): void {
    const viewW = this.app.screen.width / this.scale, viewH = this.app.screen.height / this.scale;
    const b = this.room.layout.fullBounds();
    const rx = b.x * TILE_PX, ry = b.y * TILE_PX, rw = b.w * TILE_PX, rh = b.h * TILE_PX;
    const px = this.player.x * TILE_PX, py = this.player.y * TILE_PX;
    this.cam.x = rw <= viewW ? rx + rw / 2 - viewW / 2 : Math.max(rx, Math.min(rx + rw - viewW, px - viewW / 2));
    this.cam.y = rh <= viewH ? ry + rh / 2 - viewH / 2 : Math.max(ry, Math.min(ry + rh - viewH, py - viewH / 2));
  }

  private render(dt: number): void {
    this.resize();
    this.updateCamera();
    this.updateStreaming();
    let sx = 0, sy = 0;
    if (this.shakeT > 0 && settings.screenShake) {
      sx = (Math.random() - 0.5) * 6 * this.shakeT;
      sy = (Math.random() - 0.5) * 6 * this.shakeT;
    }
    for (const c of [this.world, this.overWorld]) {
      c.scale.set(this.scale);
      c.position.set(Math.round((-this.cam.x + sx) * this.scale), Math.round((-this.cam.y + sy) * this.scale));
    }
    this.player.syncView();
    this.drawUtilities();
    for (const e of this.room.enemies) e.syncView();
    for (const p of this.room.projectiles) p.syncView();
    for (const i of this.room.items) i.syncView();
    for (const n of this.room.npcs) n.syncView();
    this.lighting.render(
      this.app.renderer, this.cam.x - sx, this.cam.y - sy, this.scale, this.collectLights(),
      this.room.owned ? AMBIENT_OWNED : AMBIENT_DUNGEON, dt, this.shadows, this.shadowBlobs(),
    );
    this.ui.update();
  }

  private collectLights(): LightInstance[] {
    const out: LightInstance[] = [...this.staticLights];
    const add = (x: number, y: number, def: LightDef | undefined, seed?: number) => def && out.push({ x, y, def, seed });
    add(this.player.x, this.player.y, this.player.light, 1);
    const main = this.session.player.hotbar.main;
    if (main) {
      const d = itemDef(main);
      if (d.kind === 'weapon') add(this.player.x, this.player.y, d.light);
    }
    for (const e of this.room.enemies) if (e.alpha > 0.2) add(e.x, e.y, e.light, e.id);
    for (const p of this.room.projectiles) add(p.x, p.y - p.z, p.light, p.id);
    for (const f of this.room.layout.furniture()) {
      const def = registry.furniture.get(f.defId);
      if (def.light && this.supplied(f)) add(f.x + footprint(def, f.rot).w / 2, f.y + 0.4, def.light, f.x * 31 + f.y);
    }
    return out;
  }

  /** Moving things that cast shadows: the player and visible enemies. */
  private shadowBlobs(): ShadowBlob[] {
    const out: ShadowBlob[] = [];
    const shape = (a: { spriteKey: string; sprite: Sprite }) => ({ key: a.spriteKey, dy: a.sprite.y, sx: a.sprite.scale.x, sy: a.sprite.scale.y });
    if (this.player.view.visible) out.push({ x: this.player.x, y: this.player.y, r: this.player.radius, h: ACTOR_HEIGHT, ...shape(this.player) });
    for (const e of this.room.enemies) {
      if (!e.dead && e.alpha > 0.2) out.push({ x: e.x, y: e.y, r: e.radius, h: ACTOR_HEIGHT * (e.def.scale ?? 1), ...shape(e) });
    }
    for (const n of this.room.npcs) out.push({ x: n.x, y: n.y, r: n.radius, h: ACTOR_HEIGHT, ...shape(n) });
    return out;
  }

  /** Lights and shadow geometry that only change when the room's tiles or furniture do. */
  private rebuildStaticLights(): void {
    this.shadows.rebuild(this.room.layout, this.app.renderer);
    this.staticLights = [];
    for (const t of this.room.layout.tiles()) {
      const o = this.room.layout.obstacleAt(t.x, t.y);
      if (o?.light) this.staticLights.push({ x: t.x + 0.5, y: t.y + 0.4, def: o.light, seed: t.x * 17 + t.y });
    }
  }

  // ───────────────────────────── simulation ─────────────────────────────

  private update(dt: number): void {
    this.time += dt;
    this.shakeT = Math.max(0, this.shakeT - dt * 2);
    for (const [k, v] of this.toastCd) this.toastCd.set(k, v - dt);
    this.devKeys();

    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) this.respawn();
      this.updateFx(dt);
      return;
    }
    if (this.sleeping) {
      this.updateSleep(dt);
      this.updateFx(dt);
      return;
    }

    this.runClock(dt);
    if (this.sleeping) return;
    const room = this.room;
    room.player = this.player;
    room.updateFlow(dt);
    this.player.update(dt);
    this.noticePlanks();
    this.trackRooms();

    for (const e of room.enemies) if (!e.dead) e.update(this, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateItems(dt);
    this.updateNpcs(dt);
    this.updateFx(dt);
    this.cleanup();
    this.checkRoomClear();
    this.checkPortal();
    this.checkTransitions();
  }

  /**
   * The crack takes you through the moment you walk into it, like stairs, carrying whatever you hold.
   * You arrive a step away from the other end, and it only takes you back once you've stepped away
   * from it, so holding a direction doesn't bounce you between the two ends.
   */
  private checkPortal(): void {
    const mv = this.input.moveVector();
    const pl = this.player;
    let near = Infinity;
    for (const f of this.room.layout.furniture()) {
      if (f.defId !== 'portal') continue;
      const { w, h } = footprint(registry.furniture.get(f.defId), f.rot);
      const cx = Math.max(f.x, Math.min(f.x + w, pl.x)), cy = Math.max(f.y, Math.min(f.y + h, pl.y));
      const dx = cx - pl.x, dy = cy - pl.y;
      const d = Math.hypot(dx, dy);
      near = Math.min(near, d);
      if (!this.portalArmed || d > pl.radius + 0.08 || dx * mv.x + dy * mv.y <= 0) continue;
      this.portalArmed = false;
      this.usePortal();
      return;
    }
    if (near > pl.radius + 0.6) this.portalArmed = true;
  }

  /** Walking into a plank barricade: explain how to get through. */
  private noticePlanks(): void {
    const mv = this.input.moveVector();
    if (!mv.x && !mv.y) return;
    const tx = Math.floor(this.player.x + mv.x * 0.8), ty = Math.floor(this.player.y + mv.y * 0.8);
    if (this.room.layout.barricadeAt(tx, ty)?.tier === 1) this.toast('Boarded up. Pry the planks off with a crowbar to get through.', 'planks');
  }

  private separateEnemies(): void {
    const es = this.room.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i]!, b = es[j]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d > 0 && d < min) {
          const push = (min - d) / 2 * 0.5;
          const blockedA = this.room.blockerFor(a.movementKind, 'enemy');
          const blockedB = this.room.blockerFor(b.movementKind, 'enemy');
          const ax = a.x - (dx / d) * push, ay = a.y - (dy / d) * push;
          const bx = b.x + (dx / d) * push, by = b.y + (dy / d) * push;
          if (!blockedA(Math.floor(ax), Math.floor(ay))) { a.x = ax; a.y = ay; }
          if (!blockedB(Math.floor(bx), Math.floor(by))) { b.x = bx; b.y = by; }
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.room.projectiles) {
      if (p.dead) continue;
      p.age += dt;
      if (p.lob) {
        const t = Math.min(1, p.age / p.lob.dur);
        p.x = p.lob.sx + (p.lob.tx - p.lob.sx) * t;
        p.y = p.lob.sy + (p.lob.ty - p.lob.sy) * t;
        p.z = Math.sin(t * Math.PI) * (p.def.lobHeight ?? 1.5);
        if (this.room.projectileBlocked(p.x, p.y, 'lobbed')) { this.impact(p); continue; }
        if (t >= 1) this.impact(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age > p.def.lifetime || this.room.projectileBlocked(p.x, p.y, 'straight')) {
        this.impact(p);
        continue;
      }
      this.projectileHits(p);
    }
  }

  private projectileHits(p: Projectile): void {
    if (p.team === 'player') {
      for (const e of this.room.enemies) {
        if (e.dead || p.hit.has(e.id) || e.alpha < 0.5) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius) {
          p.hit.add(e.id);
          if (p.def.splash) { this.impact(p); return; }
          const l = Math.hypot(p.vx, p.vy) || 1;
          this.damageEnemy(e, p.damage, p.vx / l, p.vy / l, p.knockback);
          if (p.pierceLeft-- <= 0) { this.impact(p, true); return; }
        }
      }
    } else if (p.team === 'enemy') {
      const pl = this.player;
      if (Math.hypot(pl.x - p.x, pl.y - p.y) < pl.radius + p.radius) {
        const r = this.hurtPlayer(p.damage, p.x - p.vx, p.y - p.vy);
        if (r !== 'ignored') this.impact(p, true);
      }
    }
  }

  /** Projectile ends: splash damage if it has any, then a small burst. */
  private impact(p: Projectile, quiet = false): void {
    p.dead = true;
    const splash = p.def.splash;
    if (splash) {
      if (p.team === 'player') {
        for (const e of this.room.enemies) {
          if (e.dead || e.alpha < 0.5) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < splash + e.radius) this.damageEnemy(e, p.damage, (e.x - p.x) / (d || 1), (e.y - p.y) / (d || 1), p.knockback);
        }
      } else if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < splash + this.player.radius) {
        this.hurtPlayer(p.damage, p.x, p.y);
      }
      this.ring(p.x, p.y, splash, p.def.light?.color ?? 0x80c060);
    }
    if (!quiet || splash) this.burst(p.x, p.y, p.def.light?.color ?? 0xd0d0d0, splash ? 10 : 4);
  }

  private updateItems(dt: number): void {
    const pl = this.player;
    for (const it of this.room.items) {
      it.update(dt);
      if (it.dead || !it.settled) continue;
      const d = Math.hypot(it.x - pl.x, it.y - pl.y);
      if (it.requiresExit) {
        if (d > 1.1) it.requiresExit = false;
        continue;
      }
      if (d < pl.radius + it.radius) this.tryPickup(it);
    }
  }

  private tryPickup(it: GroundItemEntity): void {
    const inst = it.data.item;
    const def = itemDef(inst);
    if (def.kind === 'pickup') {
      const fx = effects[def.effect.id];
      if (!fx || !fx(this, def.effect.params ?? {}, inst)) return;
      this.removeGroundItem(it);
      if (def.id === 'cash') this.floatText(it.x, it.y, `+${inst.data.amount ?? 1}`, 0xffd34a);
      return;
    }
    if (def.kind === 'passive') {
      const passives = [...this.session.player.passives, def.id];
      this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { passives } });
      this.player.refreshStats();
      for (const ef of def.effects ?? []) effects[ef.id]?.(this, ef.params ?? {}, inst);
      this.removeGroundItem(it);
      this.ui.announce(def.name, def.description);
      return;
    }
    const hb = structuredClone(this.session.player.hotbar);
    const rest = structuredClone(inst);
    const before = countLeft(rest);
    if (!addToHotbar(hb, rest)) {
      this.toast('Your hotbar is full', 'full');
      it.requiresExit = true;
      // Stacks may still have absorbed part of it: leave the remainder on the ground.
      if (countLeft(rest) < before) {
        this.setHotbar(hb);
        it.data.item = rest;
        this.dispatch({ type: 'groundItemAdded', roomId: it.roomId, item: structuredClone(it.data) });
      }
      return;
    }
    this.setHotbar(hb);
    this.removeGroundItem(it);
    this.toast(`Picked up ${def.name}`);
  }

  private removeGroundItem(it: GroundItemEntity): void {
    it.dead = true;
    this.dispatch({ type: 'groundItemRemoved', roomId: it.roomId, uid: it.data.uid });
  }

  private updateFx(dt: number): void {
    for (const f of this.fx) {
      f.life -= dt;
      if (!f.view.destroyed) f.update(dt);
    }
    this.fx = this.fx.filter((f) => {
      if (f.life > 0 && !f.view.destroyed) return true;
      if (!f.view.destroyed) f.view.destroy({ children: true });
      return false;
    });
  }

  private cleanup(): void {
    const r = this.room;
    for (const list of [r.enemies, r.projectiles, r.items] as Array<Array<Enemy | Projectile | GroundItemEntity>>) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.dead) {
          list[i]!.view.destroy({ children: true });
          list.splice(i, 1);
        }
      }
    }
  }

  private checkRoomClear(): void {
    const r = this.room;
    const id = r.currentId;
    if (isOwned(r.state)) return;
    if (r.enemies.some((e) => e.monsterId && !e.dead && e.roomId === id) || r.state.monsters.length > 0) {
      this.clearNoted = false;
      return;
    }
    for (const e of r.enemies) if (!e.monsterId && !e.dead && e.roomId === id) this.killEnemy(e, false);
    if (this.clearNoted) return;
    this.clearNoted = true;
    this.ui.banner('Room cleared', 'Plant a company flag to claim it, and barricade doors to rooms with monsters, or more will come.');
  }

  /** Plant a company flag on a tile of the current (cleared) room: the room is company property now. */
  plantFlag(x: number, y: number): void {
    const id = this.room.roomIdAt(x, y) ?? this.room.currentId;
    this.dispatch({ type: 'furniturePlaced', roomId: id, placement: { uid: uid(), defId: 'company_flag', x, y, rot: 0 } });
    this.dispatch({ type: 'roomOwned', roomId: id, ownerId: this.session.playerId });
    this.furnitureChanged();
    this.burst(x + 0.5, y + 0.5, 0xd0b040, 16);
    this.ui.banner('Property acquired!', 'This room is company property now.');
    const need = securityNeeds(this.session.state, this.room.layout.layouts.get(id)!.info);
    if (need.doors) this.toast(`Not secure yet: ${need.doors} door${need.doors === 1 ? ' needs' : 's need'} a barricade (tier ${need.tier} or better)`, 'insecure');
    // It may join your estate: walk on into the bigger space without a screen change.
    if (areaRooms(this.session.state, id).length > 1) this.reloadArea();
    void this.session.flush();
  }

  /** Rebuild the area around the player in place (the estate changed shape). No time passes. */
  private reloadArea(): void {
    this.loadRoom(this.room.currentId, false);
  }

  /**
   * Knock through the structural wall at (x, y) and its twin across the wall line, between any two
   * rooms (see `structuralWallTarget`); costs the heavy tool 2 uses. The rooms become one area.
   */
  demolishWall(x: number, y: number): void {
    const st = this.session.state;
    const id = this.room.roomIdAt(x, y);
    const info = id ? this.room.layout.layouts.get(id)?.info : undefined;
    const other = info && structuralWallTarget(st, info, x, y);
    if (!id || !other) return;
    // A room you break into gets its doors fixed now, as entering it would (floors grow on entry).
    const expansion = expandRoom(st.floors[this.floorIndex]!, st.seed, other.roomId);
    if (expansion) this.dispatch({ type: 'roomsGenerated', floor: this.floorIndex, infos: expansion.infos, states: expansion.states });
    const hb = structuredClone(this.session.player.hotbar);
    if (hb.main) hb.main.data.count = Math.max(0, countLeft(hb.main) - 2);
    this.setHotbar(hb);
    this.dispatch({ type: 'tileSet', roomId: id, x, y, obstacle: null });
    this.dispatch({ type: 'tileSet', roomId: other.roomId, x: other.x, y: other.y, obstacle: null });
    this.burst(x + 0.5, y + 0.5, 0x8a8a8a, 18);
    this.burst(other.x + 0.5, other.y + 0.5, 0x8a8a8a, 18);
    this.shake(0.4);
    this.toast('The wall comes down');
    if (!this.room.layout.layouts.has(other.roomId)) return this.reloadArea();
    this.room.layout.layouts.get(id)!.rebuildFurniture();
    this.room.rebuildRoom(id);
    this.room.rebuildRoom(other.roomId);
    this.rebuildStaticLights();
    this.drawBoundaries();
  }

  /** Install / repair / remove (null) the barricade on a door tile of the current room. */
  setBarricade(x: number, y: number, barricade: Barricade | null): void {
    const st = this.session.state;
    const id = this.room.roomIdAt(x, y) ?? this.room.currentId;
    const wasSecure = isSecure(st, id);
    this.dispatch({ type: 'barricadeSet', roomId: id, door: tileKey(x, y), barricade });
    // It sits in both halves of the doorway.
    this.room.rebuildRoom(id);
    const other = partnerDoor(st, id, tileKey(x, y));
    if (other) this.room.rebuildRoom(other.roomId);
    if (!isOwned(st.rooms[id])) return;
    const secure = isSecure(st, id);
    if (secure && st.rooms[id]!.insecureSince !== undefined) this.dispatch({ type: 'roomInsecure', roomId: id, since: null });
    if (secure && !wasSecure) this.toast('This room is secure');
    if (!secure && wasSecure) this.toast('This room is no longer secure');
  }

  /** The active rooms' barricades, to spot changes while time passes. */
  private barricadesSnapshot(): string {
    return JSON.stringify(this.room.layout.activeIds.map((id) => this.session.state.rooms[id]?.barricades));
  }

  /**
   * After time passes, bring the live area in line with its persisted state: monsters that spilled
   * in appear at their door, and barricades that wore down or broke are redrawn.
   */
  private reconcileRoom(barricadesBefore: string): void {
    for (const id of this.room.layout.activeIds) this.spawnRoster(id, true);
    this.syncNpcs();
    if (this.barricadesSnapshot() !== barricadesBefore) {
      this.room.layout.rebuildFurniture();
      for (const id of this.room.layout.activeIds) this.room.rebuildRoom(id);
    }
  }

  /**
   * Spawn a room's roster monsters that aren't live yet. One whose spot is right next to the player
   * (they came in through the door you just used, say) appears somewhere across the room instead.
   */
  private spawnRoster(id: string, announce = false): void {
    const L = this.room.layout.layouts.get(id);
    if (!L) return;
    const live = new Set(this.room.enemies.filter((e) => e.monsterId && !e.dead).map((e) => e.monsterId));
    let away: { x: number; y: number }[] | null = null;
    for (const placed of L.rosterPlacements()) {
      const { record } = placed;
      if (live.has(record.id)) continue;
      let { x, y } = placed;
      if (Math.hypot(x - this.player.x, y - this.player.y) < SPAWN_CLEARANCE) {
        away ??= this.spotsAwayFromPlayer(L);
        const spot = away.length ? away[Math.floor(Math.random() * away.length)]! : null;
        if (spot) ({ x, y } = spot);
      }
      const e = this.addEnemy(new Enemy(record.defId, x, y, { monsterId: record.id, hpFrac: record.hpFrac, hpMul: record.hpMul }));
      e.roomId = id;
      if (announce) this.burst(x, y, 0x40302a, 10);
    }
  }

  /** Open floor in a room well away from the player (the farthest tiles if the room is small). */
  private spotsAwayFromPlayer(L: RoomLayout): { x: number; y: number }[] {
    const open: { x: number; y: number; d: number }[] = [];
    for (const t of L.tiles()) {
      if (L.kindAt(t.x, t.y) !== 'floor' || L.blocksMovement(t.x, t.y, 'walk')) continue;
      open.push({ x: t.x + 0.5, y: t.y + 0.5, d: Math.hypot(t.x + 0.5 - this.player.x, t.y + 0.5 - this.player.y) });
    }
    const far = open.filter((t) => t.d >= SPAWN_AWAY);
    if (far.length) return far;
    open.sort((a, b) => b.d - a.d);
    return open.slice(0, 3);
  }

  // ───────────────────────────── streaming & crossing rooms ─────────────────────────────

  /**
   * Keep only the rooms near the camera live: rooms coming into range get renderers, monsters and
   * ground items; rooms leaving it persist their roster and drop theirs (entities and views together).
   */
  private updateStreaming(force = false): void {
    const view = {
      x: this.cam.x / TILE_PX, y: this.cam.y / TILE_PX,
      w: this.app.screen.width / this.scale / TILE_PX, h: this.app.screen.height / this.scale / TILE_PX,
    };
    const { added, removed } = this.room.setActive(this.room.roomsNear(view));
    if (!added.length && !removed.length && !force) return;
    for (const id of removed) this.parkRoom(id);
    for (const id of added) {
      this.spawnRoster(id);
      const st = this.session.state.rooms[id]!;
      for (const g of st.groundItems) {
        const it = new GroundItemEntity(structuredClone(g));
        it.roomId = id;
        this.addGroundItem(it);
      }
    }
    this.rebuildStaticLights();
    this.drawBoundaries();
    this.syncNpcs();
  }

  // ───────────────────────────── tenants ─────────────────────────────

  /**
   * Live tenants and applicants match the records: anyone whose unit's sign is in an active room is
   * there (unless they fled next door), standing near the sign at first; anyone else isn't.
   */
  syncNpcs(): void {
    const st = this.session.state;
    const active = new Set(this.room.layout.activeIds);
    const want = new Map<string, { t: Tenant; roomId: string; x: number; y: number }>();
    for (const t of Object.values(getTenants(st))) {
      if (t.floor !== this.floorIndex || t.displaced) continue;
      const sign = findSign(st, t.signUid);
      if (sign && active.has(sign.roomId)) want.set(t.id, { t, roomId: sign.roomId, x: sign.f.x, y: sign.f.y });
    }
    const npcs = this.room.npcs;
    for (let i = npcs.length - 1; i >= 0; i--) {
      if (want.has(npcs[i]!.tenantId)) continue;
      npcs[i]!.view.destroy({ children: true });
      npcs.splice(i, 1);
    }
    for (const w of want.values()) {
      if (npcs.some((n) => n.tenantId === w.t.id)) continue;
      const unit = unitAt(st, this.floorIndex, w.x, w.y);
      const spot = this.room.layout.nearestOpenFloor(w.x + 0.5, w.y + 1.5) ?? { x: w.x, y: w.y + 1 };
      const npc = new TenantNpc(w.t, spot.x + 0.5, spot.y + 0.5, unit ? [...unit.tiles] : []);
      npc.roomId = w.roomId;
      const bed = unit?.furniture.find((f) => registry.furniture.tryGet(f.f.defId)?.tags?.includes('bed'));
      const rest = bed && this.room.layout.nearestOpenFloor(bed.f.x + 0.5, bed.f.y + 0.5);
      npc.bedSpot = rest ? { x: rest.x + 0.5, y: rest.y + 0.5 } : null;
      npcs.push(npc);
      this.entityLayer.addChild(npc.view);
    }
  }

  private updateNpcs(dt: number): void {
    const night = getClock(this.session.state).minute >= 22 * 60;
    const tenants = getTenants(this.session.state);
    for (const n of this.room.npcs) n.update(this, dt, night && tenants[n.tenantId]?.status === 'living' ? n.bedSpot : null);
  }

  /** A tenant or applicant under the cursor. */
  npcUnderCursor(): TenantNpc | undefined {
    const m = this.mouseWorld();
    return this.room.npcs.find((n) => Math.hypot(n.x - m.x, n.y - 0.3 - m.y) < 0.55);
  }

  /** Put a For Rent sign down on a tile of your property: lists its unit. */
  placeSign(x: number, y: number): void {
    const id = this.room.roomIdAt(x, y) ?? this.room.currentId;
    this.dispatch({ type: 'furniturePlaced', roomId: id, placement: { uid: uid(), defId: 'for_rent_sign', x, y, rot: 0, data: { closed: false } } });
    this.furnitureChanged();
    const unit = unitAt(this.session.state, this.floorIndex, x, y);
    const beds = unit?.furniture.filter((f) => registry.furniture.tryGet(f.f.defId)?.tags?.includes('bed')).length ?? 0;
    if (!this.room.ownedAt(x, y)) this.toast("It's up, but this isn't your property: nobody will apply here.");
    else this.toast(beds ? 'Listed for rent. Applicants come up from the lobby.' : 'Listed, but nobody will rent a place without a bed.');
  }

  /** Click a For Rent sign: open or close its listing. */
  toggleListing(uidOf: string): void {
    const at = this.room.layout.findFurniture(uidOf);
    if (!at) return;
    const closed = !(at.f.data?.closed === true);
    this.dispatch({ type: 'furnitureUpdated', roomId: at.room.info.id, placement: { ...at.f, data: { ...at.f.data, closed } } });
    this.toast(closed ? 'Listing closed' : 'Listing open');
  }

  /** A room leaves the active set: its monsters' wounds are saved and its live entities go away. */
  private parkRoom(id: string): void {
    this.syncRoster(id);
    for (const list of [this.room.enemies, this.room.items, this.room.npcs] as Array<Array<Enemy | GroundItemEntity | TenantNpc>>) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.roomId !== id) continue;
        list[i]!.view.destroy({ children: true });
        list.splice(i, 1);
      }
    }
  }

  /**
   * Walking between the estate's rooms: the player's room follows them (time doesn't pass), and
   * monsters that wander into another room move to its roster.
   */
  private trackRooms(): void {
    const rid = this.room.roomIdAt(this.player.x, this.player.y);
    if (rid && rid !== this.room.currentId) {
      this.room.currentId = rid;
      const p = this.session.player;
      this.dispatch({ type: 'playerMoved', playerId: p.id, floor: p.floor, roomId: rid, x: this.player.x, y: this.player.y });
      this.clearNoted = false;
      this.ui.onRoomChanged();
      this.checkCurfew();
    }
    for (const e of this.room.enemies) {
      if (e.dead) continue;
      const r = this.room.roomIdAt(e.x, e.y);
      if (!r || r === e.roomId) continue;
      if (e.monsterId && e.roomId) this.dispatch({ type: 'monsterMoved', from: e.roomId, to: r, monsterId: e.monsterId });
      e.roomId = r;
    }
  }

  /** The phone's "Room boundaries" overlay: outlines each active room's true cells. */
  toggleBoundaries(): void {
    this.showBoundaries = !this.showBoundaries;
    this.drawBoundaries();
  }

  private drawBoundaries(): void {
    const g = this.boundaries.clear();
    if (!this.showBoundaries) return;
    for (const id of this.room.layout.activeIds) {
      const info = this.room.layout.layouts.get(id)!.info;
      const cells = new Set(info.cells.map((c) => `${c.cx},${c.cy}`));
      for (const c of info.cells) {
        const x = c.cx * CELL_W * TILE_PX, y = c.cy * CELL_H * TILE_PX, w = CELL_W * TILE_PX, h = CELL_H * TILE_PX;
        if (!cells.has(`${c.cx},${c.cy - 1}`)) g.moveTo(x, y).lineTo(x + w, y);
        if (!cells.has(`${c.cx},${c.cy + 1}`)) g.moveTo(x, y + h).lineTo(x + w, y + h);
        if (!cells.has(`${c.cx - 1},${c.cy}`)) g.moveTo(x, y).lineTo(x, y + h);
        if (!cells.has(`${c.cx + 1},${c.cy}`)) g.moveTo(x + w, y).lineTo(x + w, y + h);
      }
    }
    g.stroke({ color: 0xffd060, width: 1.5, alpha: 0.85 });
  }

  private checkTransitions(): void {
    const pl = this.player;
    const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
    const key = tileKey(tx, ty);
    if (!this.room.layout.containsTile(tx, ty)) {
      const door = this.room.exits.get(key);
      if (door) {
        const from = this.room.info.id;
        this.loadRoom(door.toRoom, true);
        this.afterTransition(from);
        return;
      }
    }
    if (key !== pl.lastTile) {
      const [lx, ly] = pl.lastTile.split(',').map(Number) as [number, number];
      pl.lastTile = key;
      const o = this.room.layout.obstacleAt(tx, ty);
      if (o?.trigger) triggers[o.trigger.id]?.(this, o.trigger.params ?? {}, tx, ty, this.entryDir(tx - lx, ty - ly));
    }
  }

  /** Unit grid direction the player stepped onto a tile in (dominant axis for diagonal steps). */
  private entryDir(dx: number, dy: number): { dx: number; dy: number } {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return { dx: 0, dy: 1 };
    if (dx && dy) {
      const mv = this.input.moveVector();
      if (Math.abs(mv.x) > Math.abs(mv.y)) dy = 0;
      else dx = 0;
    }
    return { dx: Math.sign(dx), dy: Math.sign(dy) };
  }

  // ───────────────────────────── rooms & floors ─────────────────────────────

  loadRoom(roomId: string, record: boolean): void {
    const st = this.session.state;
    const p = this.session.player;
    // Floors grow one room ahead of the player: entering a room fixes its doors and creates the rooms behind them.
    const expansion = expandRoom(st.floors[p.floor]!, st.seed, roomId);
    if (expansion) this.dispatch({ type: 'roomsGenerated', floor: p.floor, infos: expansion.infos, states: expansion.states });
    const info = st.floors[p.floor]!.rooms[roomId]!;
    const roomState = st.rooms[roomId]!;
    if (this.room) {
      for (const id of this.room.layout.activeIds) this.syncRoster(id);
      this.room.destroy();
    }
    // Effects belong to the room they happened in: drop them from the update list *and* destroy
    // their views together, so nothing updates a destroyed view.
    for (const f of this.fx) f.view.destroy({ children: true });
    this.fx = [];
    this.fxLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.player.swing = null;
    const layers = { floor: this.floorLayer, walls: this.wallLayer, entities: this.entityLayer };
    this.room = new AreaRuntime(st, p.floor, areaRooms(st, roomId), roomId, layers, this.session.playerId);
    this.room.player = this.player;
    if (!this.player.view.parent) this.entityLayer.addChild(this.player.view);
    this.updateCamera();
    this.updateStreaming(true);
    this.player.lastTile = tileKey(Math.floor(this.player.x), Math.floor(this.player.y));
    this.player.kx = this.player.ky = 0;
    if (record || !roomState.visited) {
      this.dispatch({ type: 'playerMoved', playerId: this.session.playerId, floor: p.floor, roomId, x: this.player.x, y: this.player.y });
    }
    this.ui.onRoomChanged();
    this.clearNoted = false;
    if (isOwnedBy(roomState, this.session.playerId) && !isSecure(st, roomId) && !roomState.monsters.length) {
      const need = securityNeeds(st, info);
      if (need.doors) this.toast(`Not secure: ${need.doors} door${need.doors === 1 ? ' needs' : 's need'} a barricade (tier ${need.tier} or better)`, 'insecure');
    }
    void this.session.flush();
  }

  /**
   * Take the stairs. `dir` is the direction the player walked onto them: they come out on the far
   * side of the arrival stairs, so walking on doesn't take them straight back.
   */
  changeFloor(delta: number, dir = { dx: 0, dy: 1 }): void {
    const p = this.session.player;
    const target = p.floor + delta;
    if (target < 1) return;
    const st = this.session.state;
    if (!st.floors[target]) {
      const { floor, rooms } = generateFloor(st.seed, target);
      this.dispatch({ type: 'floorGenerated', floor, rooms });
    }
    const floor = st.floors[target]!;
    // Every stairs down leads to the next floor's lobby; the stairs up lead back to the last stairs taken down.
    const roomId = delta > 0 ? floor.lobbyRoomId : floor.lastStairsDown ?? stairsDownRooms(floor)[0]?.id;
    if (!roomId) return;
    if (delta > 0) this.dispatch({ type: 'stairsDescended', floor: p.floor, roomId: this.room.info.id });
    const stairsId = delta > 0 ? 'stairs_up' : 'stairs_down';
    p.floor = target;
    const L = new RoomLayout(floor.rooms[roomId]!, st.rooms[roomId]!);
    let spot: { x: number; y: number } | null = null;
    // Ahead first, then to either side, then behind.
    const tries = [[dir.dx, dir.dy], [dir.dy, dir.dx], [-dir.dy, -dir.dx], [-dir.dx, -dir.dy]] as const;
    const open = (x: number, y: number) =>
      L.kindAt(x, y) === 'floor' && !L.blocksMovement(x, y, 'walk') && !L.obstacleAt(x, y)?.hazard && !L.obstacleAt(x, y)?.trigger;
    for (const t of L.tiles()) {
      if (L.obstacleIdAt(t.x, t.y) !== stairsId) continue;
      const side = tries.find(([dx, dy]) => open(t.x + dx, t.y + dy)) ?? tries[0];
      spot = { x: t.x + side[0] + 0.5, y: t.y + side[1] + 0.5 };
    }
    const e = entryPoint(floor);
    this.player.x = spot?.x ?? e.x;
    this.player.y = spot?.y ?? e.y;
    const from = this.room.info.id;
    this.loadRoom(roomId, true);
    this.ui.banner(`Level ${target}`, delta > 0 ? 'Deeper into the Backrooms…' : 'Back up the stairs.');
    this.afterTransition(from);
  }

  /** Floors whose lobby you've been to: the elevator's buttons. */
  elevatorFloors(): number[] {
    const st = this.session.state;
    return Object.values(st.floors)
      .filter((f) => f.index !== APARTMENT_FLOOR && st.rooms[f.lobbyRoomId]?.visited)
      .map((f) => f.index)
      .sort((a, b) => a - b);
  }

  /** Ride the elevator to another floor's lobby. */
  rideElevator(target: number): void {
    if (target === this.floorIndex || !this.elevatorFloors().includes(target)) return;
    this.arriveAtLobby(target, 'elevator', `Level ${target}`, 'Ding.');
  }

  /** Step through the crack: apartment ↔ Level 1's lobby. */
  usePortal(): void {
    const st = this.session.state;
    if (this.floorIndex === APARTMENT_FLOOR) this.arriveAtLobby(1, 'portal', 'Level 1', 'The carpet is damp. The lights hum.');
    else if (this.room.info.id === st.floors[1]?.lobbyRoomId) this.arriveAtLobby(APARTMENT_FLOOR, 'portal', 'Home', 'Your apartment. It smells like old pizza.');
  }

  /**
   * Arrive in a floor's lobby next to the furniture whose use is `nearUse` (the elevator or the portal).
   */
  private arriveAtLobby(target: number, near: string, title: string, sub: string): void {
    const st = this.session.state;
    const p = this.session.player;
    const floor = st.floors[target];
    if (!floor) return;
    const lobby = floor.lobbyRoomId;
    const anchor = st.rooms[lobby]!.furniture.find((f) => f.defId === near);
    p.floor = target;
    const L = new RoomLayout(floor.rooms[lobby]!, st.rooms[lobby]!);
    const spot = anchor ? L.nearestOpenFloor(anchor.x + 0.5, anchor.y + 1.5) : null;
    const e = entryPoint(floor);
    this.player.x = spot ? spot.x + 0.5 : e.x;
    this.player.y = spot ? spot.y + 0.5 : e.y;
    this.loadRoom(lobby, true);
    this.portalArmed = false;
    this.ui.banner(title, sub);
    this.prevRoomId = null;
    this.checkCurfew();
  }

  /**
   * Persist the roster's health before leaving a room: monsters keep their wounds, but are placed
   * back on their spawn tiles next time. Transient enemies (summons) are not persisted.
   */
  private syncRoster(roomId: string): void {
    const state = this.session.state.rooms[roomId];
    if (!state) return;
    const live = new Map(this.room.enemies.filter((e) => e.monsterId && !e.dead && e.roomId === roomId).map((e) => [e.monsterId!, e]));
    let changed = false;
    const monsters = state.monsters.map((m): MonsterRecord => {
      const e = live.get(m.id);
      if (!e) return m;
      const frac = Math.round(Math.max(0.001, Math.min(1, e.hp / e.maxHp)) * 1000) / 1000;
      const { hpFrac: _old, ...rest } = m;
      const next: MonsterRecord = frac < 1 ? { ...rest, hpFrac: frac } : rest;
      if (next.hpFrac !== m.hpFrac) changed = true;
      return next;
    });
    if (changed) this.dispatch({ type: 'rosterSynced', roomId: state.id, monsters });
  }

  // ───────────────────────────── time & sleep ─────────────────────────────

  /** A screen transition happened (it costs no time: the clock runs in real time). */
  private afterTransition(fromRoomId: string): void {
    this.prevRoomId = fromRoomId;
    this.checkCurfew();
  }

  /**
   * The clock runs while you play, except with a menu or panel open (like Stardew Valley). It's
   * committed in CLOCK_STEP-minute steps so saves and the server aren't touched every second.
   */
  private runClock(dt: number): void {
    if (this.ui.blocking) return;
    this.clockAcc += dt * MINUTES_PER_SECOND;
    if (this.clockAcc < CLOCK_STEP) return;
    const minutes = Math.floor(this.clockAcc / CLOCK_STEP) * CLOCK_STEP;
    this.clockAcc -= minutes;
    this.passTime(minutes);
  }

  /**
   * Rooms monsters neither enter nor leave while time runs: the one you're in and the one you just came
   * from, so clearing your way forward never refills the room behind you from the one you're fighting in.
   */
  private quietRooms(): Set<string> {
    const here = this.room.roomIdAt(this.player.x, this.player.y) ?? this.room.currentId;
    return new Set([here, this.room.currentId, ...(this.prevRoomId ? [this.prevRoomId] : [])]);
  }

  /** Move the clock forward, resolving off-screen processes for every tick crossed. */
  passTime(minutes: number): void {
    const quiet = this.quietRooms();
    const st = this.session.state;
    const from = getClock(st);
    const to = { day: from.day, minute: from.minute + minutes };
    const before = this.barricadesSnapshot();
    advanceClock(st, from, to, (c) => this.dispatch(c), undefined, quiet);
    this.dispatch({ type: 'timePassed', minutes });
    this.reconcileRoom(before);
    if (!isSecure(st, this.room.info.id)) {
      const warnings: [number, string][] = [
        [MIDNIGHT_MINUTE, "It's midnight. Reach a secured room before 2 AM, or you'll pass out."],
        [MIDNIGHT_MINUTE + 60, '1 AM. One hour left to reach a secured room.'],
      ];
      for (const [at, text] of warnings) if (from.minute < at && to.minute >= at) this.notify('warn', text);
    }
    this.checkCurfew();
  }

  /** Past midnight you fall asleep as soon as you're somewhere secure; at 2 AM anywhere else, you pass out. */
  private checkCurfew(): void {
    if (this.sleeping || this.dying > 0) return;
    const c = getClock(this.session.state);
    if (c.minute < MIDNIGHT_MINUTE) return;
    if (isSecure(this.session.state, this.room.info.id)) this.beginSleep('collapse');
    else if (c.minute >= PASS_OUT_MINUTE) this.beginSleep('passOut');
  }

  /** Sleep on the spot (phone button). */
  sleepHere(): void {
    if (this.sleeping || this.dying > 0) return;
    if (!isSecure(this.session.state, this.room.info.id)) {
      this.toast('You can only sleep somewhere secure');
      return;
    }
    this.beginSleep('floor');
  }

  get asleep(): boolean {
    return !!this.sleeping;
  }

  private beginSleep(kind: SleepKind, homeBed = false): void {
    if (this.sleeping || this.dying > 0) return;
    this.sleeping = { kind, homeBed, t: 0, applied: false };
    this.player.swing = null;
    this.ui.closeStorage();
    this.ui.fade(true);
  }

  private updateSleep(dt: number): void {
    const s = this.sleeping!;
    s.t += dt;
    if (!s.applied && s.t >= SLEEP_FADE) {
      s.applied = true;
      this.applySleep(s);
    }
    if (s.t >= SLEEP_FADE + SLEEP_HOLD) {
      this.sleeping = null;
      this.ui.fade(false);
    }
  }

  /** Resolve the night: the hours slept and the day's end run their resolvers, then the clock jumps to the wake time. */
  private applySleep(s: SleepState): void {
    const st = this.session.state;
    const from = getClock(st);
    const to = wakeTime(from);
    if (s.kind === 'passOut') {
      this.dropCarriedHere();
      this.respawnAtHome();
    }
    const before = this.barricadesSnapshot();
    advanceClock(st, from, to, (c) => this.dispatch(c), from.day);
    this.clockAcc = 0;
    this.reconcileRoom(before);
    // The night may have changed furniture here (deliveries, repossessions).
    this.furnitureChanged();
    const max = this.player.maxRedHalves();
    const fullRest = s.homeBed || s.kind === 'passOut';
    const hp = fullRest ? max : Math.max(this.session.player.redHalves, Math.min(max, Math.floor(max * AWAY_SLEEP_HEAL_FRACTION)));
    this.dispatch({ type: 'slept', playerId: this.session.playerId, clock: to, redHalves: hp });
    const how: Record<SleepKind, string> = {
      bed: 'You slept in your own bed and feel fully rested.',
      floor: 'You slept on the floor. Only partly rested.',
      collapse: 'You collapsed from exhaustion at midnight. Only partly rested.',
      passOut: 'You passed out in the Backrooms at 2 AM and woke up at home. Everything you carried is gone.',
    };
    this.notify(s.kind === 'passOut' ? 'urgent' : 'info', `Day ${to.day}. ${how[s.kind]}`, false);
    this.ui.banner(`Day ${to.day}`, `${formatTime(to.minute, settings.clock24)}. ${how[s.kind]}`);
  }

  /** Post a phone message, optionally also as a toast. */
  notify(severity: PhoneMessage['severity'], text: string, toast = true): void {
    const c = getClock(this.session.state);
    this.dispatch({ type: 'messagePosted', playerId: this.session.playerId, message: { id: uid(), day: c.day, minute: c.minute, severity, text } });
    if (toast) this.toast(text);
  }

  // ───────────────────────────── combat ─────────────────────────────

  addEnemy(e: Enemy): Enemy {
    e.roomId ||= this.room.roomIdAt(e.x, e.y) ?? this.room.currentId;
    this.room.enemies.push(e);
    this.entityLayer.addChild(e.view);
    return e;
  }

  spawnEnemy(defId: string, x: number, y: number): Enemy | null {
    const blocked = this.room.blockerFor(registry.enemies.get(defId).movementKind, 'enemy');
    if (blocked(Math.floor(x), Math.floor(y))) return null;
    const e = this.addEnemy(new Enemy(defId, x, y));
    this.burst(x, y, 0xe8e2d0, 8);
    return e;
  }

  spawnProjectile(init: ProjectileInit): Projectile {
    const p = new Projectile(init);
    this.room.projectiles.push(p);
    this.entityLayer.addChild(p.view);
    return p;
  }

  damageEnemy(e: Enemy, dmg: number, dirX: number, dirY: number, knockback: number): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.12;
    const kb = knockback * (1 - (e.def.knockbackResist ?? 0));
    e.kx += dirX * kb;
    e.ky += dirY * kb;
    this.floatText(e.x, e.y - 0.6, String(Math.round(dmg * 10) / 10), 0xffffff);
    if (e.hp <= 0) this.killEnemy(e, true);
  }

  killEnemy(e: Enemy, drops: boolean): void {
    if (e.dead) return;
    e.dead = true;
    this.burst(e.x, e.y, e.def.tint ?? 0xc04040, 12);
    if (e.monsterId) this.dispatch({ type: 'monsterKilled', roomId: e.roomId || this.room.currentId, monsterId: e.monsterId });
    if (drops && e.def.lootTable) this.spawnLoot(e);
    if (e.def.boss) {
      this.shake(0.6);
      for (const x of this.room.enemies) if (!x.monsterId) this.killEnemy(x, false);
    }
  }

  private spawnLoot(e: Enemy): void {
    const table = registry.lootTables.get(e.def.lootTable!);
    for (const r of rollLoot(table, this.rng)) {
      const inst = r.kind === 'cash' ? createItem('cash', uid(), { amount: r.amount }) : createItem(r.item);
      const pos = this.spillSpot(e.x, e.y);
      this.dropGroundItem(inst, pos.x, pos.y, { x: e.x, y: e.y });
    }
  }

  private spillSpot(x: number, y: number): { x: number; y: number } {
    const L = this.room.layout;
    for (let i = 0; i < 12; i++) {
      const a = this.rng.next() * Math.PI * 2, d = 0.4 + this.rng.next() * 0.9;
      const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
      const tx = Math.floor(nx), ty = Math.floor(ny);
      if (L.kindAt(tx, ty) === 'floor' && !L.blocksMovement(tx, ty, 'walk') && !L.obstacleAt(tx, ty)?.hazard) return { x: nx, y: ny };
    }
    return { x, y };
  }

  dropGroundItem(inst: ItemInstance, x: number, y: number, from?: { x: number; y: number }): GroundItemEntity {
    const g = { uid: uid(), x, y, item: inst };
    const roomId = this.room.roomIdAt(x, y) ?? this.room.currentId;
    this.dispatch({ type: 'groundItemAdded', roomId, item: g });
    const it = new GroundItemEntity(structuredClone(g), from);
    it.roomId = roomId;
    return this.addGroundItem(it);
  }

  private addGroundItem(e: GroundItemEntity): GroundItemEntity {
    this.room.items.push(e);
    this.entityLayer.addChild(e.view);
    return e;
  }

  /** Returns 'hit' if damage landed, 'ignored' during i-frames. */
  hurtPlayer(amount: number, sx: number, sy: number, hazard = false): 'hit' | 'ignored' {
    const pl = this.player;
    if (this.dying > 0 || pl.iframes > 0) return 'ignored';
    const p = this.session.player;
    const hb = structuredClone(p.hotbar);
    const layers: HealthLayer[] = [{ kind: 'red', current: p.redHalves, max: pl.maxRedHalves() }];
    if (hb.armor) {
      layers.push({ kind: 'armor', current: Number(hb.armor.data.armorHalves ?? 0), max: Number(hb.armor.data.armorHalves ?? 0), boundItemUid: hb.armor.uid });
    }
    const stack = new HealthStack(layers);
    const res = stack.damage(amount);
    if (hb.armor) {
      if (res.brokenItems.includes(hb.armor.uid)) {
        this.toast(`Your ${itemDef(hb.armor).name} broke!`);
        hb.armor = null;
      } else {
        hb.armor.data.armorHalves = stack.get('armor')!.current;
      }
    }
    const red = stack.get('red')!.current;
    this.dispatch({ type: 'playerUpdated', playerId: p.id, patch: { redHalves: red, hotbar: hb } });
    pl.iframes = 1;
    pl.flash = 0.15;
    const d = Math.hypot(pl.x - sx, pl.y - sy) || 1;
    if (!hazard) {
      pl.kx += ((pl.x - sx) / d) * 6;
      pl.ky += ((pl.y - sy) / d) * 6;
    }
    this.shake(0.3);
    if (res.dead) this.killPlayer();
    return 'hit';
  }

  healPlayer(halves: number): number {
    const p = this.session.player;
    const max = this.player.maxRedHalves();
    const next = Math.min(max, p.redHalves + halves);
    const healed = next - p.redHalves;
    if (healed > 0) this.dispatch({ type: 'playerUpdated', playerId: p.id, patch: { redHalves: next } });
    return healed;
  }

  addCash(n: number): void {
    const p = this.session.player;
    this.dispatch({ type: 'playerUpdated', playerId: p.id, patch: { cash: p.cash + n } });
  }

  /** Carried furniture is set down where you fell (it never leaves the world). */
  private dropCarriedHere(): void {
    const p = this.session.player;
    if (!p.carrying) return;
    const def = registry.furniture.get(p.carrying.defId);
    const spot = this.room.layout.findFurnitureSpot(def, Math.floor(this.player.x), Math.floor(this.player.y), p.carrying.rot);
    if (spot) this.dispatch({ type: 'furniturePlaced', roomId: this.room.roomIdAt(spot.x, spot.y) ?? this.room.currentId, placement: { ...p.carrying, x: spot.x, y: spot.y } });
  }

  private killPlayer(): void {
    this.dropCarriedHere();
    this.dying = 1.6;
    this.burst(this.player.x, this.player.y, 0xd8323c, 24);
    this.player.view.visible = false;
    this.ui.banner('You died', 'Everything you carried is lost. Your cash and property remain.');
  }

  private respawn(): void {
    this.respawnAtHome();
    this.player.iframes = 1.5;
    this.player.view.visible = true;
    this.checkCurfew();
  }

  /** Death: lose what you carried and reappear at home. No time passes. */
  private respawnAtHome(): void {
    const st = this.session.state;
    const home = st.floors[APARTMENT_FLOOR]!;
    const e = entryPoint(home);
    this.dispatch({
      type: 'playerDied',
      playerId: this.session.playerId,
      respawn: { floor: APARTMENT_FLOOR, roomId: e.roomId, x: e.x, y: e.y },
      redHalves: this.session.player.baseRedMaxHalves,
    });
    this.player.refreshStats();
    this.player.x = e.x;
    this.player.y = e.y;
    this.loadRoom(e.roomId, false);
  }

  // ───────────────────────────── hotbar / furniture / renovation ─────────────────────────────

  setHotbar(hb: Hotbar): void {
    this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { hotbar: hb } });
    this.player.refreshStats();
    const p = this.session.player;
    const max = this.player.maxRedHalves();
    if (p.redHalves > max) this.dispatch({ type: 'playerUpdated', playerId: p.id, patch: { redHalves: max } });
  }

  /** Scroll wheel: swap the main hand with the next main-hand-capable storage item. */
  cycleMainHand(dir: number): void {
    const hb = structuredClone(this.session.player.hotbar);
    const idx = hb.slots.map((s, i) => (s && canHold('main', s) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const i = dir > 0 ? idx[0]! : idx[idx.length - 1]!;
    const prev = hb.main;
    hb.main = hb.slots[i]!;
    hb.slots.splice(i, 1);
    if (dir > 0) hb.slots.push(prev);
    else hb.slots.unshift(prev);
    this.setHotbar(hb);
  }

  /** Drop a hotbar item at the player's feet (from the UI). */
  dropItem(inst: ItemInstance): void {
    const a = Math.random() * Math.PI * 2;
    const g = this.dropGroundItem(inst, this.player.x + Math.cos(a) * 0.4, this.player.y + Math.sin(a) * 0.4, { x: this.player.x, y: this.player.y });
    g.requiresExit = true;
  }

  liftFurniture(f: FurniturePlacement): void {
    const at = this.room.layout.findFurniture(f.uid);
    if (!at || registry.furniture.get(f.defId).fixed) return;
    this.dispatch({ type: 'furnitureRemoved', roomId: at.room.info.id, uid: f.uid });
    this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { carrying: structuredClone(f) } });
    this.furnitureChanged();
    this.ui.closeStorage();
  }

  placeCarried(x: number, y: number): void {
    const c = this.session.player.carrying;
    if (!c) return;
    this.dispatch({ type: 'furniturePlaced', roomId: this.room.roomIdAt(x, y) ?? this.room.currentId, placement: { ...c, x, y } });
    this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { carrying: null } });
    this.furnitureChanged();
    // Your own rooms are on your own grid: say so when something you set down has nothing to run on.
    const needs = registry.furniture.get(c.defId).utility?.needs;
    if (needs && !this.supplied({ ...c, x, y })) {
      this.toast(needs === 'power'
        ? 'No power here. Run wire from it to a generator (Wire Spool).'
        : 'No water here. Run pipe from it to a water main (Pipe Bundle).', 'utility');
    }
  }

  // ───────────────────────────── utilities ─────────────────────────────

  /** The floor's utility networks, recomputed whenever the world changes. */
  utilityNetsNow(): UtilityNets {
    const key = `${this.floorIndex}:${this.session.changes}`;
    if (key !== this.netsKey || !this.nets) {
      this.nets = utilityNets(this.session.state, this.floorIndex);
      this.netsKey = key;
    }
    return this.nets;
  }

  /** Whether a placed (or about-to-be-placed) piece of furniture has the power / water it needs. */
  supplied(f: FurniturePlacement): boolean {
    return fixtureSupplied(this.session.state, this.utilityNetsNow(), this.room.roomIdAt(f.x, f.y) ?? this.room.currentId, f);
  }

  /** Lay a pipe / wire segment, or repair the faulty one on that tile. */
  layUtility(x: number, y: number, kind: UtilityKind): void {
    const roomId = this.room.roomIdAt(x, y) ?? this.room.currentId;
    const seg = this.session.state.rooms[roomId]?.utilities?.[tileKey(x, y)]?.[kind];
    if (seg?.fault) {
      this.dispatch({ type: 'utilityFault', roomId, x, y, kind, fault: false });
      this.burst(x + 0.5, y + 0.5, kind === 'power' ? 0xffd040 : 0x60a0ff, 10);
      this.toast(kind === 'power' ? 'Wire fixed' : 'Pipe fixed');
    } else {
      this.dispatch({ type: 'utilityLaid', roomId, x, y, kind });
    }
  }

  /** The utility kind the player is holding a tool for (x-ray), if any. */
  private heldUtility(): UtilityKind | null {
    const hb = this.session.player.hotbar;
    for (const it of [hb.main, hb.off]) {
      const d = it && itemDef(it);
      if (d?.kind === 'tool' && d.action.id === 'layUtility') return d.action.params?.kind as UtilityKind;
    }
    return null;
  }

  /**
   * Utilities on screen: the x-ray of the held tool's kind (live runs bright, dead ones grey, faults as
   * a red cross; fixtures and sources outlined green when working, red when not), and the symptoms of
   * faults, always (a puddle under a broken pipe, sparks off a broken wire).
   */
  private drawUtilities(): void {
    const nets = this.utilityNetsNow();
    const active = new Set(this.room.layout.activeIds);
    const T = TILE_PX;
    // Symptoms: redrawn every frame (sparks flicker).
    const sym = this.symptoms.clear();
    for (const kind of UTILITY_KINDS) {
      for (const [k, s] of nets[kind].segments) {
        if (!s.fault || !active.has(s.roomId)) continue;
        const [x, y] = k.split(',').map(Number) as [number, number];
        if (kind === 'water') {
          sym.ellipse((x + 0.5) * T, (y + 0.65) * T, T * 0.55, T * 0.32).fill({ color: 0x3a6ab0, alpha: 0.55 });
          sym.ellipse((x + 0.4) * T, (y + 0.55) * T, T * 0.18, T * 0.08).fill({ color: 0xa0c8ff, alpha: 0.5 });
        } else if (Math.random() < 0.45) {
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
            const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
            sym.moveTo(cx, cy).lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          sym.stroke({ color: 0xfff080, width: 1, alpha: 0.95 });
        }
      }
    }
    // X-ray: only while holding a pipe / wire tool; redrawn when something changes.
    const kind = this.heldUtility();
    const key = kind ? `${kind}:${this.netsKey}:${[...active].join(',')}` : '';
    if (key === this.xrayKey) return;
    this.xrayKey = key;
    const g = this.xray.clear();
    if (!kind) return;
    const net = nets[kind];
    const live = kind === 'power' ? 0xffd040 : 0x48a8ff;
    for (const [k, s] of net.segments) {
      if (!active.has(s.roomId)) continue;
      const [x, y] = k.split(',').map(Number) as [number, number];
      const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
      const color = s.fault ? 0xff4040 : net.served.has(k) ? live : 0x8a8a8a;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const n = net.segments.get(tileKey(x + dx, y + dy));
        if (n && !n.fault && !s.fault) g.moveTo(cx, cy).lineTo(cx + dx * T, cy + dy * T).stroke({ color, width: 3, alpha: 0.9 });
      }
      g.rect(cx - 2.5, cy - 2.5, 5, 5).fill({ color, alpha: 0.95 });
      if (s.fault) g.moveTo(cx - 4, cy - 4).lineTo(cx + 4, cy + 4).moveTo(cx + 4, cy - 4).lineTo(cx - 4, cy + 4).stroke({ color: 0xff2020, width: 2 });
    }
    for (const f of this.room.layout.furniture()) {
      const u = registry.furniture.get(f.defId).utility;
      if (u?.provides !== kind && u?.needs !== kind) continue;
      const { w, h } = footprint(registry.furniture.get(f.defId), f.rot);
      const ok = u.provides === kind || this.supplied(f);
      g.rect(f.x * T + 0.5, f.y * T + 0.5, w * T - 1, h * T - 1).stroke({ color: ok ? 0x60e060 : 0xff5050, width: 1.5, alpha: 0.9 });
    }
  }

  private furnitureChanged(): void {
    this.room.layout.rebuildFurniture();
    this.room.syncFurniture();
    this.shadows.rebuild(this.room.layout, this.app.renderer);
  }

  /** Click on furniture: its `use` behaviour if it has one, otherwise containers open. */
  useFurniture(furnitureUid: string): void {
    const f = this.room.layout.findFurniture(furnitureUid)?.f;
    if (!f) return;
    const def = registry.furniture.get(f.defId);
    if (!def.use) return this.openStorage(furnitureUid);
    const fp = footprint(def, f.rot);
    if (Math.hypot(f.x + fp.w / 2 - this.player.x, f.y + fp.h / 2 - this.player.y) > 2.6) return this.toast('Too far away');
    furnitureUses[def.use.id]?.(this, f, def.use.params ?? {});
  }

  /** The apartment bed: the one place you sleep fully rested. */
  sleepInHomeBed(): void {
    if (!isSecure(this.session.state, this.room.info.id)) return this.toast('You can only sleep somewhere secure');
    this.ui.confirm('Go to bed?', "Sleep until morning in your own bed. You'll wake up fully rested.", 'Sleep', () => this.beginSleep('bed', true));
  }

  openStorage(furnitureUid: string): void {
    const f = this.room.layout.findFurniture(furnitureUid)?.f;
    if (!f) return;
    const def = registry.furniture.get(f.defId);
    const cx = f.x + def.size.w / 2, cy = f.y + def.size.h / 2;
    if (Math.hypot(cx - this.player.x, cy - this.player.y) > 2.6) {
      this.toast('Too far away');
      return;
    }
    this.ui.openStorage(f);
  }

  setContainer(furnitureUid: string, contents: (ItemInstance | null)[]): void {
    const at = this.room.layout.findFurniture(furnitureUid);
    if (!at) return;
    this.dispatch({ type: 'furnitureUpdated', roomId: at.room.info.id, placement: { ...at.f, contents } });
  }

  useTool(x: number, y: number, tool: { action: ToolAction; params: Record<string, unknown> }, cost: number, slot: 'main' | 'off' = 'main'): void {
    const hb = structuredClone(this.session.player.hotbar);
    const item = hb[slot]!;
    const used = structuredClone(item);
    item.data.count = countLeft(item) - cost;
    if (countLeft(item) <= 0) {
      // A dual-use tool stays a weapon; it just can't renovate any more.
      if (itemDef(item).kind === 'weapon') this.toast(`Your ${itemDef(item).name} is too worn to renovate with`);
      else {
        this.toast(`Your ${itemDef(item).name} is used up`);
        hb[slot] = null;
      }
    }
    this.setHotbar(hb);
    // Applied after the hotbar update, since some actions hand items back (prying off a barricade).
    tool.action.apply(this, x, y, tool.params, used);
  }

  /** Tear a barricade down by hand: it's lost. */
  breakBarricade(x: number, y: number): void {
    this.setBarricade(x, y, null);
    this.burst(x + 0.5, y + 0.5, 0x9a7a5a, 14);
    this.shake(0.15);
    this.toast('You tore the barricade down');
  }

  /** Pry a barricade off whole: it comes back as a kit with whatever HP it had left. */
  pryBarricade(x: number, y: number): void {
    const b = this.room.layout.barricadeAt(x, y);
    if (!b) return;
    this.setBarricade(x, y, null);
    const kit = barricadeKit(b.tier);
    if (!kit) return;
    const max = BARRICADE_TIERS[b.tier]!.hp;
    const inst = createItem(kit, uid(), b.hp < max ? { count: 1, hp: Math.round(b.hp * 10) / 10 } : { count: 1 });
    const hb = structuredClone(this.session.player.hotbar);
    if (addToHotbar(hb, inst)) this.setHotbar(hb);
    else this.dropGroundItem(inst, this.player.x, this.player.y);
    this.toast(`Pried off: ${itemDef(inst).name}${b.hp < max ? ` (${Math.round((b.hp / max) * 100)}%)` : ''}`);
  }

  /** Break a wall you built with your bare hands (the slow way out of a sealed room). */
  breakBuiltWall(x: number, y: number): void {
    this.setTile(x, y, null);
    this.burst(x + 0.5, y + 0.5, 0xd8cfbf, 14);
    this.shake(0.25);
  }

  setTile(x: number, y: number, obstacle: string | null): void {
    const id = this.room.roomIdAt(x, y) ?? this.room.currentId;
    this.dispatch({ type: 'tileSet', roomId: id, x, y, obstacle });
    this.room.rebuildRoom(id);
    this.rebuildStaticLights();
  }

  setSurface(x: number, y: number, layer: 'floor' | 'wall', surface: string | null): void {
    const id = this.room.roomIdAt(x, y) ?? this.room.currentId;
    this.dispatch({ type: 'surfaceSet', roomId: id, x, y, layer, surface });
    this.room.rebuildRoom(id);
  }

  // ───────────────────────────── fx / feedback ─────────────────────────────

  toast(msg: string, key = msg): void {
    if ((this.toastCd.get(key) ?? 0) > 0) return;
    this.toastCd.set(key, 1.5);
    this.ui.toast(msg);
  }

  shake(t: number): void {
    this.shakeT = Math.max(this.shakeT, t);
  }

  burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().rect(-1, -1, 2, 2).fill(color);
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
      let vx = Math.cos(a) * s, vy = Math.sin(a) * s - 20;
      g.position.set(x * TILE_PX, y * TILE_PX);
      this.fxLayer.addChild(g);
      const life = 0.3 + Math.random() * 0.3;
      this.fx.push({
        view: g, life,
        update: (dt) => {
          vy += 120 * dt;
          g.x += vx * dt;
          g.y += vy * dt;
          vx *= 0.95;
          g.alpha = Math.max(0, g.alpha - dt * 2);
        },
      });
    }
  }

  ring(x: number, y: number, r: number, color: number): void {
    const g = new Graphics();
    g.position.set(x * TILE_PX, y * TILE_PX);
    this.fxLayer.addChild(g);
    let t = 0;
    this.fx.push({
      view: g, life: 0.35,
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 0.35);
        g.clear().circle(0, 0, r * TILE_PX * (0.4 + 0.6 * k)).stroke({ color, width: 2, alpha: 1 - k }).fill({ color, alpha: 0.25 * (1 - k) });
      },
    });
  }

  floatText(x: number, y: number, text: string, color: number): void {
    const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: 7, fill: color, stroke: { color: 0x000000, width: 2 } }, resolution: 6 });
    t.anchor.set(0.5);
    t.position.set(x * TILE_PX, y * TILE_PX);
    this.overWorld.addChild(t);
    this.fx.push({ view: t, life: 0.7, update: (dt) => { t.y -= 14 * dt; t.alpha = Math.max(0, t.alpha - dt * 1.3); } });
  }

  // ───────────────────────────── dev ─────────────────────────────

  private devKeys(): void {
    if (!import.meta.env.DEV) return;
    const i = this.input;
    if (i.keyPressed('f2')) {
      const all = registry.items.all().filter((d) => d.kind !== 'pickup');
      this.dropItem(createItem(all[Math.floor(Math.random() * all.length)]!.id));
    }
    if (i.keyPressed('f3')) this.addCash(50);
    if (i.keyPressed('f4')) for (const e of this.room.enemies) this.killEnemy(e, true);
    if (i.keyPressed('f6')) this.healPlayer(99);
    if (i.keyPressed('f7')) {
      const all = registry.furniture.all();
      const def = all[Math.floor(Math.random() * all.length)]!;
      const spot = this.room.layout.findFurnitureSpot(def, Math.floor(this.player.x), Math.floor(this.player.y));
      if (spot) {
        this.dispatch({ type: 'furniturePlaced', roomId: this.room.info.id, placement: { uid: uid(), defId: def.id, x: spot.x, y: spot.y, rot: 0, contents: def.container ? Array(def.container.slots).fill(null) : undefined } });
        this.furnitureChanged();
      }
    }
    if (i.keyPressed('f8')) this.changeFloor(1);
    if (i.keyPressed('shift+f10')) this.passTime(Math.max(0, 23 * 60 + 45 - getClock(this.session.state).minute));
    else if (i.keyPressed('f10')) this.passTime(60);
    if (i.keyPressed('f9') && confirm('Reset your world? This deletes all progress.')) this.session.resetWorld();
  }
}
