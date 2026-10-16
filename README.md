# GuildToGlory Online

GuildToGlory Online is a browser-based 2D MMORPG foundation using PixiJS, Colyseus, Node.js, TypeScript, Vite, and npm workspaces.

## Requirements

- Node.js 22.12 or newer (developed with Node.js 24.18.0)
- npm 10 or newer

## Install

```sh
npm install
```

## Run Locally

Open two terminals from the repository root:

```sh
npm run dev:server
```

```sh
npm run dev:client
```

Open <http://localhost:5173>. The client connects to the Colyseus server at `ws://localhost:2567` by default. Set `VITE_SERVER_URL` to use another WebSocket URL, or set `PORT` to change the server port.

## Checks and Production Build

```sh
npm run typecheck
npm test
npm run build
```

## Workspaces

- `client/`: PixiJS 2D world and Vite browser client
- `server/`: Colyseus world room and authoritative movement
- `shared/`: TypeScript world/player types and network message contracts

The current world uses placeholder graphics and supports shared rooms, click-to-move movement, and synchronized player positions. Combat, guilds, parties, inventory, and persistence are not implemented yet.

## M4.3.2 Dual Layer Map Editor

The left sidebar provides independent **Texture Mode** and **Grid Mode** controls.
Texture tools (Grass, Dirt, Stone, Empty/Erase) only change the texture. Grid tools
(Walkable in green, Blocked in black) only change navigation. Select works in both
modes, including empty cells. Switching modes resets the tool to Select and keeps
both layers. Empty cells have a faint grid outline in the editor, with no texture.
The inspector shows zero-based column/row, texture and navigation status together.

- New Map supports **Empty / Blocked** or **Grass / Walkable** presets.
- Width and Height accept integers 1-500, including rectangular maps.
- Resize preserves both layers of the top-left overlap and fills new cells with
  Empty / Blocked. Cropping and New Map require confirmation; export first for a backup.
- Pan with right/middle drag or Shift + drag; zoom with the wheel or +/- (50-400%).
  Center Map returns to the center. Large maps are not fitted below the zoom minimum.
- Play Test uses current unsaved edits and spawns near the center on a walkable cell,
  even when its texture is empty. Paint, mode and map-changing controls are disabled.
  Play Test renders textures, while A* and collision read only navigation and forbid
  diagonal corner cutting. Stop Test restores the previous mode/tool without altering data.
- Export saves both layers as JSON. Import validates before replacing the current map
  and asks for confirmation with migration/data-loss warnings. Invalid or cancelled
  imports leave current data intact. The source file is never overwritten.

### Shared schema (version 2)

The existing flat row-major array is retained: tiles[row * width + column].

```json
{"schemaVersion":2,"width":2,"height":1,"tiles":[{"textureId":"grass","walkable":false},{"textureId":null,"walkable":true}]}
```

textureId is null for Empty, or a nonempty string up to 256 characters. walkable is
required and boolean. Texture never determines navigation. Unknown texture IDs are
preserved and rendered gray with an import warning. Optional legacy textureKey
metadata is preserved (up to 256 characters). Imported PNG assets are described below.
There is no elevation data. Maps without a version but with valid dual-layer tiles
are accepted; unsupported explicit versions are rejected.

### Legacy imports

Legacy tiles with type grass/dirt/stone retain their terrain as textureId and their
explicit walkable flag. Without that flag, terrain defaults to walkable, matching
M4.3.1. Legacy void always becomes null + false. An inconsistent void + walkable:true
receives a specific conversion warning. Optional textureKey metadata survives.
Unknown fields are omitted only after a warning and import confirmation. Legacy
migration is disclosed before import. New exports always use schemaVersion 2.

Editor maps are isolated copies. They do not replace the live multiplayer map.
World renders the same texture schema and server-authoritative movement uses the
same navigation rules. The authoritative world map is loaded from repository files as described in M4.5 below.

### Performance and validation limits

Viewport culling and once-per-frame dirty redraws are retained for both modes;
idle frames reuse geometry. A* uses a binary heap and typed arrays. Maximum maps
have 250,000 cells. Resize, JSON processing and pathfinding are synchronous, so large
or obstructed maps can briefly pause the UI. JSON import has a 400 MB file limit;
very large files can require considerably more memory during parsing. Consider a
worker and chunk caching after profiling on target hardware.

Automated tests cover schema validation/migration, both presets, 500x500 round trips,
resize/cropping, independent paint/erase and drag, mode rendering, empty-cell picking,
Play Test locks and navigation, pan/zoom, culling and isolation from WORLD_MAP. Editor
interaction tests use a renderer double, not real browser WebGL; visual layout and
GPU performance still need a manual browser check.

## M4.4 PNG ground textures

