# Furniture art, footprints and facings

> **Status:** done. Not a roadmap phase: an art-pipeline change made before the art pass. Follows the art folder work (`apps/client/art/`, README "Art").

## Goal
Furniture art can be any size and has depth. A tall lamp can be 16×24 pixels: it stands on one tile, its top reaches over the tile behind it, and you can walk behind its pole. Every piece of furniture turns by *facing* (drawn views, turned on the floor like a real object: south, north, and a side view mirrored for east and west) instead of spinning its image, and multi-tile pieces such as beds turn around a sensible pivot.

## Decisions
- **Three separate things per piece:**
  - The **footprint** (`size`): the tiles it's *on*.
  - The **art**: any size, standing on the footprint's bottom edge.
  - The **collision**: boxes within the footprint.

  A bed is on two tiles and solid across both. A tall lamp is on one tile, solid only at its base, and its extra art is purely visual.
- **Collision lives in the def**, next to the footprint, and is validated at startup. It's a list of boxes, not pixel masks.
- **Facings, not image rotation.** Every piece has a folder of views: south, north and side. Furniture mirrors east–west, so one side view serves both. Rotating sprite images is never used for furniture.
- **Pivots** decide how multi-tile pieces turn. They're chosen automatically from the shape, and a def can override one. Any rectangular footprint works.
- **Furniture first.** Obstacles (stairs, broken glass) and ground items can adopt the same art and collision rules later.
- **Gameplay is top-down; art is a picture.** Collision, pivots and light positions are top-down positions that turn with the piece. The art is never consulted for gameplay, except to pick what's under the mouse.

## Model

### Def
```ts
{
  size: { w: 1, h: 2 },          // footprint at facing 0, in tiles (as now)
  collision?: Box[],             // px within the facing-0 footprint; default: the whole footprint
  pivot?: { x: number; y: number }, // tiles within the facing-0 footprint; default: see Pivots
  height: 0.5,                   // tiles, for shadows (as now)
  light?: { ..., at?: { x: number; y: number } }, // px within the facing-0 footprint; default: centre
}
type Box = { x: number; y: number; w: number; h: number }; // art pixels
```
- **Facing-0 coordinates:** everything positional is given at facing 0 and turned with the footprint.
- **Validation:** boxes and `light.at` must lie inside the footprint, and `pivot` must be a valid pivot point (see Pivots).

### Facings
- **What a facing is:** `rot` 0–3, the number of quarter turns clockwise seen from above. 0 is `south` (facing the camera), 1 `west`, 2 `north`, 3 `east`.
- **Footprint:** an odd facing swaps the footprint's width and height (as now).
- **Saves don't change:** a placement still stores `x, y` (the top-left of its footprint in its current facing) and `rot`.

### Art
- **Layout:** `art/furniture/<id>/south.png`, `north.png` and `side.png`. Furniture mirrors east–west: `side.png` is drawn facing east, and facing west mirrors it. Each view is drawn for its facing's footprint: a 1×2 bed's `south.png` is about 16×32 and its `side.png` about 32×16.
- **Placement:** the art stands on the footprint's bottom edge, centred horizontally, and extends upward (and sideways) as far as it's drawn.
- **Fallbacks:** a missing `north` or `side` uses `south`. Only `south` is required; every piece can be turned, and gets the other views when it needs them.
- **Animation:** a facing can be a folder of numbered frames (`fridge/south/0.png`…), like any animation.
- **Errors:** the console reports at startup any piece without a `south` view.

### Pivots
- **What happens when a piece turns:** its footprint rotates a quarter turn around its pivot point, which stays put on the floor.
- **Where a pivot can be:**
  - A **cell centre** or a **grid corner**. Only those land every cell on another cell after a quarter turn.
  - An edge midpoint would put cells halfway between tiles, so it isn't allowed.
- **Default pivot:**
  - **Same parity** (both sides odd or both even): the footprint's centre, which is then a cell centre or a corner, so the piece turns in place.
  - **Mixed parity:** the valid point nearest the centre. Ties go to the top (the back of the piece at facing 0), then the left.

| Footprint | Default pivot | Turning clockwise |
|---|---|---|
| 1×1 | (0.5, 0.5), its cell | Turns in place |
| 2×2 | (1, 1), the centre corner | Turns in place, same four tiles |
| 1×2 (bed) | (0.5, 0.5), the top cell (the head) | The head stays, the foot swings to the left |
| 2×1 (sofa, table) | (0.5, 0.5), the left cell | The left end stays, the right swings down |
| 3×2 | (1.5, 0.5), the top-middle cell | That cell stays |

