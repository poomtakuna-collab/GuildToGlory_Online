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

The current world uses placeholder graphics and supports shared rooms, WASD movement, and synchronized player positions. Combat, guilds, parties, inventory, and persistence are not implemented yet.
