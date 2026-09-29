# Hollow Crown

A Zelda-inspired action RPG prototype: Phaser 4 for the world, React for the HUD and menus, Bun + Express + socket.io for the server.

## Run locally

```sh
bun install
bun run dev        # http://localhost:3000, rebuilds the client on every reload
```

Open the page in two browser windows to play together: other heroes appear in your world, and the hidden co-op bosses need at least two.

| Script | What it does |
| --- | --- |
| `bun run dev` | Dev server, restarts when server files change |
| `bun start` | Production server (bundles the client once at boot) |
| `bun run typecheck` | Type-checks the JS (via JSDoc) with `tsc` |
| `bun run assets` | Regenerates the procedural tiles and sprites in `public/assets/generated` |
| `bun tools/slice-character.js revee` | Cuts a character sheet into sprites, poses, emotes and gear icons |

In development the browser console has `__rpg` (store, actions, and `__rpg.summon("eclipse" | "bound")` to call a hidden boss).

## Hidden co-op bosses

Run by the server (`server/world-bosses.js`) so everyone fights the same boss. A **Bond Shield** blocks damage until two different heroes land hits within 2.5 s.

- **Eclipse Titan**: rises in the Ashen Wastes during a Blood Moon (every 20 min, when 2+ heroes are online).
- **The Bound Colossus**: wakes when two heroes stand together on the Altar of Binding in Starfall Crater.

Tuning lives in `src/game/data/world-bosses.js`.

## Deploy to Render

The repo includes a `Dockerfile` (Render has no native Bun runtime) and a `render.yaml` Blueprint.

1. Push this repo to GitHub or GitLab.
2. In Render: **New > Blueprint**, pick the repo, and apply. It creates the `hollow-crown` web service.
3. Render builds the image, checks `/healthz`, and serves the game on its URL. WebSockets work out of the box.

Notes:

- The free plan sleeps after ~15 minutes idle (the first visit then takes a few seconds). Switch `plan` to `starter` in `render.yaml` to keep it awake.
- Player saves live in each browser's `localStorage`. The server keeps only live presence and hidden-boss state in memory, so a restart or redeploy resets any boss fight in progress.
- Run a single instance: multiplayer state is in-process and is not shared across instances.