- **The maths:** turning clockwise maps a point `(px, py)` in a `w×h` box to `(h − py, px)` in the turned `h×w` box. Turning in place keeps `P = (x, y) + pivotIn(rot)` fixed, so the new top-left is `P − pivotIn(rot + 1)`. Four turns return the piece exactly where it started.
- **Collision and lights turn with it:** boxes and `light.at` rotate by the same mapping, in pixels within the footprint.

### Turning in the game
- **When:** turning happens while carrying (lift, scroll, set it down), as now. A placed piece is turned by picking it up.
- **Where the preview sits:** among placements whose footprint covers the tile in front of you and not the tile you're standing on, the one whose pivot is nearest the centre of the tile in front of you.
  - A bed you face north on gets its foot in front of you and its head beyond.
  - Scrolling swings it around that pivot instead of jumping about.
- **Not planned:** turning placed pieces without lifting them. The scroll wheel already cycles your main hand. If it's wanted later, the pivot maths already supports it.

## Systems
1. **Collision:**
   - Walls stay whole tiles. Furniture contributes its boxes, in tile units, through a new `RoomLayout.solidsAt(x, y, kind)`.
   - `moveAndCollide`, `overlapsBlocked` and `lineClear` test a body's box against those rects instead of whole tiles.
   - Projectiles use the same boxes for `blocksProjectiles`.
   - You can then stand in the top of a lamp's own tile, behind its pole.
2. **Monster pathfinding:** the flow field stays per tile. A tile is blocked for pathing if a box covers its centre, so a thin lamp base doesn't stop monsters routing through its tile.
3. **Draw order:**
   - Furniture sorts by the bottom edge of its collision boxes in its current facing; actors by their feet, as now.
   - Anyone whose feet are above that line is drawn behind the piece.
   - Tabletop pieces keep sorting just in front of their table.
4. **Clicking and hovering:**
   - Furniture is found by its visible pixels, front-most first, falling back to the tile.
   - Clicking the top of a tall lamp lifts it.
   - Hand tools that work on floors, walls and utilities keep targeting tiles.
5. **Shadows:**
   - **Occluder map:** the collision boxes at the def's `height`, so a lamp blocks light at its base.
     - **As built:** only pieces with a `collision` field use their boxes. The rest keep their art's outline, cut to their footprint, so a sofa still casts a sofa-shaped shadow and art drawn above a piece's tiles never blocks light.
   - **Surface map:** the art drawn at its height, as now, so tall art is lit as an upright object.
   - **Own light:** a lamp's own footprint still doesn't shade it.
6. **Lights:** a furniture light sits at `light.at` (turned with the facing) instead of a fixed spot in the tile.
7. **Rendering:** `buildFurnitureView` picks the facing's art (with fallbacks) and never rotates the image. The carried view and the placement preview use it too.
8. **Silhouettes:** shadow silhouettes come from the facing's art.

## Migration
- **Art:** each `art/furniture/<id>.png` becomes `art/furniture/<id>/south.png`, unchanged. For pieces that could be turned, the other three facings start as placeholder copies made by rotating the current image, so nothing looks broken. You then redraw those as real views. The README's art section lists them.
- **Defs:** existing defs need no new fields: default collision is the whole footprint, and default pivots are as above.
- **Saves:** no schema change. Placements keep `x, y, rot`, with `rot` now meaning a facing.
- **What you'd see:** current art fits its footprints, so nothing looks different except rotated pieces, which show their placeholder facings.

## Build steps
1. **Facings and art** (done): folder layout, fallbacks, migration of the existing art, `buildFurnitureView` with no image rotation. Includes startup validation.
2. **Pivots** (done): footprint, box and point turning in shared (`world/furniture.ts`), with tests for every footprint size and for four turns returning to the start. The carry preview picks its spot by pivot.
3. **Collision boxes** (done): `solidsAt`, box-based `moveAndCollide` / `overlapsBlocked` / `lineClear`, projectiles, the pathing rule. Tests for walking into the top of a lamp's tile.
4. **Draw order and picking** (done): sort key from boxes; pixel picking for furniture.
5. **Shadows and lights** (done): occluders from boxes; `light.at`.
6. **Docs** (done): CLAUDE.md (furniture model, art rules), README art section.

## Related, not in this plan
- **Walls and depth:** walls draw in their own layer under all actors, so an actor just north of a wall you built is drawn over it. Once things have height, walls should join the same depth sort.
- **Obstacles and ground items:** stairs, broken glass and the like could take the same art and collision model.
