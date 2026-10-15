import { describe, expect, it } from 'vitest';
import { DistanceField } from '../src/engine/pathing';

/** A grid from rows of text: `#` blocked, anything else open. */
function grid(rows: string[]) {
  const passable = (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y]![x] !== '#';
  return { grid: { originX: 0, originY: 0, w: rows[0]!.length, h: rows.length }, passable };
}

/** Follow `next` from a tile to the goal; the tiles visited. */
function route(f: DistanceField, x: number, y: number): string[] {
  const out = [`${x},${y}`];
  for (let s = f.next(x, y); s && out.length < 100; s = f.next(s.x, s.y)) out.push(`${s.x},${s.y}`);
  return out;
}

describe('distance field', () => {
  it('measures the cheapest way, diagonals costing √2', () => {
    const { grid: g, passable } = grid(['.....', '.....', '.....']);
    const f = new DistanceField(g, 0, 0, passable);
    expect(f.at(0, 0)).toBe(0);
    expect(f.at(4, 0)).toBeCloseTo(4);
    expect(f.at(2, 2)).toBeCloseTo(2 * Math.SQRT2, 4);
    expect(f.at(4, 2)).toBeCloseTo(2 + 2 * Math.SQRT2, 4);
    expect(f.next(0, 0)).toBeNull();
  });

  it('goes round a wall, never through or across its corner', () => {
    const { grid: g, passable } = grid([
      '.....',
      '.###.',
      '.....',
    ]);
    const f = new DistanceField(g, 2, 0, passable);
    expect(f.at(1, 1)).toBe(Infinity);
    const r = route(f, 2, 2);
    expect(r.at(-1)).toBe('2,0');
    // Round an end of the wall, square past its corners: a diagonal past one would cut across it.
    expect(r.some((t) => t === '0,1' || t === '4,1')).toBe(true);
    expect(r).not.toContain('1,1');
    expect(f.at(2, 2)).toBeCloseTo(6, 4);
    expect(f.at(1, 2)).toBeCloseTo(5, 4);
  });

  it('leaves what is walled off unreachable', () => {
    const { grid: g, passable } = grid([
      '..#..',
      '..#..',
    ]);
    const f = new DistanceField(g, 0, 0, passable);
    expect(f.at(4, 1)).toBe(Infinity);
    expect(f.next(4, 1)).toBeNull();
  });

  it('reaches a goal standing on a blocked tile, and steps off a blocked start', () => {
    const { grid: g, passable } = grid([
      '.....',
      '..#..',
      '.....',
    ]);
    const f = new DistanceField(g, 2, 1, passable);
    expect(f.at(2, 1)).toBe(0);
    expect(f.at(0, 1)).toBeCloseTo(2);
    // Out of the field's own blocked middle: toward the goal from its start, then the goal itself.
    const to = new DistanceField(g, 0, 1, passable);
    expect(to.next(2, 1)).not.toBeNull();
  });
});
