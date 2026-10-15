import { Sprite } from 'pixi.js';
import { TILE_PX, angleDiff, frameAt, registry, viewAt, type BodyView, type EnemyAnimDef, type EnemyDef } from '@df/shared';
import { frameKeys, tex } from '../../engine/assets';
import { moveAndCollide } from '../../engine/collision';
import { brains, type Brain } from '../behaviors';
import type { Game } from '../Game';
import { heldIn } from '../reach';
import { Actor, artPixel } from './Entity';

/** Draw order inside an enemy's view: a held item is behind the body when it's held away from the camera. */
const Z = { shadow: -2, behind: -1, body: 0, front: 1 };
/** Where a carried item sits (px from the middle of the body, on the side it faces), and how far it leans out. */
const CARRY = { x: 4, y: 4, lean: 0.25 };
/** How much of its width an enemy collides with, so it doesn't snag on every corner it brushes. */
export const FIT = 0.9;

/** How an enemy facing along `facing` is drawn: the view of its art that shows it, or its one drawing, unmirrored. */
const viewOf = (def: EnemyDef, facing: number): BodyView => (def.views ? viewAt(def.views, facing) : ['', false]);
/** Where a view's art is: a def's art keys are folders of one drawing per view when it has `views`. */
const viewKey = (key: string, view: string) => (view ? `${key}/${view}` : key);

/** The frame an animation shows `t` seconds in: at its own speed, or spread `over` a duration. Loops follow the clock. */
function frameOf(def: EnemyAnimDef, view: string, clock: number, t: number, over?: number): string {
  const frames = frameKeys(viewKey(def.frames, view));
  const at = over ? Math.floor((t / over) * frames.length) : frameAt(def.loop ? clock : t, def.speed ?? 'fast');
  return frames[def.loop ? at % frames.length : Math.min(frames.length - 1, at)]!;
}

export class Enemy extends Actor {
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  /** Roster record id; absent for transient enemies (summons), which are never persisted. */
  readonly monsterId?: string;
  /** The room it's in (its roster's owner); updated as it walks between rooms of an area. */
  roomId = '';
  private readonly brain: Brain;
  private readonly brainState: unknown;
  /** While airborne (hopping, etc.) the enemy ignores hazards and doesn't deal contact damage. */
  airborne = false;
  /** Set when the last move hit a wall. */
  bumped = false;
  /** Fade/teleport visibility, 0..1. Mostly faded, it can't be hit and doesn't hurt. */
  alpha = 1;
  /** Which way it faces (radians): toward the player, unless its brain says otherwise this frame. Its art shows it, if it has `views`. */
  facing = Math.PI / 2;
  /** Hits arriving within this many radians of its front are stopped (a shield); 0 unless its brain raises one this frame. */
  blockArc = 0;
  /** Whether touching it hurts this frame (its def's `contactDamage`); a brain can switch it off. */
  contact = true;
  private hazardCd = 0;
  age = 0;
  /** A realtor or their guard (P8): whose people they are. */
  realtorId?: string;
  /** Thugs on a raid for this realtor. */
  raidOf?: string;
  /** The enemy (entity id) that called this one in. */
  summonedBy?: number;
  /** Stands around minding its own business until provoked (a realtor's office). */
  passive = false;
  /** The animation showing, and the one its brain asked for this frame. */
  private anim: { name: string; def: EnemyAnimDef; t: number; over?: number } | null = null;
  private posed: { name: string; over?: number } | null = null;
  private readonly held?: Sprite;
  /** How far an aimed item is drawn back from where it would be, so it isn't inside a wall (see reach.ts). */
  private heldBack = { x: 0, y: 0 };

  constructor(defId: string, x: number, y: number, opts: { monsterId?: string; hpFrac?: number } = {}) {
    const def = registry.enemies.get(defId);
    super(viewKey(def.sprite, viewOf(def, Math.PI / 2)[0]), def.tint);
    this.def = def;
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    if (def.depth !== undefined) this.depth = def.depth / TILE_PX;
    this.team = 'enemy';
    this.movementKind = def.movementKind;
    this.maxHp = def.hp;
    this.hp = this.maxHp * (opts.hpFrac ?? 1);
    this.monsterId = opts.monsterId;
    this.light = def.light;
    this.brain = brains[def.ai.id]!;
    this.brainState = this.brain.init(def.ai.params ?? {});
    if (def.movementKind === 'fly') this.shadow.alpha = 0.6;
    if (def.held) {
      // Gripped by its bottom centre, like the player's items.
      this.held = new Sprite(tex(def.held.sprite));
      this.held.anchor.set(0.5, 1);
      this.view.sortableChildren = true;
      this.shadow.zIndex = Z.shadow;
      this.sprite.zIndex = Z.body;
      this.view.addChild(this.held);
    }
  }

  /** Can be hit: alive and not faded out. */
  get targetable(): boolean {
    return !this.dead && this.alpha >= 0.5;
  }

  /**
   * Show one of the def's animations this frame (call it every frame it should show; without a call
   * the enemy is back to its idle art). `over`: spread the frames over this many seconds, so a
   * wind-up's art keeps pace with however long the wind-up is, instead of playing at its own speed.
   */
  pose(name: string, over?: number): void {
    this.posed = { name, over };
  }

