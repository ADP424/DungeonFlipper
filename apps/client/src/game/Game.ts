import { Application, Container, Graphics, Text } from 'pixi.js';
import {
  CELL_H, CELL_W, HealthStack, Rng, TILE_PX, addToHotbar, canHold, countLeft, createItem, enforceSingleTileFiller,
  entryPoint, footprint, generateFloor, itemDef, registry, rollLoot, tileKey, uid,
  type Command, type FurniturePlacement, type HealthLayer, type Hotbar, type ItemInstance, type LightDef,
} from '@df/shared';
import { Input } from '../engine/input';
import { Lighting, type LightInstance } from '../render/Lighting';
import { ACTOR_HEIGHT, ShadowMaps, type ShadowBlob } from '../render/Shadows';
import { effects } from './actions/effects';
import type { ToolAction } from './actions/tools';
import { triggers } from './actions/triggers';
import { Enemy } from './entities/Enemy';
import { GroundItemEntity } from './entities/GroundItemEntity';
import { Player } from './entities/Player';
import { Projectile, type ProjectileInit } from './entities/Projectile';
import { RoomRuntime } from './RoomRuntime';
import type { Session } from './Session';
import { Ui } from '../ui/Ui';

const STEP = 1 / 60;
const AMBIENT_DUNGEON = 0x3a3644;
const AMBIENT_OWNED = 0x5a5250;

