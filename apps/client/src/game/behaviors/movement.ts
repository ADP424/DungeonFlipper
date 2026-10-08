import type { BehaviorCtx, MovementBehavior } from './index';

const toPlayer = ({ game, e }: BehaviorCtx) => {
  const dx = game.player.x - e.x, dy = game.player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { dx: dx / d, dy: dy / d, d };
};

/** Walk toward the player using the room's flow field (paths around walls and spikes). */
const walkChase: MovementBehavior = (ctx: BehaviorCtx<{ keepAway?: number }>) => {
  const { e, game, params } = ctx;
  const { d } = toPlayer(ctx);
  if (params.keepAway && d < params.keepAway) return;
  const dir = game.room.pathDir(e);
  e.vx = dir.x * e.def.speed;
  e.vy = dir.y * e.def.speed;
};

/** Sit still, then hop toward the player. Airborne while hopping. */
const hop: MovementBehavior = (ctx: BehaviorCtx<{ interval?: number; hopTime?: number; distance?: number }>) => {
  const { e, game, dt, params, state } = ctx;
  const interval = params.interval ?? 1, hopTime = params.hopTime ?? 0.45, distance = params.distance ?? 2;
  state.t = (state.t ?? Math.random() * interval) + dt;
  if (!state.hopping) {
    e.z = 0;
    e.airborne = false;
    if (state.t >= interval) {
      const dir = game.room.pathDir(e);
      const jitter = (Math.random() - 0.5) * 0.8;
      const a = Math.atan2(dir.y, dir.x) + jitter;
      state.dx = Math.cos(a);
      state.dy = Math.sin(a);
      state.hopping = true;
      state.t = 0;
    }
    return;
  }
  const p = state.t / hopTime;
  e.airborne = true;
  e.z = Math.sin(Math.min(1, p) * Math.PI) * 0.6;
  e.vx = state.dx * (distance / hopTime);
  e.vy = state.dy * (distance / hopTime);
  if (p >= 1) {
    state.hopping = false;
    state.t = 0;
    e.z = 0;
    e.airborne = false;
  }
};

/** Flit around unpredictably, drifting toward the player. */
const flyErratic: MovementBehavior = (ctx: BehaviorCtx<{ turnInterval?: number; chaseBias?: number }>) => {
  const { e, dt, params, state } = ctx;
  state.t = (state.t ?? 0) - dt;
  if (state.t <= 0 || e.bumped) {
    const { dx, dy } = toPlayer(ctx);
    const a = Math.random() * Math.PI * 2;
    const bias = params.chaseBias ?? 0.5;
    const vx = Math.cos(a) * (1 - bias) + dx * bias, vy = Math.sin(a) * (1 - bias) + dy * bias;
    const l = Math.hypot(vx, vy) || 1;
    state.dx = vx / l;
    state.dy = vy / l;
    state.t = (params.turnInterval ?? 0.5) * (0.6 + Math.random() * 0.8);
  }
  e.vx = state.dx * e.def.speed;
  e.vy = state.dy * e.def.speed;
};

/** Drift toward the player while bobbing side to side. */
const bobSine: MovementBehavior = (ctx: BehaviorCtx<{ amplitude?: number; frequency?: number }>) => {
  const { e, dt, params, state } = ctx;
  state.t = (state.t ?? Math.random() * 6) + dt;
  const { dx, dy, d } = toPlayer(ctx);
  const approach = d > 3 ? 1 : d < 2 ? -0.5 : 0;
  const side = Math.cos(state.t * (params.frequency ?? 1) * Math.PI * 2) * (params.amplitude ?? 1.5) * 2;
  e.vx = dx * e.def.speed * approach + -dy * side;
  e.vy = dy * e.def.speed * approach + dx * side;
};

