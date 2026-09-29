import express from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { createWorldBosses } from "./server/world-bosses.js";

const PORT = Number(process.env.PORT) || 3000;
const DEV = process.env.NODE_ENV !== "production";
const ROOT = import.meta.dir;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("trust proxy", true); // behind Render's load balancer

// The client (Phaser game + React UI) lives in src/ and is bundled by Bun.
// Dev rebuilds on every request (no watch step); production builds once at boot.
async function buildBundle() {
  const result = await Bun.build({
    entrypoints: [path.join(ROOT, "src/main.jsx")],
    target: "browser",
    external: ["phaser"], // served from node_modules via the import map
    sourcemap: DEV ? "inline" : "none",
    minify: !DEV,
    define: { "process.env.NODE_ENV": JSON.stringify(DEV ? "development" : "production") },
  });
  if (!result.success) throw new AggregateError(result.logs, "client bundle failed");
  return result.outputs[0].text();
}
const prodBundle = DEV ? null : await buildBundle();

app.get("/healthz", (req, res) => res.json({ ok: true, players: Object.keys(players).length }));

app.get("/bundle.js", async (req, res) => {
  try {
    const code = prodBundle ?? (await buildBundle());
    res.type("application/javascript").set("Cache-Control", DEV ? "no-store" : "no-cache").send(code);
  } catch (err) {
    console.error(err);
    const message = [err.message, ...(err.errors ?? []).map(String)].join("\n");
    res.status(500).type("application/javascript").send(`console.error(${JSON.stringify(message)});`);
  }
});

app.use(express.static(path.join(ROOT, "public"), { maxAge: DEV ? 0 : "1h" }));
app.use("/vendor/phaser", express.static(path.join(ROOT, "node_modules/phaser/dist"), { maxAge: DEV ? 0 : "7d" }));

// In-memory presence: socket.id -> player. Players become visible to others
// ("active") once they have entered the world and sent their first position.
/** @type {Record<string, any>} */
const players = {};
const DIRS = new Set(["up", "down", "left", "right"]);
const worldBosses = createWorldBosses(io, players);

io.on("connection", (socket) => {
  console.log(`player connected: ${socket.id}`);
  players[socket.id] = { id: socket.id, x: 0, y: 0, active: false };

  // Send the new player the current world, and tell everyone else about them
  socket.emit("init", { id: socket.id, players });
  worldBosses.onConnect(socket, { allowDebug: DEV });

  socket.on("move", (msg = {}) => {
    const player = players[socket.id];
    if (!player || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const wasActive = player.active;
    Object.assign(player, {
      x: msg.x,
      y: msg.y,
      dir: DIRS.has(msg.dir) ? msg.dir : "down",
      moving: !!msg.moving,
      dead: !!msg.dead,
      name: String(msg.name ?? "Wanderer").slice(0, 14),
      level: Math.max(1, Math.min(999, Math.floor(Number(msg.level) || 1))),
      characterId: String(msg.characterId ?? "").slice(0, 32),
      active: true,
    });
    socket.broadcast.emit(wasActive ? "playerMoved" : "playerJoined", player);
  });

  socket.on("disconnect", () => {
    console.log(`player disconnected: ${socket.id}`);
    delete players[socket.id];
    worldBosses.onDisconnect(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`RPG server running at http://localhost:${PORT} (${DEV ? "development" : "production"})`);
});
