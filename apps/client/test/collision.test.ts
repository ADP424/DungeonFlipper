import { describe, expect, it } from 'vitest';
import { moveAndCollide, type Footing, type Solid } from '../src/engine/collision';

describe('footing collision', () => {
  // A wall on tile (5, 4) that stands on the south half of its tile.
  const wall: Solid = { x: 5, y: 4.5, w: 1, h: 0.5 };
  const solids = (tx: number, ty: number) => (tx === 5 && ty === 4 ? [wall] : []);
  const feet: Footing = { half: 0.3, depth: 2 / 16 };

  it('walks up to a base from the front, a footing short of it', () => {
    const r = moveAndCollide(5.5, 6, feet, 0, -3, solids);
    expect(r.hitY).toBe(true);
    expect(r.y).toBeCloseTo(5 + feet.depth, 3);
  });

  it('steps behind what rises above the base, up to its back edge', () => {
    const r = moveAndCollide(5.5, 3, feet, 0, 3, solids);
    expect(r.hitY).toBe(true);
    expect(r.y).toBeCloseTo(4.5, 3);
    // Its position is never inside the solid.
    expect(r.y).toBeLessThan(wall.y);
  });

  it('is as wide as its footing from the side', () => {
    const r = moveAndCollide(3, 4.9, feet, 3, 0, solids);
    expect(r.hitX).toBe(true);
    expect(r.x).toBeCloseTo(5 - feet.half, 3);
    // Behind the base there's nothing to bump into.
    expect(moveAndCollide(3, 4.4, feet, 3, 0, solids).hitX).toBe(false);
  });

  it("doesn't tunnel through a thin solid at speed", () => {
    expect(moveAndCollide(5.5, 3, feet, 0, 2.9, solids).y).toBeCloseTo(4.5, 3);
  });
});