/** Move tile-to-tile on the grid, pausing between steps. */
const gridStep: MovementBehavior = (ctx: BehaviorCtx<{ stepTime?: number; pause?: number }>) => {
  const { e, game, dt, params, state } = ctx;
  const stepTime = params.stepTime ?? 0.3, pause = params.pause ?? 0.25;
  if (!state.target) {
    state.wait = (state.wait ?? pause) - dt;
    // Snap to the current tile centre while waiting.
    const cx = Math.floor(e.x) + 0.5, cy = Math.floor(e.y) + 0.5;
    e.vx = (cx - e.x) * 8;
    e.vy = (cy - e.y) * 8;
    if (state.wait > 0) return;
    const next = game.room.nextGridStep(e);
    state.target = next ?? null;
    state.t = 0;
    state.wait = pause;
    if (!next) return;
  }
  state.t += dt;
  const tx = state.target.x + 0.5, ty = state.target.y + 0.5;
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  const speed = 1 / stepTime;
  if (d < 0.05 || state.t > stepTime * 2 || e.bumped) {
    state.target = null;
    return;
  }
  e.vx = (dx / d) * Math.min(speed, d / dt);
  e.vy = (dy / d) * Math.min(speed, d / dt);
};

/** Keep within a distance band from the player, strafing when comfortable. */
const keepDistance: MovementBehavior = (ctx: BehaviorCtx<{ min?: number; max?: number }>) => {
  const { e, game, dt, params, state } = ctx;
  const { dx, dy, d } = toPlayer(ctx);
  const min = params.min ?? 3, max = params.max ?? 5;
  state.strafe = state.strafe ?? (Math.random() < 0.5 ? 1 : -1);
  state.flip = (state.flip ?? 2) - dt;
  if (state.flip <= 0 || e.bumped) { state.strafe *= -1; state.flip = 1.5 + Math.random() * 2; }
  if (d > max) {
    const dir = game.room.pathDir(e);
    e.vx = dir.x * e.def.speed;
    e.vy = dir.y * e.def.speed;
  } else if (d < min) {
    e.vx = -dx * e.def.speed;
    e.vy = -dy * e.def.speed;
  } else {
    e.vx = -dy * state.strafe * e.def.speed * 0.6;
    e.vy = dx * state.strafe * e.def.speed * 0.6;
  }
};

/** Slowly approach, then telegraph and dash in a straight line. */
const charge: MovementBehavior = (ctx: BehaviorCtx<{ windup?: number; speed?: number; duration?: number; cooldown?: number; range?: number }>) => {
  const { e, game, dt, params, state } = ctx;
  state.phase ??= 'approach';
  state.cd = (state.cd ?? 1) - dt;
  const { dx, dy, d } = toPlayer(ctx);
  switch (state.phase) {
    case 'approach': {
      const dir = game.room.pathDir(e);
      e.vx = dir.x * e.def.speed;
      e.vy = dir.y * e.def.speed;
      if (state.cd <= 0 && d < (params.range ?? 7) && game.room.lineClear(e.x, e.y, game.player.x, game.player.y, 'walk')) {
        state.phase = 'windup';
        state.t = params.windup ?? 0.6;
        state.dx = dx;
        state.dy = dy;
      }
      break;
    }
    case 'windup':
      state.t -= dt;
      e.telegraph = state.t;
      if (state.t <= 0) { state.phase = 'dash'; state.t = params.duration ?? 0.6; e.telegraph = 0; }
      break;
    case 'dash':
      state.t -= dt;
      e.vx = state.dx * (params.speed ?? 9);
      e.vy = state.dy * (params.speed ?? 9);
      if (state.t <= 0 || e.bumped) { state.phase = 'approach'; state.cd = params.cooldown ?? 2; }
      break;
  }
};

/** Vanish and reappear somewhere else in the room. */
const teleport: MovementBehavior = (ctx: BehaviorCtx<{ interval?: number; minDist?: number }>) => {
  const { e, game, dt, params, state } = ctx;
  const interval = params.interval ?? 3;
  state.t = (state.t ?? interval * 0.5) - dt;
  if (state.fading) {
    e.alpha = Math.max(0, e.alpha - dt * 4);
    if (e.alpha <= 0) {
      const spot = game.room.randomOpenTile((x, y) => Math.hypot(x + 0.5 - game.player.x, y + 0.5 - game.player.y) >= (params.minDist ?? 3), e.movementKind);
      if (spot) { e.x = spot.x + 0.5; e.y = spot.y + 0.5; }
      state.fading = false;
    }
    return;
  }
  e.alpha = Math.min(1, e.alpha + dt * 3);
  if (state.t <= 0) {
    state.fading = true;
    state.t = interval;
  }
};

export const movement: Record<string, MovementBehavior> = {
  walkChase, hop, flyErratic, bobSine, gridStep, keepDistance, charge, teleport,
  /** Never moves. */
  stationary: () => {},
};
