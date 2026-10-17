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

## M5.1 Guild Foundation

Open **Guild** from the Main Menu and enter a name of 3?24 Unicode code points
(after trimming surrounding spaces). A new Guild starts at level 1, with 40,000 G
and an empty roster of capacity 8. Adventurers remains the independent generator;
no generated character is automatically recruited. Recruitment is not implemented.

Guild data uses localStorage key `guild-to-glory.guild` with schema version 1.
Reloads only read/validate data; creation refuses to replace any existing value,
including corrupt or unsupported data. Storage errors are shown without resetting
or overwriting the profile. There is no reset button or automatic migration.
The adapter is separate from the shared model and Guild UI. Web Locks serialize
creation across tabs where available; older browsers without Web Locks only have
a synchronous existence check, not a cross-tab transaction.

Persistence belongs to this browser profile and origin (host/port/protocol).
Clearing site data, private browsing expiration, or changing origin can lose access
to the profile. localStorage is editable by the user and is **not authoritative
multiplayer persistence**. Guild data is never sent through the World protocol.
Schema v1 roster entries preserve GeneratedAdventurer data plus a unique ID;
validation currently targets the M3 level-1 definitions. Future progression or
registry changes require an explicit schema migration.

## M5.2 Recruitment and dismissal

Guild now supports one pending recruit. Each roll costs 10,000 G; Recruit costs
nothing further and Reject does not refund the roll. Click a roster member to see
their original stats, skills and trait effects. Dismiss requires confirmation and
refunds nothing. A full roster can still hold a pending recruit while a member is dismissed.

Schema 2 adds pendingRecruit. Schema 1 is validated and converted in memory without
changing the Guild ID, name, creation time, roster or gold. The next successful
action saves schema 2; loading alone never writes or grants money. Each action
saves the complete Guild snapshot in one localStorage setItem, so gold and the
pending recruit cannot be saved separately. Failed saves leave the stored snapshot
and displayed balance intact. Pending decisions carry an ID to reject stale tabs.
Web Locks serialize UI writes where supported; browsers without Web Locks retain
the earlier cross-tab race limitation. This remains editable local prototype data.

Development builds alone show Developer Debug with +100,000 G. Production builds
omit the panel and reject the debug operation. Debug money already saved locally
remains part of that local profile; no Guild money is sent to multiplayer.

## M5.3 Active Party Management

In Guild, use Add to Party on the roster to select up to four adventurers. Click a
member's name to inspect their roster stats, skills and traits. Set Leader chooses
one current member; a party with at least one member and a leader is Ready.
A party without a leader can still be saved. Remove, replacing the leader, or
dismissing the leader clears that role until another member is explicitly chosen.
Select a roster member outside the party, then use Replace with on a party slot
to replace that member even when full. Clear Party removes all party selections.

Schema 3 adds activeParty containing only memberIds and leaderId. Schema 1/2
profiles load with an empty party and preserve gold, roster and pending recruits;
the next successful action saves schema 3. Invalid references block loading and
writes without resetting the stored profile. Dismissal and party changes save the
entire Guild in one storage operation; a failed save restores the persisted view.
The existing localStorage and cross-tab Web Locks limitations still apply.
Party readiness is informational only: no World, multiplayer, combat, AI or
formation integration is included in M5.3.

## M5.3.1 Multiplayer Guild & Party Identity Prototype

Connecting to World creates/reuses a random UUID in localStorage key
`guild-to-glory.local-profile`. This separate key does not reset or rewrite any
Guild data. A fresh connection sends the current persisted Guild's Party snapshot;
an absent Guild sends an explicit empty, Not Ready state. Invalid Guild/profile
storage reports an error instead of inventing Guild data.

The World panel lists each session's Guild and Party members (name, rarity, level,
leader and Ready status). It still renders one moving placeholder per session.
Use **Sync Current Party** to resend current saved data without creating a session.
Guild changes from another same-origin tab also trigger sync via storage events.
Navigating away from World retains the existing disconnect behavior; returning
connects again and sends current saved data. Browser profiles have independent
localStorage; use two browser profiles to test two independent Guilds.

Network messages:
- `party:snapshot` client -> server: protocolVersion 1, per-connection increasing
  revision, profileId, guildId/name, memberIds, leaderId and minimal member displays.
- `party:result` server -> sender: accepted/rejected result, revision and message.
- `party:state` server -> room: summaries keyed by server-issued sessionId; excludes
  profileId, economy, pending recruits, stats, skills and traits.

