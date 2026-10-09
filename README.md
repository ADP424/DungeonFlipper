# Dungeon Flipper

A top-down crawler in the spirit of *The Binding of Isaac* and classic *Zelda*, set in the Backrooms: an endless, slightly haunted space of yellow wallpaper and damp carpet behind a crack in your apartment's closet. You're an ambitious property developer. Every room you clear becomes **your property**, and you turn it into a home yourself: haul furniture, hang wallpaper, lay carpet, knock down walls, patch missing floor, build partitions and light the place up. Your tools are your weapons: the crowbar, sledgehammer and nail gun fight while monsters are around and renovate once the room is quiet.

Art is placeholder (Kenney fantasy packs and procedural sprites) until the theme's own art exists.

## Running

```bash
npm install
npm run dev        # server on :8787 + Vite client (opens on :5173, or the next free port)
npm test           # unit + server integration tests
npm run typecheck
```

Requires Node 22.5+ (the server uses the built-in `node:sqlite`).

## Controls

Only WASD and the mouse:

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Main hand: attack, or use a tool or roll on the highlighted tile |
| Right click (hold) | Off hand: attack with an off-hand weapon |
| Scroll wheel | Cycle the main hand through the hotbar. While carrying, rotate the furniture |
| Left click on furniture | Lift it, anywhere (with a weapon in hand and monsters around, the click attacks instead). Your hands are busy while carrying; click again to place it where the ghost shows |
| Right click | Use the off-hand item: any tool, roll or weapon works in either hand |
| Click a chest | Open storage. Hold to lift it |
| Drag hotbar items | Swap slots, merge matching tool / roll stacks (up to 256), or drag into the world to drop the item |
| Shift-click an item (chest or toolkit open) | Send it across: hotbar → container or back, topping up matching stacks first |
| Double-click an item (hotbar, chest or toolkit) | Take it in hand (armour goes on); what you held goes where it came from |
| Click a toolkit in the hotbar | Open it: six slots for tools, rolls and tool-weapons, in one hotbar slot |
| Hold left click on a wall you built (empty-handed or with a tool that can't) | Break it by hand: 10 s for a low wall, 15 s for a tall one. Never works on the dungeon's own walls |
| Click the minimap / upgrade icons | Full map (drag to pan, scroll to zoom) / upgrade list |
| Escape | Close the open panel, or pause (settings live in the pause menu) |

**Your phone:** click the phone icon under the minimap. It comes up in the middle of the screen and pauses the game. Its apps: Messages (today's messages, with earlier ones a tap away; you only hear about rooms you own being invaded), Tenants (a contact for everyone renting from you or viewing a listing), Hardware (orders), Map, Floorplan and Sleep. Sleeping, through the phone or in your own bed, always asks first. Escape backs out of an app, then puts the phone away.

**Sharing tiles:** flooring, pipes and wires go under furniture: with a roll or a spool in hand, clicking a furnished tile works on the floor (click again once it's done to lift the furniture instead). Small things (desk lamps, plants) can stand on tables and dressers; click the tile to take the top one first.

**Utilities:** once a room is yours, it's on your own grid. Lamps, fridges, sinks and toilets only work when they're connected to a source: every lobby has a generator (power) and a water main (water), and more turn up farther out. Lay wire with a Wire Spool and pipe with a Pipe Bundle (click, or hold and drag along tiles; they run through floors and walls). While you hold one you see the network: live runs are bright, dead ones grey, and fixtures are outlined green (working) or red. Now and then a segment fails: a puddle or sparks mark the spot, and the same tool fixes it. Tenants pay more for power and water, and some won't live without them.

**Time:** the clock runs like Stardew Valley's: one in-game minute per real second, stopped while a menu or panel is open or the game is paused. A day ends when you sleep.

**Securing:** plant a company flag in a cleared room to claim it (you start with four; more turn up as loot or cost $10 in the phone's Hardware app). Monsters pour in through any unbarricaded door that leads to a room with monsters, so board those up (plank barricades, security, steel or blast doors; harder neighbours need stronger ones) to keep it secure. Hover a barricade to see its durability. On the map (click the minimap), barricades show in their doorways, and hovering a room or a barricade tells you its status and durability. Barricades wear down over time and can break, and an owned room left unsecured is lost at the end of the next day. A barricade shows on both sides of its doorway. Planks block you too: hold left-click on a barricade to tear it down (a second per tier; it's lost), or pry it off with a crowbar to keep it (it keeps its wear). Monsters move back into cleared rooms that border uncleared ones. Kits come from loot and the phone's Hardware app (delivered to your apartment the next morning).

**Your estate:** all the rooms you own that connect form one seamless space: walk between them with no screen change and no time passing, and monsters that get in will chase you from room to room. Hold a sledgehammer on the wall between any two rooms to knock it through; rooms joined that way become one space, whoever owns them. The phone's Floorplan app outlines the original rooms.

**Anything goes:** you can renovate, build, break, haul furniture and plant flags anywhere, owned or not, monsters or not. Tools and rolls always work; dual-use weapons renovate when nothing is alive in the room and fight otherwise. Walk into the crack in your closet (or its other end in Level 1's lobby) to step through, carrying whatever you hold. The Hardware app also sells furniture (beds, chairs, lamps…), which is set down on your apartment floor.

**Tenants:** put a For Rent sign (you start with two; Hardware sells more) in a unit, meaning a stretch of your floor bounded by walls and doorways, with a bed in it. Each morning a listed unit may draw an applicant: about half the time if it borders nothing unsecured, less for every unsecured neighbour, and much less next to rooms with monsters. Click an applicant to see what they want and haggle with the slider; three bad offers and they walk. Tenants pay rent every morning, wander their unit, flee breaches if there's somewhere safe next door, and leave if they get unhappy. Talk to them to learn more of their tastes. Click a sign to close or reopen its listing. Your own landlord wants rent every week. On the map, rented units are blue with their tenants' faces, units for rent are green with a $, and each owned space is outlined.

Dev builds also have F2 (random item), F3 (+$50), F4 (kill room), F6 (heal), F7 (random furniture), F8 (next floor), F9 (reset world), F10 (+1 hour) and Shift+F10 (skip to 11:45 PM).

## Architecture

```
packages/shared   Pure TS shared by client and server: content defs, world model, layout,
                  generator, command reducer, loot, health and stats.
apps/client       PixiJS v8 renderer plus a small custom engine (fixed-step loop, tile
                  collision, lighting), the game layer and a DOM UI.
apps/server       Fastify + SQLite. Applies the same command reducer and stores one JSON
                  document per world / floor / region / room / player / global key.
```

### Adding content

Every game thing is a **data def in its own file**, in a folder per kind under `packages/shared/src/content/`. Each folder's `index.ts` lists its defs, and `content/index.ts` registers and validates everything at startup.

- **Weapon / armor / tool / roll / passive / pickup:** add a file under `items/<kind>/`. Melee weapons pick a pattern (`stab`, `arc`, `smash`, `spin`) with a `range` in tiles at quarter-tile precision. Ranged weapons reference a projectile.
- **Projectile:** `projectiles/`. Its `trajectory` (`straight` or `lobbed`) decides which obstacles stop it.
- **Obstacle:** `obstacles/`. It declares `blocksMovement` (movement kinds) and `blocksProjectiles` (trajectories), an optional `hazard`, a `height` (low walls cost 1 to build, demolish or paper, tall walls 2; it also sets shadow length), `renovate` actions, an optional `trigger` (for example stairs) and, for walls, an `autotile` piece set (see below).
- **Enemy:** `enemies/` or `bosses/`. It sets a movement behavior and **any number of attack behaviors**, all referenced by id. The behaviors live in `apps/client/src/game/behaviors/`. Its `threat` (spawn-budget cost) and `tags` decide where it can spawn; bosses also set `boss.minDifficulty`.
- **Furniture:** `furniture/`. It sets a footprint, a sprite (a single key or a grid of tile keys), a `height` for its shadow, an optional `light` (with `shadows: true`, objects in the room cast shadows away from it), an optional `container`, and optionally `fixed` (can't be lifted) and a `use` click behavior (`apps/client/src/game/actions/furnitureUses.ts`). Furniture with a `value` (1–5) and `tags` can turn up in template furniture slots. Furniture can also be drawn into a room template's map through a legend entry (`*` is a space heater); it can be lifted like any other.
- **Surface** (wallpaper or flooring): `surfaces/`. It holds a procedural pattern description.
- **Loot table:** `lootTables/`. Each *drop* rolls independently. A passing drop picks exactly one *entry* by its own chance, and any leftover probability yields nothing. Loot never includes furniture: furniture is found in rooms.
- **Room template:** `roomTemplates/`. It has an ASCII map (legend in `legend.ts`) over a shape made of 19×11-tile cells. Any polyomino works, and the generator mirrors templates to fit. Enemies are **spawn slots**: `e` (any), `F` (flyer), `R` (ranged), `M` (brute) and `B` (boss) are filled at generation from the room's difficulty and threat budget; a lowercase letter (`g` intern, `k` security guard…) pins a specific enemy, and a template legend entry `{ slot: { enemies: [...] } }` picks from a list. `$` (anything) and `L` (a light) are furniture slots, filled by value around the room's difficulty. `attach: ['stairsDown']` brings a room along behind this one (boss rooms).
- **Health layer:** `healthLayers/`. Layers drain in priority order. Armor is a layer bound to an item, so the item breaks when the layer empties.

### Wall art

Walls are autotiled from four 8×8 pieces per material, drawn as a tile's top-left quarter and rotated into the other quarters: **outer corner** (open to the north and west), **edge** (open to the north; must tile horizontally with itself), **inner corner** (only the north-west diagonal open) and **fill**. That covers room edges and corners, lone pillars, junctions, thick blocks and L-shapes joined to the room's walls. Each sheet lives at `apps/client/public/assets/walls/<set>.png` (32×16): the pieces in the top row, and below each one a mask of where wallpaper replaces it. The mask also tells the shadows how deep the face is: the face runs from the floor at the open edge up to the wall's top at the first unmasked row past it. The current sheets are placeholders from `node scripts/wall-placeholders.mjs`, so draw over them freely. Pass `--force` to regenerate them.

New *mechanics* are small modules in registries:

- `behaviors/`: enemy movement and attack behaviors
- `actions/tools.ts`: renovation actions
- `actions/effects.ts`: pickup and passive effects
- `actions/triggers.ts`: tile triggers

### World model

- A floor is a **sparse, unbounded map of cells → room ids** that grows forever: entering a room *expands* it (its doors become final and the rooms behind them are generated). Difficulty rises by 1 every 3 cells from the lobby, and by 4 per floor.
- A room is a set of cells. All tiles use **global floor coordinates**, so merging two rooms later is a union of their cells plus deleting the boundary walls between them.
- Room state is stored as **diffs over its template**: owner, monster roster, tile overrides, surfaces, furniture and ground items.

### Persistence and sync

Every persistent change is a **Command** applied by a single pure reducer (`world/commands.ts`):

1. The client applies each command immediately, saves to localStorage and queues it in an outbox.
2. The outbox flushes on room transitions, every 15 s and when the page is hidden.
3. The server re-runs the same reducer and writes only the documents that were touched.

Room-independent state (future NPCs, cooking timers) goes in `globals` and is caught up lazily by `advance()`, not simulated off-screen. Commands carry an `actorId`, which leaves room for multiplayer later.

## Credits

Art: [Kenney](https://kenney.nl) — *Tiny Dungeon* and *Roguelike Indoors* (CC0). Licenses are in `apps/client/public/assets/*/License.txt`. Other sprites are drawn procedurally in `apps/client/src/engine/procedural.ts`.
