# Dungeon Flipper

A top-down crawler in the spirit of *The Binding of Isaac* and classic *Zelda*, set in the Backrooms: an endless, slightly haunted space of yellow wallpaper and damp carpet behind a crack in your apartment's closet. You're an ambitious property developer. Every room you clear becomes **your property**, and you turn it into a home yourself: haul furniture, hang wallpaper, lay carpet, knock down walls, patch missing floor, build partitions and light the place up. Your tools are your weapons: the crowbar, sledgehammer and nail gun fight on a click and do their work when held on a tile.

Art is placeholder (mostly from Kenney's fantasy packs) until the theme's own art exists. Every sprite is a PNG under `apps/client/art/` (see [Art](#art)).

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
| Either click, with that hand empty | Punch: weak and very short, but always there |
| Scroll wheel | Cycle the main hand through the hotbar. While carrying, rotate the furniture |
| Left click on furniture | Lift it, anywhere (with a weapon in hand and monsters around, the click attacks instead). Your hands are busy while carrying; click again to place it where the ghost shows |
| Right click | Use the off-hand item: any tool, roll or weapon works in either hand |
| Click a chest | Open storage. Hold to lift it |
| Left click an item (hotbar, chest, toolkit) | Pick it up. Holding something: put it all down (merging into a matching stack, or swapping) |
| Right click an item | Pick up half a stack. Holding something: put down one |
| Click the world while holding an item | Drop it at your feet |
| Shift-click an item (chest or toolkit open) | Send it across: hotbar → container or back, topping up matching stacks first |
| Double-click an item | Take it in hand: weapons and working tools (mop, spools, demolition) in your main hand (L), placeables and materials (flags, kits, signs, rolls) in your right (R), armour on |
| Right click a toolkit in the hotbar | Open it (six slots for tools, rolls and tool-weapons). Right-click it while holding a tool to put the tool inside |
| Hold left click on a wall you built (empty-handed or with a tool that can't) | Break it by hand: 10 s for a low wall, 15 s for a tall one. Never works on the dungeon's own walls |
| Click the minimap | Full map (drag to pan, scroll to zoom) |
| Escape | Close the open panel, or pause (settings live in the pause menu) |

**Your phone:** click the phone icon under the minimap (bottom left). It comes up in the middle of the screen and pauses the game. Its apps: Messages (today's messages, with earlier ones a tap away; you only hear about rooms you own being invaded), Tenants (a contact for everyone renting from you or viewing a listing), Hardware (orders), Map, Floorplan and Sleep. Sleeping, through the phone or in your own bed, always asks first. Escape backs out of an app, then puts the phone away.

**Sharing tiles:** flooring, pipes and wires go under furniture: with a roll or a spool in hand, clicking a furnished tile works on the floor (click again once it's done to lift the furniture instead). Small things (desk lamps, plants) can stand on tables and dressers; click the tile to take the top one first.

**Households, mess and staff:** applicants can be singles, couples or families: a couple needs two sleeping spots (a Double Bed sleeps two), a family also needs two beds, and bigger households pay more. Tenants make a little mess every day, and monsters make a lot (where they break in and where they die); mess lowers mood and rent, so mop it up (Mop) or hire a cleaner from the phone's Staff app. A handyman fixes pipe and wire faults and patches worn barricades. Staff are paid every night; if you can't pay, they quit.

**Reputation:** happy tenants raise it; tenants dying, unfair evictions, unhappy tenants leaving and complaints you ignore lower it. Higher tiers (40 and 100 points) bring wealthier tenants who pay much more and expect more. Miserable tenants hold back rent until things improve. To evict, talk to a tenant and press Evict: they get three days' notice, and it's only held against you if they were paying and happy.

**Rival realtors:** from day 3, realtors set up offices in rooms you've cleared but not claimed, and claim more over time. They're Amiable (just compete for space), Competitive (undercut your listings and lure your unhappy tenants) or Hostile (also send thugs to rob you; you get a warning and two hours to get there and fight them off). Click a realtor in their office to trade: sell them a room, buy one of theirs, buy from their stock, sell what you're holding, or make amends to cool them down a step. They and their guards fight back if attacked. Robbing them or killing them costs a lot of reputation, and below zero (infamous) applicants stop coming.

**Elevators:** each lobby's elevator needs power (wire it to the generator). Pick a floor and the doors open; walk in within ten seconds to ride, carrying whatever you hold.

**Utilities:** once a room is yours, it's on your own grid. Lamps, fridges, sinks and toilets only work when they're connected to a source: every lobby has a generator (power) and a water main (water), and more turn up farther out. Lay wire with a Wire Spool and pipe with a Pipe Bundle (click, or hold and drag along tiles; they run through floors and walls). While you hold one you see the network: live runs are bright, dead ones grey, and fixtures are outlined green (working) or red. Now and then a segment fails: a puddle or sparks mark the spot, and the same tool fixes it. Tenants pay more for power and water, and some won't live without them.

**Time:** the clock runs like Stardew Valley's: one in-game minute per real second, stopped while a menu or panel is open or the game is paused. A day ends when you sleep.

**Dying:** you keep everything you carry, but lose the rest of the day: you come round in your apartment the next morning, after monsters, tenants and barricades have had the hours to themselves. Your landlord charges a call-out fee for hauling you out of the closet (10 cash plus 15 per level down), and adds whatever you can't pay to the rent you owe. Furniture you were carrying stays where you fell. Being caught outside a secure room at 2 AM counts as dying.

**Securing:** plant a company flag in a cleared room to claim it (you start with four; more turn up as loot or cost 10 cash in the phone's Hardware app). Monsters pour in through any unbarricaded door that leads to a room with monsters, so board those up (plank barricades, security, steel or blast doors; harder neighbours need stronger ones) to keep it secure. Hover a barricade to see its durability. On the map (click the minimap), barricades show in their doorways, and hovering a room or a barricade tells you its status and durability. Barricades wear down over time and can break, and an owned room left unsecured is lost at the end of the next day. A barricade shows on both sides of its doorway. Planks block you too: hold left-click on a barricade to tear it down (a second per tier; it's lost), or pry it off with a crowbar to keep it (it keeps its wear). Monsters move back into cleared rooms that border uncleared ones. Kits come from loot and the phone's Hardware app (delivered to your apartment the next morning).

**Your estate:** all the rooms you own that connect form one seamless space: walk between them with no screen change and no time passing, and monsters that get in will chase you from room to room. Hold a sledgehammer on the wall between any two rooms to knock it through; rooms joined that way become one space, whoever owns them. The phone's Floorplan app outlines the original rooms.

**Anything goes:** you can renovate, build, break, haul furniture and plant flags anywhere, owned or not, monsters or not. Tools and rolls work at a click. Dual-use weapons always attack on a click; hold the button on a tile for half a second to use one as a tool instead (the nail gun mends barricades this way, 10 durability a use). Walk into the crack in your closet (or its other end in Level 1's lobby) to step through, carrying whatever you hold. The Hardware app also sells furniture (beds, chairs, lamps…), which is set down on your apartment floor.

**Tenants:** put a For Rent sign (you start with two; Hardware sells more) in a unit, meaning a stretch of your floor bounded by walls and doorways, with a bed in it. Each morning a listed unit may draw an applicant: about half the time if it borders nothing unsecured, less for every unsecured neighbour, and much less next to rooms with monsters. Click an applicant to see what they want and haggle with the slider; three bad offers and they walk. Tenants pay rent every morning, wander their unit, flee breaches if there's somewhere safe next door, and leave if they get unhappy. Talk to them to learn more of their tastes. Click a sign to close or reopen its listing. Your own landlord wants rent every week. On the map, rented units are blue with their tenants' faces, units for rent are green with a $, and each owned space is outlined.

Dev builds also have F2 (random item), F3 (+50 cash), F4 (kill room), F6 (heal), F7 (random furniture), F8 (next floor), F9 (reset world), F10 (+1 hour) and Shift+F10 (skip to 11:45 PM).

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

- **Weapon / armor / tool / roll / pickup:** add a file under `items/<kind>/`. Melee weapons pick a pattern (`stab`, `arc`, `smash`, `spin`) with a `range` in tiles at quarter-tile precision. Ranged weapons reference a projectile.
- **Projectile:** `projectiles/`. Its `trajectory` (`straight` or `lobbed`) decides which obstacles stop it. A straight shot fired by a flyer travels `high` instead (over short walls and low furniture, stopped by tall walls), so tall things list `high` in `blocksProjectiles` too.
- **Obstacle:** `obstacles/`. It declares `blocksMovement` (movement kinds) and `blocksProjectiles` (trajectories), an optional `hazard`, a `height` (low walls cost 1 to build, demolish or paper, tall walls 2; it also sets shadow length), `renovate` actions, an optional `trigger` (for example stairs) and, for walls, an `autotile` piece set (its art folder; see [Wall art](#wall-art)).
- **Enemy:** `enemies/` or `bosses/`. Its stats are the same wherever it's found (nothing scales them). `ai` names its **brain** and holds every number that tunes it; `contactDamage` is what touching it costs; `loot` is its own drops; `anims` names its animations (wind-ups and the like) and `held` what it carries. `difficulty` describes how hard it is on roughly the scale rooms use, and is only read when monsters spill through doors. See [Enemies](#enemies).
- **Furniture:** `furniture/`. It sets a footprint (`size`, the tiles it stands on, facing south), a sprite (an art folder with a view per facing; see [Art](#art)), a `height` for its shadow (a view with a painted [height map](#height-maps) takes its heights from that instead), an optional `light` (with `shadows: true`, objects in the room cast shadows away from it; `at` places it on the floor plan, in pixels), an optional `container`, and optionally `fixed` (can't be lifted) and a `use` click behavior (`apps/client/src/game/actions/furnitureUses.ts`). Furniture gets into the world by being drawn into a room template's map; it can be lifted like any other.
  - **Depth:** `depth` is how much floor the piece stands on, in pixels up from the bottom of its footprint as drawn (default: all of it): `10` for every facing, or `{ south, north, side }` when the views differ. You can walk behind the rest and are drawn under it. Walls have a `depth` too (8: you can step half a tile behind one).
  - **Collision:** `collision` lists what's solid as pixel boxes within the footprint facing south, for shapes `depth` can't describe. The floor lamp is solid only at its stand, so you can walk behind its pole: you're drawn behind a piece when you're behind its solid base, and it casts its shadow from those boxes (without them, from its art's outline).
  - **Turning:** a piece turns around a `pivot` (a cell centre or grid corner, in tiles), chosen from its shape unless given: pieces with matching sides turn in place, a bed turns about its head, a sofa about its left end. Collision boxes and `light.at` turn with it.
- **Surface** (wallpaper or flooring): `surfaces/`. It names its texture (`sprite`): one filled 16×16 image, `floor/<id>` for flooring or `wallpaper/<id>` for wallpaper.
- **Loot:** every enemy def has its own `loot`. Each *drop* rolls independently. A passing drop picks exactly one *entry* by its own chance, and any leftover probability yields nothing. Lists several enemies share (weapons and armor, renovation supplies) are written once in `loot/groups.ts`. Loot never includes furniture: furniture is found in rooms.
- **Room template:** `roomTemplates/`. It has an ASCII map over a shape made of 15×9-tile cells (13×7 inside). Any polyomino works, and the generator mirrors templates to fit. A room is **designed, not rolled**: the shared characters in `legend.ts` are structure only (`#` wall, `w` low wall, `O` missing floor, `^` broken glass, stairs), and every other character is a slot the template itself names in its `legend`: `r: { enemy: 'rat' }`, `S: { furniture: 'sofa', rot: 1 }` (the character marks the top-left tile of the footprint; containers can list `contents`). Characters only mean something inside their own template, so a room can hold any number of different things. Its `difficulty` is the designer's rating (any number ≥ 0): the room only appears at least that deep (floor baseline + distance from the lobby), more often farther out, and it sets the barricades its doors need and how much it spills. It never changes what's in the room. Furniture can't stand on the tile inside a possible door (the middle of each outer edge); startup validation says so. `attach: ['stairsDown']` brings a room along behind this one (boss rooms).
- **Health layer:** `healthLayers/`. Layers drain in priority order. Armor is a layer bound to an item, so the item breaks when the layer empties.

### Enemies

Every enemy plays differently, so every enemy has its own **brain**: `apps/client/src/game/behaviors/enemies/<id>.ts`, registered in `behaviors/index.ts` under the id its def names in `ai.id`. A brain is a small state machine written with shared building blocks, never a shared pattern:

- `steering.ts`: ways of moving (`chase` and `moveTo` by the cheapest way round, `flee` the most open way away, `circle`, `go` straight along a line, `turnToward`) and questions (`toPlayer`, `clearToPlayer`, `clearShot`, `watched`).
- `actions.ts`: things to do (`shoot`, `fan`, `ring`, `summon`).
- `brain.ts`: `defineBrain({ init, update })`, and `Phased` / `enter` for brains that work in phases (`flutter → windup → swoop → recover`).

Each frame the enemy starts from rest: standing still, facing the player, hurting on touch, no shield up, showing its idle art. The brain sets whatever is different this frame (`e.vx`/`e.vy`, `e.facing`, `e.contact = false`, `e.blockArc`, `e.pose('windup', seconds)`, or `e.pose('windup')` to play it at its own speed). Every tunable number belongs in the def's `ai.params`, typed by the brain's `Params` interface, so balance is edited in the def. Brains look up the projectiles and enemies they name in `init`, which also runs once per def at startup: a missing brain or a wrong id stops the game from starting.

To add an enemy: write its def, write its brain, list the brain in `behaviors/index.ts`, and give it art.

| Enemy | How it plays |
|---|---|
| Rat | Runs straight at you, fast |
| Ceiling Moth | Flutters slowly away, then swoops straight through where you stand |
| Damp Blob | A few short hops, then a long leap that lands in a ring of droplets |
| Intern | Circles out of reach, darts in and backs off; bolder in numbers |
| Mannequin | Frozen (and harmless) while you face it; faster than you when you don't |
| Water Cooler | Lobs globs that leave slowing puddles; sprays all round when hit |
| Flicker | Blinks out, reappears elsewhere firing; can only be hit while visible |
| Stapler Clerk | Takes cover, steps out for a burst of staples, relocates when you close in |
| HR Representative | Hides behind colleagues throwing homing pens (swat them with a swing); alone, it panics and lobs the stapler |
| Security Guard | A riot shield stops everything from the front; charges; dazed and open if the charge hits a wall |
| Thug | Sidesteps around you between heavy lunges (a full heart) |
| Realtor | Keeps away and phones for security |
| Office Security | Circles at taser range, shoves you back if you get close |
| The Facility Manager | Charges, sweeps and rings of clipboards; enraged below half health |

Monsters that spill into a room you've cleared are more of whatever lives in the room they came from, until the invaded room holds 3.5× that room's difficulty in enemy `difficulty`.

### Art

Every sprite is a PNG in `apps/client/art/`, in a folder per kind (enemies and furniture have a folder per def): `player/`, `enemies/`, `bosses/`, `npcs/`, `furniture/`, `items/<kind>/`, `projectiles/`, `obstacles/`, `barricades/`, `floor/`, `wallpaper/`, `fx/`, `ui/` and `walls/`. A def refers to its art by path without the extension: `icon: 'items/weapons/crowbar'` is `art/items/weapons/crowbar.png`. To change a sprite, edit or replace its PNG; to add one, drop in a file and use its path. Only art that's in use is there, so the folder is the list of what needs drawing.

- **Sizes:** tiles are 16×16 px.
- **Enemies** have a folder each, `enemies/<id>/` (`bosses/<id>/`): `idle.png` (or frames `idle/0.png`… with an `idle` animation in the def, for one that moves at rest), a folder of numbered frames per animation the def names (`windup/0.png`, `windup/1.png`…; any number of frames, and a brain can stretch them over however long its wind-up lasts; `flicker` swaps one with the resting art and back, as a warning), and `held.png` for what it holds, drawn pointing up and gripped at its bottom centre. A held item with `grip: 'aimed'` sits out in front and swings around the body to wherever the enemy faces (a shield, a bat); `grip: 'carried'` stays upright in the hand. An enemy whose def has `views` is drawn once per direction it faces (`e.facing`), like the player's body: its `idle` and each animation are then folders with one image, or one folder of frames, per view (`idle/left.png`, `sprint/left/0.png`…). `views: 'mirrored'` is the player's five (`front`, `front_diag`, `side`, `back_diag`, `back`, drawn facing right and mirrored for the left); `views: 'sided'` has `right` and `left` drawn separately in place of `side`, for a body whose sides differ (the mannequin). Everything but `idle.png` is a placeholder from `node scripts/enemy-placeholders.mjs` (wind-ups are the idle art squashed and tinted): draw over them freely; `--force` regenerates them.
- **Furniture** has a folder with three views: `furniture/<id>/south.png` (facing the camera), `north.png` (facing away) and `side.png` (facing east, to the right; facing west mirrors it). Turning a piece (scroll while carrying it) steps through south, west, north and east; images are never rotated. Each view is drawn for its footprint in that facing (a 2×1 sofa's `south.png` is 32×16, its `side.png` 16×32), stands on the footprint's bottom edge and is centred, so it can be drawn taller or wider than its footprint. Every piece can be turned and must have `south.png`; `north` and `side` are optional, and a missing one is drawn as `south`, so a piece gets the extra views only when it needs them. Plan: `docs/plans/furniture-art.md`.
- **Nothing is ever scaled:** every art pixel is the same size on screen, in the world and the UI alike. The camera uses a whole number of screen pixels per art pixel: the largest that shows at least 320×160 art pixels (a 16:9 screen shows 320×180: the 240×144 room with a 40-pixel HUD column either side). The HUD is built on the same grid: icons at their art size, borders and gaps in whole art pixels, and the minimap drawn one canvas pixel per art pixel. Only text, and the zoomable full map, are exempt. Something that should look bigger needs bigger art: the boss is 32×32 (for now a doubled-up placeholder), and actors wider than 16 px get `fx/shadow_large`. Items and projectiles have their own smaller shadows (`fx/shadow_small`, `fx/shadow_tiny`).
- **Animations:** a folder of numbered frames (`walk/0.png`, `walk/1.png`…). Add or remove frames freely. Timed animations run at one of five speeds (`ANIM_FPS` in `core/animation.ts`): `fastest` 12 frames a second, `fast` 8, `medium` 4, `slow` 2, `slowest` 1. A new animation picks a speed by name, never a frame rate of its own.
- **The player** is two layers on the same 16×16 canvas: a head (`player/head/<view>.png`) that faces the mouse and a body (`player/body/<view>/idle/0.png`… and `walk/0.png`…) that faces where you walk. The walk plays one frame per 0.4 tiles walked; standing still, the idle frames play one per 0.8 s, a light breath (rest, then the shoulders rising a pixel). The head stays still while the body walks and breathes. The five views are `front`, `front_diag`, `side`, `back_diag` and `back`, drawn facing right; facing left mirrors them. Standing still, the body turns to follow the head once it looks more than 90° away. Held items are gripped by the **bottom centre** of their icon: the main (L) item in the left hand, pointing at the mouse, and the off-hand (R) item upright in the right. Hand positions per view are in `HANDS` in `Player.ts`.
- **Packing:** at startup every PNG is packed into one atlas texture, so the game draws from a single GPU texture. There's no build step: in dev, saving a PNG reloads the page.
- **Floors and wallpaper** are one image per surface, named after its def: `floor/<id>.png` and `wallpaper/<id>.png`. Each is a completely filled 16×16 texture that must tile with itself in both directions; it's drawn as is, with no tint. Wallpaper is cut to the wall's face by the wall's masks (see [Wall art](#wall-art)).

### Wall art

Walls are drawn for the game's view, from the south and tilted back: a wall shows its top, and below it its face wherever it's open to the south (so wallpaper shows on those faces only). They're autotiled from five 16×16 pieces per wall, each a whole tile whose four quarters are that piece's four corners; the game composes a tile a quarter at a time, never turning anything: **outer** (a lone pillar, open on every side), **horizontal** (a wall running east–west, open to the north and south; must tile horizontally with itself), **vertical** (a wall running north–south, open to the west and east; must tile vertically), **inner** (a cross junction, where only the diagonals are open) and **fill** (the enclosed top; must tile with itself). That covers room edges and corners, lone pillars, junctions, thick blocks and L-shapes joined to the room's walls. A tile's upper two quarters are the wall's north edge and its lower two the south edge, with the face where that's open; they meet at the line drawn over the face, wherever the art puts it, so a face can be any height: a full-height wall's is ten rows under a narrow top, and a low wall's is five rows under a lit one. A low wall's top is also drawn lower: its pieces open to the north (outer, horizontal) leave their top four rows clear, so the floor behind shows over it. The obstacle's `depth` is how much of the tile is solid, up from its south edge; bodies step behind the rest. Walls of both heights are 6 deep, the rows their tops take, so bodies stop at the same spot behind either. A wall joins walls at least as tall as itself: where a full-height wall meets a low one it draws its edge, and its face if the low wall is to its south, while the low wall runs up to it. Each wall has its own folder, named after its obstacle: `apps/client/art/walls/<obstacle id>/` holds `outer.png`, `horizontal.png`, `vertical.png`, `inner.png` and `fill.png`, and next to a piece an optional `<piece>_mask.png` of where wallpaper replaces it (a piece without a mask takes no paper). The horizontal piece's mask also tells the game how tall the face is (for composing tiles, and for shadows): from the tile's bottom edge up to its topmost masked row, with the wall's top ending in the line above that. Where a face ends against a wall coming south, the inner piece's lower quarters carry the line that closes it (their outer column). The backrooms walls (`backrooms_wall` and `backrooms_wall_short`) are drawn by hand. The concrete, timber and drywall pieces come from `node scripts/wall-placeholders.mjs`, which follows the backrooms layout and masks; draw over them freely. `--force` regenerates them, overwriting any edits.

### Height maps

Lighting needs to know how tall a piece of furniture is at each pixel, and which way that pixel faces. A view can say so with a height map: `<view>_height.png` next to it (`furniture/bed/south_height.png`), the same size as the art, painted in flat colours. Only two colours matter, and how bright each is:

- **Green** is a top-facing surface. Its brightness is its height in pixels above the floor (16 to a tile).
- **Blue** is a front face, facing south. Its brightness is the height of its *foot*; the game climbs it one pixel per row from there, so a whole face is one flat blue. In each column, a run of the same blue is one face, and it stands just below its lowest row: on the floor, or on the top painted there.
- Transparent pixels aren't part of the piece.

A height of `n` pixels is channel value `60 + 6 × n` (so 0 to 32 pixels); pick the colours from `docs/height-swatches.png`, which has the greens along the top and the blues below, from 0 at the left, with a tick every 4 and a longer one every 8. The bed's south view is four fills: its foot (the bottom four rows) blue 0; the mattress green 4; the headboard's front, behind the pillow, blue 4, so it stands on the mattress and climbs to 8; and the headboard's top green 8.

A mapped view is lit as that shape: each face and top takes shadows at its own height, a face is dark when the light is behind it, and the piece blocks light only as high as it is at each spot (a headboard shades its own mattress). A view without a map is treated as flat, all at the def's `height`. `node scripts/furniture-heights.mjs` starts maps off for the pieces it lists (a guess from the art's outline: a face up from the lowest pixel as far as the piece's height, and a top above) and redraws the swatches; `--force` overwrites maps that are already there.

New *mechanics* are small modules in registries:

- `behaviors/`: enemy brains (`enemies/<id>.ts`, one per enemy), built from `steering.ts` and `actions.ts`
- `actions/tools.ts`: renovation actions
- `actions/effects.ts`: pickup effects
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

Art: [Kenney](https://kenney.nl) — *Tiny Dungeon* and *Roguelike Indoors* (CC0), cut into `apps/client/art/`; their licenses are in `apps/client/art/LICENSE-kenney-*.txt`. The rest of the placeholder art was drawn in code and exported to the same folders.