In Texture Mode, choose **Import PNG** and select one or several files. Select a
thumbnail in the Asset Palette, then click or drag to paint. Painting replaces only
textureId; Empty / Erase removes only the texture. Grid Mode and collision remain
independent. PNGs also render in Play Test, with the navigation guide hidden there.
The existing guide toggle continues to work over imported images in Texture Mode.

Source files must be PNG, at most 4 MiB and at most 2048 pixels on either axis.
Import automatically resamples the entire image to 64x32 and clips outside the
isometric diamond, keeping alpha transparency. This can stretch images of another
aspect ratio and discards pixels outside the diamond; retain your originals for
future editing. There is no per-tile rotation, resizing, spritesheet or object layer.

Map JSON keeps schemaVersion 2 with an optional assets array. Each asset has a unique
image: ID, name, and dataUrl containing an embedded base64 PNG. Tiles reference this
ID through textureId. Assets are stored once per map, including unused palette
images; resize preserves them. New Map clears them after confirmation. Export a
backup first. Files have no external URLs or local file-path dependencies.

Up to 64 assets are allowed. Each normalized PNG data URL is limited to 32,000
characters, so the image registry adds at most about 2.05 MB of encoded image data
plus metadata. Base64 costs roughly 33% more than binary PNG. The whole-map import
limit remains 400 MB (including tiles and legacy metadata); large files can consume
considerably more RAM while parsing. Original full-resolution files are not embedded.

On map import, the registry, image IDs, PNG headers and 64x32 dimensions are validated;
all embedded images must decode successfully before replacing the current map.
Missing image references and corrupt PNGs abort import. Existing maps without assets
and legacy void maps remain supported. Loaded images reuse GPU textures, and pooled
sprites are limited to visible tiles. Large viewports or many visible image tiles
can still increase rendering cost; real browser/GPU profiling is not automated.

Tests cover embedded PNG round trips, missing/invalid assets, limits, browser image
preparation with doubles, texture replacement/erase, mode switches and Play Test.
Actual browser decoding, transparency appearance and pixel alignment need a visual
check in the browser; mocked rendering tests do not establish those results.

## M4.5 World Map Foundation (2x2)

World data lives in server/maps/registry.json and four independent map files:
1-1.json, 1-2.json, 2-1.json and 2-2.json. Registry positions are one-based row/column;
tile/spawn coordinates remain zero-based. Map 1-1 is the starting map. The other
three maps are reserved and validated at startup, with no travel or joining UI.
Each initial map is 20x20 with placeholder ground. Map 1-1 contains a short stone
navigation barrier at column 8, rows 6-10 for collision testing.

Enter World automatically connects to the Colyseus room and waits for a world:map
message before rendering players or accepting destinations. This message contains
the map ID, name and the exact authoritative map data, including embedded PNGs.
The client does not bundle a separate copy of the multiplayer map. It validates the
payload and decodes PNGs before displaying it; a failed load shows an error and
leaves the room. The prototype WORLD_MAP constant is used only by the local editor
starter map and existing shared test defaults, not by multiplayer movement/rendering.

The server reads and validates all four files once at startup. Room instances use
that validated snapshot, and ignore client-supplied map choices. A* receives the
loaded navigation grid explicitly. All players currently share the configured spawn
cell (1,1); player-to-player collision is not implemented. If the requested spawn is
blocked or outside the map, the server warns and chooses the first walkable cell in
row-major order. An all-blocked map prevents startup, with the map ID/file in the error.
Missing files, duplicate IDs/files/positions, invalid dimensions/navigation and unresolved
texture references also produce clear startup errors. PNG headers/size/references
are checked on the server; actual pixel decoding is checked by the browser.

### Replacing Map 1-1 with an editor export

1. In Map Editor, export JSON. Ensure at least one cell is Walkable; imported PNGs
   are included in the export. Keep a backup of the existing repository map.
2. Replace the contents of server/maps/1-1.json with the exported JSON. Do not wrap
   the export in another object. No browser-to-server file writing is performed.
3. If needed, change the spawn column/row for entry 1-1 in server/maps/registry.json.
   The startingMapId remains 1-1. Replace another map's JSON in the same way; reserved
   maps still cannot be entered in this milestone.
4. Restart the server and check startup validation output. For development use
   npm run dev:server. For production run npm run build, then node server/dist/index.js.
   Reconnect clients to receive the new snapshot; there is no hot reload/deployment UI.

Runtime map paths are resolved relative to the server module, not the terminal's
working directory. Production deployments must include server/maps beside server/dist,
plus the normal workspace packages/dependencies. The build does not copy or embed these
files, so replacing JSON requires a server restart but does not require rebuilding JS.

There is no database, persistent player position, warp, transition or elevation.
The map snapshot is sent on initial synchronization, not on each movement tick. Large
maps/embedded assets increase join payload and browser loading/rendering cost; this
foundation is initially tuned for 20x20 maps, and World currently draws the whole map.
The editor's independent camera/culling and local Play Test remain unchanged.
