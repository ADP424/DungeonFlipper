import { beforeAll, describe, expect, it } from 'vitest';
import {
  RoomLayout, defaultPivot, footprint, isValidPivot, registerAllContent, registry, solidBoxes, turnAround, turnBox, turnPoint,
  type FurnitureDef, type FurniturePlacement, type RoomInfo, type RoomState,
} from '../src';

beforeAll(() => registerAllContent());

/** A bare def of a given footprint (optionally with a pivot), for turning tests. */
const piece = (w: number, h: number, pivot?: { x: number; y: number }): FurnitureDef =>
  ({ id: `t${w}x${h}`, name: 't', size: { w, h }, sprite: 'x', blocksMovement: [], blocksProjectiles: [], pivot }) as FurnitureDef;

/** The tiles a placement covers. */
const cells = (def: FurnitureDef, p: { x: number; y: number; rot: number }) => {
  const { w, h } = footprint(def, p.rot);
  const out: string[] = [];
  for (let y = p.y; y < p.y + h; y++) for (let x = p.x; x < p.x + w; x++) out.push(`${x},${y}`);
  return out.sort();
};

describe('furniture pivots', () => {
  it('picks a pivot from the shape', () => {
    expect(defaultPivot(1, 1)).toEqual({ x: 0.5, y: 0.5 });
    expect(defaultPivot(2, 2)).toEqual({ x: 1, y: 1 });
    expect(defaultPivot(3, 3)).toEqual({ x: 1.5, y: 1.5 });
    expect(defaultPivot(1, 2)).toEqual({ x: 0.5, y: 0.5 }); // a bed turns about its head
    expect(defaultPivot(2, 1)).toEqual({ x: 0.5, y: 0.5 }); // a sofa about its left end
    expect(defaultPivot(3, 2)).toEqual({ x: 1.5, y: 0.5 });
    expect(defaultPivot(2, 3)).toEqual({ x: 0.5, y: 1.5 });
  });

  it('only allows cell centres and grid corners', () => {
    expect(isValidPivot({ x: 0.5, y: 1.5 }, 1, 2)).toBe(true);
    expect(isValidPivot({ x: 1, y: 1 }, 2, 2)).toBe(true);
    expect(isValidPivot({ x: 1, y: 0.5 }, 2, 1)).toBe(false); // an edge midpoint
    expect(isValidPivot({ x: 0.25, y: 0.5 }, 1, 1)).toBe(false);
    expect(isValidPivot({ x: 2.5, y: 0.5 }, 2, 1)).toBe(false); // outside the footprint
  });

  it('turns points and boxes a quarter turn clockwise', () => {
    expect(turnPoint({ x: 0, y: 0 }, 2, 1, 1)).toEqual({ x: 1, y: 0 });
    expect(turnPoint({ x: 2, y: 1 }, 2, 1, 1)).toEqual({ x: 0, y: 2 });
    // A lamp's base box in a 16×16 tile, turned once: from the bottom middle to the left middle.
    expect(turnBox({ x: 5, y: 11, w: 6, h: 5 }, 16, 16, 1)).toEqual({ x: 0, y: 5, w: 5, h: 6 });
    for (const k of [0, 1, 2, 3]) {
      const b = turnBox({ x: 3, y: 4, w: 10, h: 2 }, 32, 16, k);
      expect(turnBox(b, k % 2 ? 16 : 32, k % 2 ? 32 : 16, 4 - k)).toEqual({ x: 3, y: 4, w: 10, h: 2 });
    }
  });

  it('turns a bed about its head', () => {
    const bed = piece(1, 2);
    const turned = turnAround(bed, 5, 5, 0, 1);
    expect(turned).toEqual({ x: 4, y: 5, rot: 1 });
    // The head's tile stays; the foot swings from below to the left.
    expect(cells(bed, { x: 5, y: 5, rot: 0 })).toEqual(['5,5', '5,6']);
    expect(cells(bed, turned)).toEqual(['4,5', '5,5']);
  });

  it('turns a 2×2 in place', () => {
    const d = piece(2, 2);
    let p = { x: 3, y: 7, rot: 0 };
    for (let i = 0; i < 4; i++) {
      p = turnAround(d, p.x, p.y, p.rot, 1);
      expect(cells(d, p)).toEqual(['3,7', '3,8', '4,7', '4,8']);
    }
  });

  it('comes back after four turns either way, for any size and pivot', () => {
    const shapes: [number, number, { x: number; y: number }?][] = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3], [3, 1], [4, 3], [2, 1, { x: 2, y: 1 }], [3, 2, { x: 0.5, y: 1.5 }]];
    for (const [w, h, pivot] of shapes) {
      const d = piece(w, h, pivot);
      for (const dir of [1, -1] as const) {
        let p = { x: 10, y: 20, rot: 0 };
        for (let i = 0; i < 4; i++) {
          p = turnAround(d, p.x, p.y, p.rot, dir);
          expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        }
        expect(p).toEqual({ x: 10, y: 20, rot: 0 });
      }
      // Turning one way then back is a no-op.
      const one = turnAround(d, 10, 20, 0, 1);
      expect(turnAround(d, one.x, one.y, one.rot, -1)).toEqual({ x: 10, y: 20, rot: 0 });
    }
  });

  it('keeps a cell-centre pivot on its tile', () => {
    const d = piece(3, 2);
    let p = { x: 0, y: 0, rot: 0 };
    for (let i = 0; i < 4; i++) {
      p = turnAround(d, p.x, p.y, p.rot, 1);
      expect(cells(d, p)).toContain('1,0'); // the default pivot (1.5, 0.5) is tile 1,0
    }
  });

  it('accepts every real piece of furniture', () => {
    for (const def of registry.furniture.all()) {
      if (def.pivot) expect(isValidPivot(def.pivot, def.size.w, def.size.h)).toBe(true);
    }
  });
});

