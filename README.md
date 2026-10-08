# Dungeon Flipper

A top-down dungeon crawler in the spirit of *The Binding of Isaac* and classic *Zelda*. Every room you clear becomes **your property**, and you turn it into a home yourself: haul furniture, hang wallpaper, lay carpet, knock down walls, plank over pits, build partitions and light the place up.

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
| Left click on furniture (in an owned room) | Lift it (your hands are busy while carrying). Click again to place it where the ghost shows |
| Click a chest | Open storage. Hold to lift it |
| Drag hotbar items | Swap slots, merge matching tool / roll stacks (up to 256), or drag into the world to drop the item |
| Click the minimap / upgrade icons | Full map (drag to pan, scroll to zoom) / upgrade list |

Dev builds also have F2 (random item), F3 (+50 gold), F4 (kill room), F6 (heal), F7 (random furniture), F8 (next floor) and F9 (reset world).

## Architecture

```
packages/shared   Pure TS shared by client and server: content defs, world model, layout,
                  generator, command reducer, loot, health and stats.
apps/client       PixiJS v8 renderer plus a small custom engine (fixed-step loop, tile
                  collision, lighting), the game layer and a DOM UI.
apps/server       Fastify + SQLite. Applies the same command reducer and stores one JSON
                  document per world / floor / room / player / global key.
```

### Adding content

Every game thing is a **data def in its own file**, in a folder per kind under `packages/shared/src/content/`. Each folder's `index.ts` lists its defs, and `content/index.ts` registers and validates everything at startup.

- **Weapon / armor / tool / roll / passive / pickup:** add a file under `items/<kind>/`. Melee weapons pick a pattern (`stab`, `arc`, `smash`, `spin`) with a `range` in tiles at quarter-tile precision. Ranged weapons reference a projectile.
- **Projectile:** `projectiles/`. Its `trajectory` (`straight` or `lobbed`) decides which obstacles stop it.
- **Obstacle:** `obstacles/`. It declares `blocksMovement` (movement kinds) and `blocksProjectiles` (trajectories), an optional `hazard`, a `height` (low walls cost 1 to build, demolish or paper, tall walls 2; it also sets shadow length), `renovate` actions, an optional `trigger` (for example stairs) and, for walls, an `autotile` piece set (see below).
- **Enemy:** `enemies/` or `bosses/`. It sets a movement behavior and **any number of attack behaviors**, all referenced by id. The behaviors live in `apps/client/src/game/behaviors/`.
- **Furniture:** `furniture/`. It sets a footprint, a sprite (a single key or a grid of tile keys), a `height` for its shadow, an optional `light` (with `shadows: true`, objects in the room cast shadows away from it) and an optional `container`. Furniture can also be drawn into a room template's map through a legend entry (`*` is a brazier); it can be lifted like any other.
- **Surface** (wallpaper or flooring): `surfaces/`. It holds a procedural pattern description.
- **Loot table:** `lootTables/`. Each *drop* rolls independently. A passing drop picks exactly one *entry* by its own chance, and any leftover probability yields nothing. At most one tile-filling (furniture) result is kept per enemy, and the last one wins.
- **Room template:** `roomTemplates/`. It has an ASCII map (legend in `legend.ts`) over a shape made of 19×11-tile cells. Any polyomino works, and the generator mirrors templates to fit.
- **Health layer:** `healthLayers/`. Layers drain in priority order. Armor is a layer bound to an item, so the item breaks when the layer empties.

### Wall art

Walls are autotiled from four 8×8 pieces per material, drawn as a tile's top-left quarter and rotated into the other quarters: **outer corner** (open to the north and west), **edge** (open to the north; must tile horizontally with itself), **inner corner** (only the north-west diagonal open) and **fill**. That covers room edges and corners, lone pillars, junctions, thick blocks and L-shapes joined to the room's walls. Each sheet lives at `apps/client/public/assets/walls/<set>.png` (32×16): the pieces in the top row, and below each one a mask of where wallpaper replaces it. The mask also tells the shadows how deep the face is: the face runs from the floor at the open edge up to the wall's top at the first unmasked row past it. The current sheets are placeholders from `node scripts/wall-placeholders.mjs`, so draw over them freely. Pass `--force` to regenerate them.

New *mechanics* are small modules in registries:

- `behaviors/`: enemy movement and attack behaviors
- `actions/tools.ts`: renovation actions
- `actions/effects.ts`: pickup and passive effects
- `actions/triggers.ts`: tile triggers

### World model

- A floor is a **sparse, unbounded map of cells → room ids**, so it can hold any number of rooms and can grow later.
- A room is a set of cells. All tiles use **global floor coordinates**, so merging two rooms later is a union of their cells plus deleting the boundary walls between them.
- Room state is stored as **diffs over its template**: dead spawn ids, tile overrides, surfaces, furniture and ground items.

### Persistence and sync

Every persistent change is a **Command** applied by a single pure reducer (`world/commands.ts`):

1. The client applies each command immediately, saves to localStorage and queues it in an outbox.
2. The outbox flushes on room transitions, every 15 s and when the page is hidden.
3. The server re-runs the same reducer and writes only the documents that were touched.

Room-independent state (future NPCs, cooking timers) goes in `globals` and is caught up lazily by `advance()`, not simulated off-screen. Commands carry an `actorId`, which leaves room for multiplayer later.

## Credits

Art: [Kenney](https://kenney.nl) — *Tiny Dungeon* and *Roguelike Indoors* (CC0). Licenses are in `apps/client/public/assets/*/License.txt`. Other sprites are drawn procedurally in `apps/client/src/engine/procedural.ts`.
