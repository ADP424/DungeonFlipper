import { registry } from '@df/shared';
import type { BehaviorCtx, MovementBehavior } from '../index';

type Phase = 'chase' | 'chargeWindup' | 'charge' | 'sweepWindup' | 'burst' | 'summon' | 'recover';

/**
 * The Bone Warden: a phase state machine.
 *  - chase: lumbers toward the player
 *  - charge: telegraphs, then dashes across the room
 *  - sweep: a fan of bones aimed at the player (a "blade shockwave")
 *  - burst: a ring of bones (twice when enraged)
 *  - summon (below 50% hp): raises skeletons
 */
export const facilityManager: MovementBehavior = (ctx: BehaviorCtx<{ summon?: string; bone?: string }>) => {
  const { game, e, dt, params, state } = ctx;
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const enraged = e.hp < e.maxHp * 0.5;
  const bone = registry.projectiles.get(params.bone ?? 'clipboard');
  state.phase ??= 'chase' as Phase;
  state.t ??= 2;
  state.t -= dt;
  e.telegraph = 0;

  const setPhase = (phase: Phase, t: number) => { state.phase = phase; state.t = t; };
  const fire = (a: number, speedMul = 1) =>
    game.spawnProjectile({ def: bone, team: 'enemy', x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), damage: 1, knockback: 0, speedMul });

  switch (state.phase as Phase) {
    case 'chase': {
      const dir = game.room.pathDir(e);
      const speed = e.def.speed * (enraged ? 1.3 : 1);
      e.vx = dir.x * speed;
      e.vy = dir.y * speed;
      if (state.t <= 0) {
        const options: Phase[] = ['chargeWindup', 'sweepWindup', 'burst'];
        if (enraged) options.push('summon');
        const next = options[Math.floor(Math.random() * options.length)]!;
        setPhase(next, next === 'chargeWindup' ? 0.8 : next === 'sweepWindup' ? 0.6 : 0.4);
        state.dx = dx / d;
        state.dy = dy / d;
        state.bursts = enraged ? 2 : 1;
      }
      break;
    }
    case 'chargeWindup':
      e.telegraph = state.t;
      state.dx = dx / d;
      state.dy = dy / d;
      if (state.t <= 0) setPhase('charge', 0.9);
      break;
    case 'charge':
      e.vx = state.dx * 10;
      e.vy = state.dy * 10;
      if (e.bumped) game.shake(0.25);
      if (state.t <= 0 || e.bumped) setPhase('recover', 0.8);
      break;
    case 'sweepWindup':
      e.telegraph = state.t;
      if (state.t <= 0) {
        const base = Math.atan2(dy, dx);
        const n = enraged ? 9 : 7;
        for (let i = 0; i < n; i++) fire(base + ((i - (n - 1) / 2) * Math.PI) / 14, 1.2);
        game.shake(0.15);
        setPhase('recover', 0.7);
      }
      break;
    case 'burst':
      e.telegraph = state.t;
      if (state.t <= 0) {
        const n = 14;
        const off = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) fire(off + (i / n) * Math.PI * 2, 0.8);
        state.bursts--;
        if (state.bursts > 0) setPhase('burst', 0.5);
        else setPhase('recover', 0.8);
      }
      break;
    case 'summon': {
      if (state.t <= 0) {
        const alive = game.room.enemies.filter((x) => !x.monsterId).length;
        for (let i = 0; i < 3 && alive + i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          game.spawnEnemy(params.summon ?? 'mannequin', e.x + Math.cos(a) * 1.6, e.y + Math.sin(a) * 1.6);
        }
        setPhase('recover', 1);
      }
      break;
    }
    case 'recover':
      if (state.t <= 0) setPhase('chase', 1.5 + Math.random());
      break;
  }
};
