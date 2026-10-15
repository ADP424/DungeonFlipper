import type { MovementKind, Vec2 } from '@df/shared';
import { DistanceField } from '../engine/pathing';
import type { AreaRuntime } from './AreaRuntime';
import { FIT, type Enemy } from './entities/Enemy';

/** How many steps along its route a mover looks for the farthest tile it can head straight for. */
const LOOKAHEAD = 6;
/** How far ahead (tiles) `steer` makes sure a direction is open. */
const PROBE = 0.6;
/** Directions `steer` weighs up when the one it was asked for is blocked. */
const DIRECTIONS = 16;
/** How much `steer` prefers to keep going the way it already is, so it doesn't dither between two equal ways. */
const MOMENTUM = 0.15;
/** Fields not asked for in this many steps are dropped. */
const KEEP = 60;

const STOP: Vec2 = { x: 0, y: 0 };

/**
 * How monsters find their way around the active rooms. A goal tile gets a distance field per way of
 * moving (`DistanceField`: cheapest routes around whatever is impassable to that kind: walkers go round
 * walls, furniture, holes and hazards; flyers cross short walls, low furniture and holes, but not tall
 * walls). Fields are shared by everyone heading for the same tile, so the whole room chasing the player
 * costs one search, and they're rebuilt the moment the goal moves to another tile or the world changes
 * (any command). Nothing here moves anyone: brains ask for a direction and set their own velocity.
 */
export class Pathing {
  private fields = new Map<string, { field: DistanceField; used: number }>();
  private stamp = -1;
  private step = 0;

  constructor(private readonly area: AreaRuntime) {}

  /**
   * Once per step: `stamp` is the session's change count, and any change could have opened or closed a
   * way (furniture moved, a wall built, a barricade broken), so every field is dropped when it moves.
   */
  sync(stamp: number): void {
    this.step++;
    if (stamp !== this.stamp) {
      this.stamp = stamp;
      this.fields.clear();
      return;
    }
    for (const [key, f] of this.fields) if (this.step - f.used > KEEP) this.fields.delete(key);
  }

  /** Drop every field (the active rooms, and so the grid, changed). */
  invalidate(): void {
    this.fields.clear();
  }

  /** The distance field to a goal tile for a way of moving, built if nobody has asked for it yet. */
  field(kind: MovementKind, gx: number, gy: number): DistanceField {
    const key = `${kind}:${gx},${gy}`;
    let f = this.fields.get(key);
    if (!f) {
      const L = this.area.layout;
      const grid = { originX: L.originX, originY: L.originY, w: L.w, h: L.h };
      f = { field: new DistanceField(grid, gx, gy, (x, y) => this.area.passable(x, y, kind)), used: 0 };
      this.fields.set(key, f);
    }
    f.used = this.step;
    return f.field;
  }

  /** Length of the cheapest way between two points for a way of moving (Infinity if there's none). */
  distance(kind: MovementKind, ax: number, ay: number, bx: number, by: number): number {
    return this.field(kind, Math.floor(ax), Math.floor(ay)).at(Math.floor(bx), Math.floor(by));
  }

  /**
   * Unit direction for an enemy to take toward a point by the cheapest way round, or nothing once it's
   * there. In a clear line it heads straight for it; otherwise for the farthest tile along its route it
   * can reach in a straight line, so it cuts across open floor instead of zigzagging tile by tile. With
   * no way there at all it heads straight for it anyway, and presses up against whatever is in the way.
   */
  dirTo(e: Enemy, x: number, y: number): Vec2 {
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return STOP;
    const direct = { x: dx / d, y: dy / d };
    if (this.bodyClear(e, x, y)) return direct;
    const field = this.field(e.movementKind, Math.floor(x), Math.floor(y));
    let step = field.next(Math.floor(e.x), Math.floor(e.y));
    if (!step) return direct;
    let aim = step;
    for (let i = 1; i < LOOKAHEAD; i++) {
      step = field.next(step.x, step.y);
      if (!step || !this.bodyClear(e, step.x + 0.5, step.y + 0.5)) break;
      aim = step;
    }
    const ax = aim.x + 0.5 - e.x, ay = aim.y + 0.5 - e.y;
    const l = Math.hypot(ax, ay) || 1;
    return { x: ax / l, y: ay / l };
  }

  /**
   * The open direction nearest to the one wanted (`dx`, `dy`, a unit vector), for movement that isn't
   * going anywhere in particular (circling, backing off). The wanted one itself if nothing is in the way;
   * otherwise whichever of the directions round it has the most of it in, leaning toward the way the
   * enemy is already going. Nothing (stand still) when every open direction has less than `least` of it
   * in (from 1, only straight on, to -1, anything open).
   */
  steer(e: Enemy, dx: number, dy: number, least = -1): Vec2 {
    if (this.bodyClear(e, e.x + dx * PROBE, e.y + dy * PROBE)) return { x: dx, y: dy };
    const sp = Math.hypot(e.vx, e.vy);
    const mx = sp ? e.vx / sp : 0, my = sp ? e.vy / sp : 0;
    let best = STOP, bestScore = -Infinity;
    for (let i = 0; i < DIRECTIONS; i++) {
      const a = (i / DIRECTIONS) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const along = cx * dx + cy * dy;
      if (along < least) continue;
      const score = along + MOMENTUM * (cx * mx + cy * my);
      if (score <= bestScore || !this.bodyClear(e, e.x + cx * PROBE, e.y + cy * PROBE)) continue;
      best = { x: cx, y: cy };
      bestScore = score;
    }
    return best;
  }

  /**
   * Whether an enemy's footing could slide in a straight line until its feet are on a point: the strip
   * it stands on (`Enemy.footing`, as wide as it collides) swept along, its middle and both its ends, so
   * a way that clears a corner with its middle doesn't snag it by the shoulder.
   */
  bodyClear(e: Enemy, x: number, y: number): boolean {
    const { half, depth } = e.footing(FIT);
    const dx = x - e.x, dy = y - e.y, my = e.y - depth / 2;
    const kind = e.movementKind;
    const clear = (ox: number) => this.area.lineClear(e.x + ox, my, e.x + ox + dx, my + dy, kind);
    return clear(0) && clear(-half) && clear(half);
  }
}
