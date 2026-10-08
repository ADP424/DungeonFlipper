import { registry } from '@df/shared';
import type { AttackBehavior, BehaviorCtx } from './index';

/** Damage the player on touch (the default for most enemies). */
const contact: AttackBehavior = ({ game, e, params }: BehaviorCtx<{ damage?: number }>) => {
  if (e.airborne || e.alpha < 0.5) return;
  const p = game.player;
  if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) game.hurtPlayer(params.damage ?? 1, e.x, e.y);
};

/** Fire a projectile at the player on a cooldown (straight shots need line of sight; lobs don't). */
const shootAtPlayer: AttackBehavior = (ctx: BehaviorCtx<{ projectile: string; cooldown?: number; damage?: number; initialDelay?: number; count?: number; spread?: number }>) => {
  const { game, e, dt, params, state } = ctx;
  state.cd = (state.cd ?? params.initialDelay ?? 1) - dt;
  if (state.cd > 0 || e.alpha < 0.9) return;
  const def = registry.projectiles.get(params.projectile);
  const p = game.player;
  const dist = Math.hypot(p.x - e.x, p.y - e.y);
  if (dist > 11) return;
  if (def.trajectory === 'straight' && !game.room.lineClear(e.x, e.y, p.x, p.y, 'straight')) {
    state.cd = 0.3;
    return;
  }
  state.cd = (params.cooldown ?? 2) * (0.85 + Math.random() * 0.3);
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  const count = params.count ?? 1;
  const spread = ((params.spread ?? 15) * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * spread;
    game.spawnProjectile({
      def, team: 'enemy', x: e.x, y: e.y - 0.1, dx: Math.cos(a), dy: Math.sin(a),
      damage: params.damage ?? 1, knockback: 0, targetX: p.x, targetY: p.y,
    });
  }
};

/** Projectiles in a ring. */
const radialBurst: AttackBehavior = (ctx: BehaviorCtx<{ projectile: string; count?: number; cooldown?: number; damage?: number; initialDelay?: number }>) => {
  const { game, e, dt, params, state } = ctx;
  state.cd = (state.cd ?? params.initialDelay ?? 1.5) - dt;
  if (state.cd > 0 || e.alpha < 0.9) return;
  state.cd = params.cooldown ?? 3;
  const def = registry.projectiles.get(params.projectile);
  const n = params.count ?? 8;
  const off = Math.random() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    game.spawnProjectile({ def, team: 'enemy', x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), damage: params.damage ?? 1, knockback: 0 });
  }
};

/** Summon minions (not persistent: they vanish if you leave the room). */
const summon: AttackBehavior = (ctx: BehaviorCtx<{ enemy: string; cooldown?: number; max?: number; count?: number }>) => {
  const { game, e, dt, params, state } = ctx;
  state.cd = (state.cd ?? params.cooldown ?? 5) - dt;
  if (state.cd > 0) return;
  state.cd = params.cooldown ?? 5;
  const alive = game.room.enemies.filter((x) => !x.spawnId && x.def.id === params.enemy).length;
  for (let i = 0; i < (params.count ?? 1) && alive + i < (params.max ?? 3); i++) {
    game.spawnEnemy(params.enemy, e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2);
  }
};

export const attacks: Record<string, AttackBehavior> = { contact, shootAtPlayer, radialBurst, summon };