interface Fx { view: Container; life: number; update(dt: number): void }

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
  room!: RoomRuntime;
  rng = new Rng(Date.now() >>> 0);
  scale = 1;
  cam = { x: 0, y: 0 };
  private shakeT = 0;
  private fx: Fx[] = [];
  private acc = 0;
  private dying = 0;
  private toastCd = new Map<string, number>();
  private staticLights: LightInstance[] = [];
  private readonly shadows = new ShadowMaps();
  time = 0;

  constructor(readonly app: Application, readonly session: Session) {
    this.input = new Input(app.canvas);
    this.entityLayer.sortableChildren = true;
    this.world.addChild(this.floorLayer, this.wallLayer, this.entityLayer, this.fxLayer);
    this.lighting = new Lighting(app.screen.width, app.screen.height);
    app.stage.addChild(this.world, this.lighting.overlay, this.overWorld);
    this.player = new Player(this);
    this.player.view.sortableChildren = true;
    this.overWorld.addChild(this.player.overlay);
    this.ui = new Ui(this);
    this.resize();

    const p = session.player;
    this.player.x = p.x;
    this.player.y = p.y;
    this.loadRoom(p.roomId, false);
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
    // Fit one cell (the default room) to the screen.
    this.scale = Math.max(1, Math.min(w / (CELL_W * TILE_PX), h / (CELL_H * TILE_PX)));
    this.lighting.resize(w / this.scale, h / this.scale);
  }

  mouseWorld(): { x: number; y: number } {
    return {
      x: (this.input.mouseX / this.scale + this.cam.x) / TILE_PX,
      y: (this.input.mouseY / this.scale + this.cam.y) / TILE_PX,
    };
  }

  private frame(dt: number): void {
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
    const L = this.room.layout;
    const rx = L.originX * TILE_PX, ry = L.originY * TILE_PX, rw = L.w * TILE_PX, rh = L.h * TILE_PX;
    const px = this.player.x * TILE_PX, py = this.player.y * TILE_PX;
    this.cam.x = rw <= viewW ? rx + rw / 2 - viewW / 2 : Math.max(rx, Math.min(rx + rw - viewW, px - viewW / 2));
    this.cam.y = rh <= viewH ? ry + rh / 2 - viewH / 2 : Math.max(ry, Math.min(ry + rh - viewH, py - viewH / 2));
  }

  private render(dt: number): void {
    this.resize();
    this.updateCamera();
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      sx = (Math.random() - 0.5) * 6 * this.shakeT;
      sy = (Math.random() - 0.5) * 6 * this.shakeT;
    }
    for (const c of [this.world, this.overWorld]) {
      c.scale.set(this.scale);
      c.position.set(Math.round((-this.cam.x + sx) * this.scale), Math.round((-this.cam.y + sy) * this.scale));
    }
    this.player.syncView();
    for (const e of this.room.enemies) e.syncView();
    for (const p of this.room.projectiles) p.syncView();
    for (const i of this.room.items) i.syncView();
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
    for (const f of this.room.layout.state.furniture) {
      const def = registry.furniture.get(f.defId);
      if (def.light) add(f.x + footprint(def, f.rot).w / 2, f.y + 0.4, def.light, f.x * 31 + f.y);
    }
    return out;
  }

  /** Moving things that cast shadows: the player and visible enemies. */
  private shadowBlobs(): ShadowBlob[] {
    const out: ShadowBlob[] = [];
    if (this.player.view.visible) out.push({ x: this.player.x, y: this.player.y, r: this.player.radius, h: ACTOR_HEIGHT });
    for (const e of this.room.enemies) {
      if (!e.dead && e.alpha > 0.2) out.push({ x: e.x, y: e.y, r: e.radius, h: ACTOR_HEIGHT * (e.def.scale ?? 1) });
    }
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

    const room = this.room;
    room.player = this.player;
    room.updateFlow(dt);
    this.player.update(dt);

    for (const e of room.enemies) if (!e.dead) e.update(this, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateItems(dt);
    this.updateFx(dt);
    this.cleanup();
    this.checkRoomClear();
    this.checkTransitions();
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
      if (def.id === 'gold') this.floatText(it.x, it.y, `+${inst.data.amount ?? 1}`, 0xffd34a);
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
        this.dispatch({ type: 'groundItemAdded', roomId: this.room.info.id, item: structuredClone(it.data) });
      }
      return;
    }
    this.setHotbar(hb);
    this.removeGroundItem(it);
    this.toast(`Picked up ${def.name}`);
  }

  private removeGroundItem(it: GroundItemEntity): void {
    it.dead = true;
    this.dispatch({ type: 'groundItemRemoved', roomId: this.room.info.id, uid: it.data.uid });
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
    if (r.owned) return;
    if (r.enemies.some((e) => e.spawnId && !e.dead)) return;
    if (r.layout.liveSpawns().length > 0) return;
    this.dispatch({ type: 'roomOwned', roomId: r.info.id });
    for (const e of r.enemies) if (!e.spawnId) this.killEnemy(e, false);
    this.ui.banner('Room claimed!', 'This room is now your property.');
    void this.session.flush();
  }

  private checkTransitions(): void {
    const pl = this.player;
    const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
    const key = tileKey(tx, ty);
    if (!this.room.layout.containsTile(tx, ty)) {
      const door = this.room.exits.get(key);
      if (door) {
        this.loadRoom(door.toRoom, true);
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
    const info = st.floors[p.floor]!.rooms[roomId]!;
    const roomState = st.rooms[roomId]!;
    if (this.room) {
      this.room.destroy();
      this.floorLayer.removeChildren();
      this.wallLayer.removeChildren();
    }
    // Effects belong to the room they happened in: drop them from the update list *and* destroy
    // their views together, so nothing updates a destroyed view.
    for (const f of this.fx) f.view.destroy({ children: true });
    this.fx = [];
    this.fxLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.player.swing = null;
    this.room = new RoomRuntime(info, roomState, this.entityLayer);
    this.room.player = this.player;
    this.room.exitAllowed = (door) => {
      if (!this.session.player.carrying) return true;
      if (st.rooms[door.toRoom]?.owned) return true;
      this.toast("You can't carry furniture into rooms you don't own", 'carry');
      return false;
    };
    this.floorLayer.addChild(this.room.renderer.floor);
    this.wallLayer.addChild(this.room.renderer.walls);
    if (!this.player.view.parent) this.entityLayer.addChild(this.player.view);

    const hpMul = (boss: boolean) => (boss ? 1 + 0.5 * (p.floor - 1) : 1 + 0.15 * (p.floor - 1));
    for (const s of this.room.layout.liveSpawns()) {
      const e = new Enemy(s.enemy, s.x, s.y, { spawnId: s.spawnId, hpMul: hpMul(!!registry.enemies.get(s.enemy).boss) });
      this.addEnemy(e);
    }
    for (const g of roomState.groundItems) this.addGroundItem(new GroundItemEntity(structuredClone(g)));
    this.rebuildStaticLights();
    this.player.lastTile = tileKey(Math.floor(this.player.x), Math.floor(this.player.y));
    this.player.kx = this.player.ky = 0;
    if (record || !roomState.visited) {
      this.dispatch({ type: 'playerMoved', playerId: this.session.playerId, floor: p.floor, roomId, x: this.player.x, y: this.player.y });
    }
    this.ui.onRoomChanged();
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
    const roomId = delta > 0 ? floor.entryRoomId : floor.stairsDownRoomId;
    if (!roomId) return;
    const stairsId = delta > 0 ? 'stairs_up' : 'stairs_down';
    p.floor = target;
    const probe = new RoomRuntime(floor.rooms[roomId]!, st.rooms[roomId]!, new Container());
    const L = probe.layout;
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
    probe.destroy();
    const e = entryPoint(floor);
    this.player.x = spot?.x ?? e.x;
    this.player.y = spot?.y ?? e.y;
    this.loadRoom(roomId, true);
    this.ui.banner(`Floor ${target}`, delta > 0 ? 'Deeper into the dungeon…' : 'Back up the stairs.');
  }

  // ───────────────────────────── combat ─────────────────────────────

  addEnemy(e: Enemy): Enemy {
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
    if (e.spawnId) this.dispatch({ type: 'enemyKilled', roomId: this.room.info.id, spawnId: e.spawnId });
    if (drops && e.def.lootTable) this.spawnLoot(e);
    if (e.def.boss) {
      this.shake(0.6);
      for (const x of this.room.enemies) if (!x.spawnId) this.killEnemy(x, false);
    }
  }

  private spawnLoot(e: Enemy): void {
    const table = registry.lootTables.get(e.def.lootTable!);
    const results = enforceSingleTileFiller(rollLoot(table, this.rng));
    for (const r of results) {
      if (r.kind === 'furniture') {
        const def = registry.furniture.get(r.furniture);
        const spot = this.room.layout.findFurnitureSpot(def, Math.floor(e.x), Math.floor(e.y));
        if (!spot) continue;
        this.dispatch({ type: 'furniturePlaced', roomId: this.room.info.id, placement: { uid: uid(), defId: def.id, x: spot.x, y: spot.y, rot: 0 } });
        this.furnitureChanged();
        this.burst(spot.x + 0.5, spot.y + 0.5, 0xffe0a0, 10);
        continue;
      }
      const inst = r.kind === 'gold' ? createItem('gold', uid(), { amount: r.amount }) : createItem(r.item);
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
    this.dispatch({ type: 'groundItemAdded', roomId: this.room.info.id, item: g });
    return this.addGroundItem(new GroundItemEntity(structuredClone(g), from));
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

  addGold(n: number): void {
    const p = this.session.player;
    this.dispatch({ type: 'playerUpdated', playerId: p.id, patch: { gold: p.gold + n } });
  }

  private killPlayer(): void {
    const p = this.session.player;
    // Carried furniture is set down where you fell (it never leaves the world).
    if (p.carrying) {
      const def = registry.furniture.get(p.carrying.defId);
      const spot = this.room.layout.findFurnitureSpot(def, Math.floor(this.player.x), Math.floor(this.player.y), p.carrying.rot);
      if (spot) this.dispatch({ type: 'furniturePlaced', roomId: this.room.info.id, placement: { ...p.carrying, x: spot.x, y: spot.y } });
    }
    this.dying = 1.6;
    this.burst(this.player.x, this.player.y, 0xd8323c, 24);
    this.player.view.visible = false;
    this.ui.banner('You died', 'Everything you carried is lost. Your gold and property remain.');
  }

  private respawn(): void {
    const st = this.session.state;
    const floor1 = st.floors[1]!;
    const e = entryPoint(floor1);
    this.dispatch({
      type: 'playerDied',
      playerId: this.session.playerId,
      respawn: { floor: 1, roomId: e.roomId, x: e.x, y: e.y },
      redHalves: this.session.player.baseRedMaxHalves,
    });
    this.player.refreshStats();
    this.player.x = e.x;
    this.player.y = e.y;
    this.player.iframes = 1.5;
    this.player.view.visible = true;
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
    if (!this.room.owned) return;
    this.dispatch({ type: 'furnitureRemoved', roomId: this.room.info.id, uid: f.uid });
    this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { carrying: structuredClone(f) } });
    this.furnitureChanged();
    this.ui.closeStorage();
  }

  placeCarried(x: number, y: number): void {
    const c = this.session.player.carrying;
    if (!c) return;
    this.dispatch({ type: 'furniturePlaced', roomId: this.room.info.id, placement: { ...c, x, y } });
    this.dispatch({ type: 'playerUpdated', playerId: this.session.playerId, patch: { carrying: null } });
    this.furnitureChanged();
  }

  private furnitureChanged(): void {
    this.room.layout.rebuildFurniture();
    this.room.renderer.syncFurniture();
    this.shadows.rebuild(this.room.layout, this.app.renderer);
  }

  openStorage(furnitureUid: string): void {
    const f = this.room.layout.state.furniture.find((x) => x.uid === furnitureUid);
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
    const f = this.room.layout.state.furniture.find((x) => x.uid === furnitureUid);
    if (!f) return;
    this.dispatch({ type: 'furnitureUpdated', roomId: this.room.info.id, placement: { ...f, contents } });
  }

  useTool(x: number, y: number, tool: { action: ToolAction; params: Record<string, unknown> }, cost: number): void {
    const hb = structuredClone(this.session.player.hotbar);
    const item = hb.main!;
    tool.action.apply(this, x, y, tool.params, item);
    item.data.count = countLeft(item) - cost;
    if (countLeft(item) <= 0) {
      this.toast(`Your ${itemDef(item).name} is used up`);
      hb.main = null;
    }
    this.setHotbar(hb);
  }

  setTile(x: number, y: number, obstacle: string | null): void {
    this.dispatch({ type: 'tileSet', roomId: this.room.info.id, x, y, obstacle });
    this.room.renderer.rebuild();
    this.rebuildStaticLights();
  }

  setSurface(x: number, y: number, layer: 'floor' | 'wall', surface: string | null): void {
    this.dispatch({ type: 'surfaceSet', roomId: this.room.info.id, x, y, layer, surface });
    this.room.renderer.rebuild();
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
    if (i.keyPressed('f3')) this.addGold(50);
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
    if (i.keyPressed('f9') && confirm('Reset your world? This deletes all progress.')) this.session.resetWorld();
  }
}