Server validation uses an exact field allowlist, maximum four unique member IDs,
leader membership, matching displays, bounded strings and a 4096-byte JSON limit.
IDs are at most 128 UTF-16 code units; member names 80; Guild names 3?24 code points
(and at most 48 code units). Member levels remain 1 and rarity uses the existing
five display categories. Duplicate/older revisions are rejected without mutation.
Session removal clears its snapshot; reconnect starts a new revision sequence.

This is not authentication: profile and Guild identity/display data are client
claims, not verified ownership or server-authoritative progression. Guild data
remains only in localStorage; no database, cross-device sync, login, combat,
formation or party following is implemented. Web Locks serialize profile creation
where available; unsupported browsers retain a first-use cross-tab race limitation.
Server restart loses session snapshots; clients resend after connecting again.

Automated tests include two real Colyseus clients, session cleanup/reconnect and
movement isolation. Vitest uses a thread pool because Colyseus PM2 metrics use
process IPC, which conflicts with Vitest's default fork worker channel.

## M5.3.2A SQLite Database Foundation

The server now opens a SQLite database at startup and closes it on Colyseus
shutdown (with an exit fallback). No accounts, Guilds, starting gold or imported
localStorage data are created on startup. Guild UI and party network behavior
remain unchanged; repositories are not called by rooms or UI.

Driver: built-in Node `node:sqlite` / `DatabaseSync`, verified on the existing
Node v24.18.0 runtime; no npm dependency or runtime upgrade is needed. On the
project's older minimum Node 22.12, node:sqlite needs `--experimental-sqlite`;
Node 22.13+ exposes it without that flag. The API is synchronous, so future
high-volume gameplay work should review event-loop impact before integration.

Default file: `server/data/guild.sqlite`, independent of the launch directory.
Set the server environment variable `DATABASE_PATH` to an absolute path or a path
relative to `server/`. It must use a lowercase .sqlite, .sqlite3 or .db extension
and be outside the client directory. Example in PowerShell:

`$env:DATABASE_PATH = 'data/guild.sqlite'`

Then run `npm.cmd run dev:server`. See `server/.env.example`; .env files are not
automatically loaded. Keep database files outside any externally hosted static
asset directories. Vite denies SQLite database/journal files from workspace file
serving; the database is never imported by client/shared code. Database files and
WAL/SHM/journal sidecars are gitignored.

Migration version **1**, named **guild_foundation**, creates:
- players: unique ID and creation/update timestamps, no login credentials.
- guilds: unique owner_player_id FK (one Guild per Player), name, level, gold,
  timestamps. Repository creation requires explicit gold and level.
- adventurers: Guild FK, ordered roster, full generated data; rarity, base stats,
  skills and traits are JSON. Race, class and total stats are preserved too.
- pending_recruits: one JSON adventurer per Guild and timestamp.
- active_parties: one per Guild with nullable leader.
- active_party_members: unique member and slot per Guild, slots 0 through 3,
  composite FK enforcing same-Guild adventurers. A deferred FK requires the
  leader to be in the party. Removing a member clears their leader role.
- schema_migrations: applied version/name/time records.

Initialization enables foreign keys, a five-second busy timeout and WAL with FULL
synchronous durability. Pending migrations run atomically, check foreign keys and
record versions only after success. Unknown migration histories and invalid files
fail startup without resetting the database. Do not delete databases to migrate.

`server/src/database/repository.ts` provides create/find Player, create/find/update
Guild (including lookup by owner), save/load ordered roster, save/load/clear pending
recruit, and save/load active party. Parameters are bound in prepared statements.
`repository.transaction(repo => { ... })` groups calls using a synchronous callback;
nested calls use savepoints. Do not use async callbacks, promises or external side
effects inside these transactions. Errors propagate to the caller after rollback.
To move a pending recruit into a roster, clear pending and save roster within one
transaction. Saving a roster removes references to removed members atomically and
preserves unchanged party membership. Pending save explicitly replaces its one row.
The future business layer must enforce roster capacity 8 and authorization; this
foundation validates serialized current generated characters but adds no economy.

Tests use temporary databases and delete them after closing connections. They cover
migration failure, reopen persistence, two owners, serialization, FK/slot/leader
constraints, multi-table rollback and write errors, alongside existing regressions.
No authentication, browser import, cross-device sync, gameplay integration, backup
service or later milestone is included.
