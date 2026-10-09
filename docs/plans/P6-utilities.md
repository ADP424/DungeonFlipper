# P6: Utilities

> **Status:** done. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D19, D21, D22, D25).

## Goal
Your property needs power and water. Lamps in your rooms go dark until you wire them to a generator, sinks need pipes to a water main, and tenants pay more for (and sometimes insist on) working utilities. Pipes and wires are a hidden layer you lay with tools and see in x-ray while holding one. Now and then a segment fails: a puddle or sparks on its tile give it away, and everything past it is cut off until you fix it.

## Decisions (P6)
- **Q1 Lamps need power.** Electric fixtures (the floor lamp, desk lamp, work light and space heater, plus new appliances) only work when supplied.
  - **Decided without asking:** rooms nobody owns run on the Backrooms' own hum, so their lights stay on, and so does your apartment (the landlord's supply). Once a room is yours, it's on your grid. This keeps the dungeon's atmosphere and makes claiming a room a visible moment.
- **Q2 Networks are unlimited.** Anything connected to a source of its kind works; sources are the only gate.
- **Q3 Utilities raise rent, and some tenants require them.** Each utility a unit has adds to every tenant's valuation. Some applicants need power or running water and won't pay anything without it. Living tenants who need one lose mood each day it's missing.
- **Q4 Random faults, traced and repaired.** Each 15-minute tick, a segment in your property may fail (rarely). The fault shows a symptom on its tile (a puddle for water, sparks for power) and cuts everything downstream. The matching tool repairs it for one use.

## Model
- **Kinds:** `power`, `water`.
- **Layer:** `RoomState.utilities?: Record<"x,y", { power?: Segment; water?: Segment }>`, with `Segment = { fault?: true }`. It's a diff like surfaces: it never blocks anything and can run through floors, walls and doors. Tiles are global, so runs cross room boundaries (two adjacent wall tiles of neighbouring rooms connect).
- **Sources and fixtures:** `FurnitureDef.utility = { provides?: kind; needs?: kind }`.
  - A source or fixture connects to a segment on any tile of its footprint or orthogonally next to it.
  - **Served tiles:** a flood fill from source-connected segments through 4-neighbouring healthy segments. A faulty segment is a gap.
  - **A fixture is supplied** if it needs nothing, it's on the apartment floor, its room has no owner, or it touches a served tile.
- **Sources:**
  - Every Backrooms lobby gets a generator and a water main at generation.
  - Other rooms with difficulty ≥ 2 have a 7% chance of one source (either kind), so finding and claiming them is a reason to expand.
  - Sources are fixed furniture.
- **Commands:** `utilityLaid { roomId, x, y, kind }`, `utilityRemoved { … }`, `utilityFault { …, fault: boolean }` (`fault: false` is the repair).
- **Resolver:** a tick resolver `utilities`. Each healthy segment in an owned room, outside the apartment, fails with `FAULT_CHANCE`. If it was serving something, the owner gets a message naming the room, not the tile, so you trace it.
- **Tenants:**
  - `UnitStats` gains `power` and `water`: is a served tile on or next to the unit.
  - The `light` tag only counts supplied lights.
  - Valuation × (1 + 0.15 per utility).
  - New pref kind `utility` (key `power` / `water`): about 40% of applicants need one. If it's unmet, their valuation is 0, and living tenants lose 10 mood a day while it's missing.

## Content
- **Tools:** `wire_spool` (lays wire, 40 uses, $8) and `pipe_bundle` (lays pipe, 40 uses, $8). The apartment stash starts with one of each.
  - Lay by clicking, or hold and drag along tiles.
  - Using one on a faulty segment repairs it.
- **Furniture:**
  - Sources: `generator` (power) and `water_main` (water), both fixed.
  - Fixtures: `sink` and `toilet` (water), `fridge` (power). All sold in the Hardware app and found in furniture slots.
  - Lamps gain `utility.needs = 'power'`.

## Client
- **X-ray:** while either hand holds a utility tool, the active rooms' segments of that kind are drawn in place.
  - Served segments are bright and unserved ones dim; faults show a red ✕.
  - Sources and the fixtures that need that kind are outlined: green if supplied, red if not.
- **Symptoms are always visible:** puddles under faulty pipes, sparks flickering on faulty wires.
- **Lights:** furniture lights only shine when supplied (the network is recomputed whenever the world changes). Setting an unpowered lamp down in your property gives a hint.
- **Tenant panel and phone contact card:** they show whether the place has power and water, and the new preferences.

## As built
- Code: `world/utilities.ts` (networks, supply, the fault resolver), the `layUtility` tool action (`repeat`: keeps laying while you drag), `Game.drawUtilities` (x-ray + symptoms), `Game.supplied` (cached per world change, used for lights and hints).
- Clicking an empty tile within reach now always targets that tile; the "furniture in front of you" fallback only applies when the cursor is out of reach (it used to swallow clicks next to sources).
- Tuning: `FAULT_CHANCE` 0.0003 per segment per tick, so a 40-segment network loses a segment roughly every 3 days of play.

## Verification
- **Shared tests:**
  - served tiles and source connection
  - a fault splits the network
  - unowned and apartment fixtures always run
  - commands round-trip
  - the fault resolver is rare and only hits owned rooms
  - a required utility zeroes valuation
- **Browser:** wire a lamp in an owned room to the lobby generator and watch it light up, inject a fault and see sparks and darkness, repair it, and plumb a sink.
