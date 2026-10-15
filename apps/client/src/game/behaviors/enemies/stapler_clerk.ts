import { registry, shotTrajectory, type ProjectileDef } from '@df/shared';
import { shoot } from '../actions';
import { defineBrain, enter, type BrainCtx, type Phased } from '../brain';
import { between, chase, clearShot, flee, moveTo, rad, toPlayer, type Range } from '../steering';

interface Params {
  /** It picks spots between these distances from the player (tiles). */
  near: number;
  far: number;
  /** The player this close sends it looking for a new spot. */
  tooClose: number;
  /** Seconds it waits in its spot before stepping out. */
  hide: Range;
  /** Longest it spends stepping out for a shot before giving up (seconds). */
  peek: number;
  windup: number;
  projectile: string;
  /** Staples per burst, seconds between them, and degrees each may stray. */
  burst: number;
  burstGap: number;
  spread: number;
  damage: number;
}

interface State extends Phased<'relocate' | 'hide' | 'peek' | 'windup' | 'burst'> {
  projectile: ProjectileDef;
  /** Where it's heading (tile centre), if it found somewhere. */
  spot: { x: number; y: number } | null;
  until: number;
  /** Staples fired in the burst so far. */
  fired: number;
}

/** How many candidate spots it weighs up each time it moves. */
const CANDIDATES = 8;
/** Longest it walks toward a spot before settling for where it is (seconds). */
const RELOCATE_TIME = 2.5;

/**
 * A spot at range it can get to before it gives up walking (by the way round, not as the crow flies),
 * out of the player's line of fire if there is one: behind a pillar, around a corner, the far side of
 * some furniture.
 */
function findSpot({ game, e, params: p }: BrainCtx<Params>, projectile: ProjectileDef): { x: number; y: number } | null {
  const pl = game.player;
  const route = game.room.paths.field(e.movementKind, Math.floor(e.x), Math.floor(e.y));
  const reach = e.def.speed * RELOCATE_TIME;
  const shot = shotTrajectory(projectile, e.movementKind);
  let open: { x: number; y: number } | null = null;
  for (let i = 0; i < CANDIDATES; i++) {
    const t = game.room.randomOpenTile((x, y) => {
      const d = Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y);
      return d >= p.near && d <= p.far && game.room.roomIdAt(x, y) === e.roomId && route.at(x, y) <= reach;
    }, e.movementKind);
    if (!t) return null;
    const spot = { x: t.x + 0.5, y: t.y + 0.5 };
    if (!game.room.lineClear(spot.x, spot.y, pl.x, pl.y, shot)) return spot;
    open ??= spot;
  }
  return open;
}

/**
 * Finds cover at range, waits there, steps out until it has a shot, fires a burst of staples and
 * moves somewhere else. Get close and it runs for a new spot.
 */
export const staplerClerk = defineBrain<Params, State>({
  init: (p) => ({ phase: 'hide', t: 0, projectile: registry.projectiles.get(p.projectile), spot: null, until: between(p.hide), fired: 0 }),
  update(ctx, s) {
    const { e, dt, params: p } = ctx;
    s.t += dt;
    const { d, angle } = toPlayer(ctx);
    const relocate = () => {
      s.spot = findSpot(ctx, s.projectile);
      enter(s, 'relocate');
    };
    switch (s.phase) {
      case 'relocate':
        // Nowhere to go: just get away.
        if (!s.spot) flee(ctx);
        if ((s.spot && moveTo(ctx, s.spot.x, s.spot.y, e.def.speed, dt)) || s.t >= RELOCATE_TIME || (!s.spot && d >= p.near)) {
          s.spot = null;
          s.until = between(p.hide);
          enter(s, 'hide');
        }
        break;
      case 'hide':
        if (d < p.tooClose) relocate();
        else if (s.t >= s.until) enter(s, 'peek');
        break;
      case 'peek':
        if (d < p.tooClose) relocate();
        else if (clearShot(ctx, s.projectile)) enter(s, 'windup');
        else if (s.t >= p.peek) relocate();
        else chase(ctx);
        break;
      case 'windup':
        e.pose('windup', p.windup);
        if (s.t >= p.windup) {
          s.fired = 0;
          enter(s, 'burst');
        }
        break;
      case 'burst':
        // One staple at the start, then one every gap.
        while (s.fired < p.burst && s.t >= s.fired * p.burstGap) {
          shoot(ctx, s.projectile, angle + (Math.random() - 0.5) * rad(p.spread), { damage: p.damage });
          s.fired++;
        }
        if (s.fired >= p.burst) relocate();
        break;
    }
  },
});
