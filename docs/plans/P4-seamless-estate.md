# P4: Seamless Estate

> **Status:** implemented (2026-10-08). Typecheck and all tests pass, and the flow was verified in a headless browser. A 46-room synthetic estate (9–12 rooms active at a time) ran at 40 fps, against 45 fps in a single room, in the same software renderer. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D2, D6, D16, D38, D43, D45, D49).

## Goal
Your connected property stops being a string of one-screen rooms. All the rooms you own that connect through doors (or knocked-through walls) form one continuous space. You walk between them with no screen change and no time cost, the camera follows you freely, and monsters that get in chase you from room to room. Unowned rooms stay one-screen combat rooms with door transitions. With a heavy tool you can knock down the structural wall between two of your rooms to open them into one space.

## Decisions (asked before starting)
- **Estate membership: all connected owned rooms** (via doors or openings, same floor), secure or not. Breached rooms stay in it and you fight there (D38).
- **Wall demolition is included in this phase** (D49).
- **Enclosure detection is deferred** (units and signs, D12), since its first consumer is tenants (P5).

## Architecture
- **Areas.** The runtime holds an **area**: one room for the dungeon, or the whole estate component for your property (`estateRooms(state, roomId)`: BFS over same-owner rooms through doors and openings).
- **`AreaLayout`** (shared, `world/area.ts`):
  - It composes the rooms' `RoomLayout`s behind the same query API (`kindAt`, `blocksMovement`, `obstacleAt`, `barricadeAt`, `canPlaceFurniture`, `nearestOpenFloor`…). Each tile resolves to the room whose cell contains it.
  - `roomAt(x, y)` gives the room for actions that dispatch commands (renovation, furniture, ground items, kills).
  - The *active* subset (see Streaming) defines `originX/Y/w/h` for pathing and shadows.
- **Streaming.**
  - Rooms whose cells intersect the camera view plus a margin of 1 cell are *active*. Each has a renderer, its roster's monsters, ground items and lights.
  - A room leaving the active set syncs its roster and destroys its views, list entries and views together (the CLAUDE.md rule).
  - Shadow maps and the flow field are rebuilt over the active bounds when the set changes.
- **Doors inside the area** connect continuously: the player and monsters walk through them, unless they're barricaded.
  - Doors to rooms outside the area are *exits* (screen transitions, as today).
  - Walking within the estate costs no time.
  - Crossing into another estate room updates `player.roomId` (`playerMoved`) and re-checks the midnight rule.
- **Monsters change rooms:** a monster crossing into another room of the area moves its roster record there (`monsterMoved`).
- **Camera:** free-follow inside the estate, clamped to the active bounds. Single dungeon rooms keep today's clamp.
- **Room boundaries overlay:** the phone toggle (D43) outlines each room's true cells.

## Structural walls (D43, D49)
- **Demolition:**
  - With a **heavy tool** (sledgehammer; tool param `structural`) in an owned, monster-free room, **hold left-click for 1.5 s** on a structural wall tile.
  - The tile must be between two rooms you own: a straight boundary segment, not a corner or next to a door.
  - Both wall tiles across the boundary come down (each room's ring tile, `tileSet null`). It costs 2 tool uses and can't be undone.
- **Openings:**
  - The passable boundary tile pairs between two rooms. They connect rooms just like doors, so they also link estate rooms.
  - In securing, an opening into a room with monsters is a monster source that can't be barricaded. You close it by building a wall in it (drywall or stud kit).
  - If the room on the other side is lost, the opening becomes frontier (D43).
- **Look:** structural walls stay visually distinct from built partitions (different wall sets, D49).

## Files (main)
- **Shared:**
  - new `world/area.ts` (`estateRooms`, `AreaLayout`, openings, boundary partner)
  - `world/securing.ts` (openings in door statuses)
  - `world/layout.ts` (roster placement near arbitrary tiles)
  - `world/commands.ts` (`monsterMoved`)
- **Client:**
  - `game/RoomRuntime.ts` → an area runtime (active rooms, exits, internal doors, flow field)
  - `game/Game.ts` (`loadArea`, streaming, per-tile room targeting, crossing rooms, wall demolition)
  - `render/Shadows.ts` (multi-room rebuild over the active bounds)
  - `game/entities/Player.ts` (hold-to-demolish)
  - `game/actions/tools.ts`, `ui/Phone.ts` (boundary overlay)

## Verification
- **Unit tests:**
  - `estateRooms` (doors and openings, owner and floor limits)
  - `AreaLayout` delegation and `roomAt`
  - openings in door statuses (source when the room behind has monsters)
  - `monsterMoved`
- **Manual (browser):**
  1. Claim two adjacent rooms, then walk between them: no transition, no time.
  2. The camera follows you across rooms, and the far room's lights and shadows render.
  3. Leaving into the dungeon is a normal transition (+15 min).
  4. A monster spilling into one estate room chases you into the next.
  5. Knock down the wall between two owned rooms and walk through the gap.
  6. Toggle the boundaries overlay.
  7. A large synthetic estate (~40 rooms) keeps the frame rate.
