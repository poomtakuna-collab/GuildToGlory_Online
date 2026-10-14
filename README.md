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

- `client/`: PixiJS start screen and Vite browser client
- `server/`: Colyseus server and connection test room
- `shared/`: TypeScript network message names and payload contracts

The server validates incoming network messages and owns server-side behavior. This foundation does not implement characters, maps, guild systems, combat, or persistence.