describe('furniture collision', () => {
  const info: RoomInfo = { id: 'r', floor: 1, templateId: 'level1_lobby', mirrorX: false, mirrorY: false, cells: [{ cx: 0, cy: 0 }], doors: [], tags: [], difficulty: 0, expanded: false };
  const roomWith = (...furniture: FurniturePlacement[]) => {
    const st: RoomState = { id: 'r', floor: 1, ownerId: null, discovered: false, visited: false, monsters: [], barricades: {}, tileOverrides: {}, floorSurfaces: {}, wallSurfaces: {}, furniture, groundItems: [] };
    return new RoomLayout(info, st);
  };

  it('is the whole footprint by default', () => {
    const sofa = registry.furniture.get('sofa');
    expect(solidBoxes(sofa, { x: 3, y: 4, rot: 0 })).toEqual([{ x: 3, y: 4, w: 2, h: 1 }]);
    expect(solidBoxes(sofa, { x: 3, y: 4, rot: 1 })).toEqual([{ x: 3, y: 4, w: 1, h: 2 }]);
    const L = roomWith({ uid: 's', defId: 'sofa', x: 3, y: 4, rot: 0 });
    expect(L.blocksMovement(3, 4, 'walk')).toBe(true);
    expect(L.blocksMovement(4, 4, 'walk')).toBe(true);
    expect(L.solidsAt(4, 4, 'walk')).toEqual([{ x: 4, y: 4, w: 1, h: 1 }]);
  });

  it("lets you walk behind a lamp's pole, but not through its stand", () => {
    const L = roomWith({ uid: 'l', defId: 'floor_lamp', x: 5, y: 3, rot: 0 });
    // The stand covers the bottom of its tile only, so the tile isn't blocked as a whole (pathing).
    expect(L.blocksMovement(5, 3, 'walk')).toBe(false);
    const [stand] = L.solidsAt(5, 3, 'walk');
    expect(stand).toEqual({ x: 5 + 4 / 16, y: 3 + 10 / 16, w: 8 / 16, h: 5 / 16 });
    // Projectiles hit the stand, and pass over the floor behind it.
    expect(L.blocksProjectileAt(5.5, 3.8, 'straight')).toBe(false); // floor lamps let shots by (blocksProjectiles: [])
    expect(L.solidsAt(5, 2, 'walk')).toEqual([]);
  });

  it('stops projectiles only inside the solid boxes', () => {
    const L = roomWith({ uid: 'w', defId: 'dresser', x: 5, y: 3, rot: 0 });
    const blocks = registry.furniture.get('dresser').blocksProjectiles;
    for (const t of ['straight', 'lobbed'] as const) {
      expect(L.blocksProjectileAt(5.5, 3.5, t)).toBe(blocks.includes(t));
      expect(L.blocksProjectileAt(5.5, 2.9, t)).toBe(false);
    }
  });

  it('turns collision boxes with the piece', () => {
    const lamp = registry.furniture.get('floor_lamp');
    // Facing west, the stand is on the left of the tile.
    expect(solidBoxes(lamp, { x: 0, y: 0, rot: 1 })).toEqual([{ x: 1 / 16, y: 4 / 16, w: 5 / 16, h: 8 / 16 }]);
  });
});