  /** Whether a hit travelling along (dirX, dirY) lands on its shield. */
  blocks(dirX: number, dirY: number): boolean {
    if (this.blockArc <= 0 || (!dirX && !dirY)) return false;
    return Math.abs(angleDiff(Math.atan2(-dirY, -dirX), this.facing)) <= this.blockArc / 2;
  }

  update(game: Game, dt: number): void {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    // Each frame starts from rest; the brain says what's different (see `Brain`).
    this.vx = this.vy = 0;
    this.blockArc = 0;
    this.contact = true;
    this.posed = null;
    const pl = game.player;
    if (!this.passive) {
      this.facing = Math.atan2(pl.y - this.y, pl.x - this.x);
      this.brain.update({ game, e: this, dt, params: this.def.ai.params ?? {} }, this.brainState);
    }
    this.animate(game.time, dt);

    const kn = this.knockStep(dt);
    const blocked = game.room.blockerFor(this.movementKind, 'enemy');
    const res = moveAndCollide(this.x, this.y, this.footing(FIT), this.vx * dt + kn.dx, this.vy * dt + kn.dy, blocked);
    this.bumped = res.hitX || res.hitY;
    this.x = res.x;
    this.y = res.y;
    if (this.held && this.def.held!.grip === 'aimed') {
      const reach = this.radius * TILE_PX;
      this.heldBack = heldIn(
        this.def.held!.sprite, 1, artPixel(this.x) + Math.cos(this.facing) * reach, artPixel(this.y) + Math.sin(this.facing) * reach,
        this.facing + Math.PI / 2, { x: artPixel(this.x), y: artPixel(this.y) }, (x, y) => game.room.blockedAt(x, y, this.movementKind, 'enemy'),
      );
    }

    if (!this.passive && this.def.contactDamage && this.contact && !this.airborne && this.alpha >= 0.5
      && Math.hypot(pl.x - this.x, pl.y - this.y) < pl.radius + this.radius) {
      game.hurtPlayer(this.def.contactDamage, this.x, this.y);
    }

    // Hazards (spikes) hurt walkers that are on the ground.
    this.hazardCd -= dt;
    if (!this.def.hazardImmune && !this.airborne && this.hazardCd <= 0) {
      const o = game.room.layout.obstacleAt(Math.floor(this.x), Math.floor(this.y));
      if (o?.hazard && o.hazard.affects.includes(this.movementKind)) {
        this.hazardCd = 0.6;
        game.damageEnemy(this, o.hazard.enemyDamage, 0, 0, 0);
      }
    }
  }

  /**
   * Start, continue or drop the animation the brain posed, and show its frame: the resting art when
   * nothing is posed, and on every other beat of a flickering animation, in the view for where it
   * faces. `clock`: the game's time, which loops and flickers run on, so they all change frame together.
   */
  private animate(clock: number, dt: number): void {
    const want = this.posed;
    const def = want && this.def.anims?.[want.name];
    if (!want || !def) this.anim = null;
    else if (this.anim?.name === want.name) this.anim.t += dt;
    else this.anim = { name: want.name, def, t: 0, over: want.over };
    const a = this.anim;
    const idle = this.def.anims?.idle;
    const [view, mirror] = viewOf(this.def, this.facing);
    if (a && !(a.def.flicker && frameAt(clock, a.def.flicker) % 2)) this.setSprite(frameOf(a.def, view, clock, a.t, a.over));
    else this.setSprite(idle ? frameOf(idle, view, clock, clock) : viewKey(this.def.sprite, view));
    this.sprite.scale.x = mirror ? -1 : 1;
  }

  override syncView(): void {
    super.syncView();
    this.sprite.alpha = this.alpha;
    this.shadow.alpha = this.alpha * (this.movementKind === 'fly' ? 0.5 : 1);
    if (this.movementKind === 'fly') this.sprite.y -= Math.round(4 + Math.sin(this.age * 6) * 1.5);
    this.view.zIndex = this.y + (this.z > 0 ? 0.01 : 0);
    this.syncHeld();
  }

  /**
   * The held item: `aimed` ones sit out in front and swing around the body with its facing (pointing
   * that way); `carried` ones stay upright in the hand on the side it faces. Either is drawn behind
   * the body when held away from the camera.
   */
  private syncHeld(): void {
    const held = this.held;
    if (!held) return;
    const lift = -artPixel(this.z) - this.bodyLift;
    const away = Math.sin(this.facing) < -0.3;
    held.alpha = this.alpha;
    held.zIndex = away ? Z.behind : Z.front;
    if (this.def.held!.grip === 'aimed') {
      const reach = this.radius * TILE_PX;
      held.position.set(Math.round(Math.cos(this.facing) * reach + this.heldBack.x), Math.round(Math.sin(this.facing) * reach + this.heldBack.y) + lift);
      held.rotation = this.facing + Math.PI / 2;
    } else {
      const side = Math.cos(this.facing) < 0 ? -1 : 1;
      held.position.set(CARRY.x * side, CARRY.y + lift);
      held.rotation = CARRY.lean * side;
    }
  }
}
