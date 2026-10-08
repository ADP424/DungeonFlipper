import { TILE_PX, registry, type EnemyDef } from '@df/shared';
import { moveAndCollide } from '../../engine/collision';
import { attackBehaviors, movementBehaviors, type BehaviorState } from '../behaviors';
import type { Game } from '../Game';
import { Actor } from './Entity';

export class Enemy extends Actor {
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  /** Template spawn id (persistent kill tracking). Summoned enemies have none. */
  readonly spawnId?: string;
  readonly moveState: BehaviorState = {};
  readonly attackStates: BehaviorState[];
  /** While airborne (hopping, etc.) the enemy ignores hazards and doesn't deal contact damage. */
  airborne = false;
  /** Set when the last move hit a wall. */
  bumped = false;
  /** Fade/teleport visibility, 0..1. */
  alpha = 1;
  /** Telegraph glow while winding up an attack. */
  telegraph = 0;
  private hazardCd = 0;
  age = 0;

  constructor(defId: string, x: number, y: number, opts: { spawnId?: string; hpMul?: number } = {}) {
    const def = registry.enemies.get(defId);
    super(def.sprite, def.scale ?? 1, def.tint);
    this.def = def;
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    this.team = 'enemy';
    this.movementKind = def.movementKind;
    this.hp = this.maxHp = def.hp * (opts.hpMul ?? 1);
    this.spawnId = opts.spawnId;
    this.light = def.light;
    this.attackStates = def.attacks.map(() => ({}));
    if (def.movementKind === 'fly') this.shadow.alpha = 0.6;
  }

  update(game: Game, dt: number): void {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.vx = this.vy = 0;
    const move = movementBehaviors[this.def.movement.id];
    move?.({ game, e: this, dt, params: this.def.movement.params ?? {}, state: this.moveState });
    this.def.attacks.forEach((a, i) => {
      attackBehaviors[a.id]?.({ game, e: this, dt, params: a.params ?? {}, state: this.attackStates[i]! });
    });

    const kn = this.knockStep(dt);
    const blocked = game.room.blockerFor(this.movementKind, 'enemy');
    const res = moveAndCollide(this.x, this.y, this.radius * 0.9, this.vx * dt + kn.dx, this.vy * dt + kn.dy, blocked);
    this.bumped = res.hitX || res.hitY;
    this.x = res.x;
    this.y = res.y;

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

  override syncView(): void {
    super.syncView();
    this.sprite.alpha = this.alpha;
    this.shadow.alpha = this.alpha * (this.movementKind === 'fly' ? 0.5 : 1);
    if (this.telegraph > 0 && this.flash <= 0) this.sprite.tint = Math.floor(this.telegraph * 10) % 2 ? 0xffffff : 0xffa0a0;
    if (this.movementKind === 'fly') this.sprite.y -= 4 + Math.sin(this.age * 6) * 1.5;
    this.view.zIndex = this.y + (this.z > 0 ? 0.01 : 0);
    void TILE_PX;
  }
}
