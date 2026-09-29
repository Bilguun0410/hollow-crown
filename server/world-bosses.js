// Server-authoritative hidden bosses. The server decides when they appear,
// moves them, picks attacks and owns their HP; clients render them, report
// their own hits and resolve incoming attacks against their own hero.
import { WORLD_BOSS_RULES as R, WORLD_BOSSES, worldBossHp } from "../src/game/data/world-bosses.js";
import { WORLD_BOSS_SITES } from "../src/game/world/map.js";
import { TILE_SIZE as TS } from "../src/game/world/tiles.js";

/**
 * @param {import("socket.io").Server} io
 * @param {Record<string, { id: string, x: number, y: number, active: boolean, dead?: boolean, name?: string }>} players
 */
export function createWorldBosses(io, players) {
  /** @type {Map<string, any>} */
  const alive = new Map();
  /** @type {Record<string, number>} */
  const cooldownUntil = {};
  let nextBloodMoon = Date.now() + R.bloodMoonEveryMs;
  let altarSince = 0;

  const heroes = () => Object.values(players).filter((p) => p.active && !p.dead);
  const home = (id) => ({ x: WORLD_BOSS_SITES[id].x * TS + TS / 2, y: WORLD_BOSS_SITES[id].y * TS + TS / 2 });
  const within = (x, y, r) => heroes().filter((p) => Math.hypot(p.x - x, p.y - y) <= r);
  const available = (id, now) => !alive.has(id) && now >= (cooldownUntil[id] ?? 0);

  const view = (b, now = Date.now()) => ({
    id: b.id,
    x: Math.round(b.x),
    y: Math.round(b.y),
    hp: Math.max(0, Math.round(b.hp)),
    maxHp: b.maxHp,
    shield: now >= b.shieldDownUntil,
    target: b.targetId,
  });

  function spawn(id) {
    const now = Date.now();
    const h = home(id);
    const maxHp = worldBossHp(id, heroes().length);
    const boss = {
      id,
      home: h,
      x: h.x,
      y: h.y,
      hp: maxHp,
      maxHp,
      shieldDownUntil: 0,
      hits: new Map(), // socket id -> last hit time (for the Bond)
      damage: new Map(), // socket id -> total damage (reward eligibility)
      lastHitAt: new Map(),
      nextAttack: now + 3000,
      attackIndex: 0,
      lastSeenHeroAt: now,
      targetId: null,
    };
    alive.set(id, boss);
    const def = WORLD_BOSSES[id];
    io.emit("wb:spawn", view(boss, now));
    io.emit("wb:announce", { id, text: `${def.name} has awoken!`, sub: def.title });
  }

  function checkConditions(now) {
    // Blood Moon: on a timer, but only when there is a team to face it.
    if (now >= nextBloodMoon) {
      if (available("eclipse", now) && heroes().length >= R.bloodMoonMinHeroes) {
        io.emit("wb:announce", { id: "eclipse", text: "The Blood Moon rises…", sub: "Something vast stirs in the Ashen Wastes." });
        spawn("eclipse");
        nextBloodMoon = now + R.bloodMoonEveryMs;
      } else nextBloodMoon = now + R.bloodMoonRetryMs;
    }

    // Altar of Binding: enough heroes standing on it together, long enough.
    const [x0, y0, x1, y1] = WORLD_BOSS_SITES.bound.altar;
    const onAltar = heroes().filter((p) => {
      const tx = Math.floor(p.x / TS);
      const ty = Math.floor((p.y - 4) / TS);
      return tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
    });
    const ready = onAltar.length >= R.altarMinHeroes && available("bound", now);
    altarSince = ready ? altarSince || now : 0;
    const progress = ready ? Math.min(1, (now - altarSince) / R.altarHoldMs) : 0;
    for (const p of onAltar) {
      io.to(p.id).emit("wb:altar", { count: onAltar.length, needed: R.altarMinHeroes, progress, sleeping: !available("bound", now) });
    }
    if (ready && progress >= 1) {
      altarSince = 0;
      spawn("bound");
    }
  }

  function step(b, now) {
    const def = WORLD_BOSSES[b.id];
    const { leash } = WORLD_BOSS_SITES[b.id];
    const nearby = within(b.home.x, b.home.y, leash + 500);
    if (nearby.length) b.lastSeenHeroAt = now;
    else if (now - b.lastSeenHeroAt > R.idleDespawnMs) {
      alive.delete(b.id);
      io.emit("wb:despawn", { id: b.id, text: `${def.name} fades from the world…` });
      return;
    }

    let target = null;
    let best = Infinity;
    for (const p of nearby) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < best) [best, target] = [d, p];
    }
    b.targetId = target?.id ?? null;

    const enraged = b.hp < b.maxHp * 0.5;
    const dt = R.tickMs / 1000;
    const goal = target && best > 110 ? target : !target ? b.home : null;
    if (goal) {
      const a = Math.atan2(goal.y - b.y, goal.x - b.x);
      const speed = def.speed * (enraged ? 1.3 : 1);
      b.x += Math.cos(a) * speed * dt;
      b.y += Math.sin(a) * speed * dt;
    }
    const dx = b.x - b.home.x;
    const dy = b.y - b.home.y;
    const d = Math.hypot(dx, dy);
    if (d > leash) {
      b.x = b.home.x + (dx / d) * leash;
      b.y = b.home.y + (dy / d) * leash;
    }

    if (target && now >= b.nextAttack) {
      attack(b, nearby, target, enraged);
      b.nextAttack = now + (enraged ? 1700 : 2400);
    }
  }

  function attack(b, nearby, target, enraged) {
    const def = WORLD_BOSSES[b.id];
    const kind = ["slam", "nova", "meteor"][b.attackIndex++ % 3];
    const jitter = () => (Math.random() - 0.5) * 80;
    if (kind === "slam") {
      io.emit("wb:attack", { id: b.id, kind, delay: 900, atk: def.atk * 1.3, spots: [{ x: target.x, y: target.y, r: 150 }] });
    } else if (kind === "meteor") {
      const spots = nearby.map((p) => ({ x: p.x + jitter(), y: p.y + jitter(), r: 110 }));
      for (let i = 0; i < (enraged ? 4 : 2); i++) spots.push({ x: b.x + jitter() * 4, y: b.y + jitter() * 3, r: 110 });
      io.emit("wb:attack", { id: b.id, kind, delay: 1100, atk: def.atk * 1.1, spots });
    } else {
      io.emit("wb:attack", { id: b.id, kind, x: b.x, y: b.y - 70, count: enraged ? 22 : 16, speed: 230, offset: Math.random() * Math.PI, atk: def.atk * 0.7, tint: def.shotTint });
    }
  }

  function hit(socket, msg) {
    const b = alive.get(msg?.id);
    const p = players[socket.id];
    const dmg = Number(msg?.dmg);
    if (!b || !p?.active || !Number.isFinite(dmg) || dmg <= 0) return;
    const now = Date.now();
    if (now - (b.lastHitAt.get(socket.id) ?? 0) < R.minHitIntervalMs) return;
    b.lastHitAt.set(socket.id, now);

    // The Bond: two different heroes hitting within the window drops the shield.
    b.hits.set(socket.id, now);
    const bonded = [...b.hits.values()].filter((t) => now - t <= R.bondWindowMs).length >= 2;
    if (now >= b.shieldDownUntil && bonded) {
      b.shieldDownUntil = now + R.shieldDownMs;
      io.emit("wb:shield", { id: b.id, down: true, ms: R.shieldDownMs });
    }
    if (now >= b.shieldDownUntil) {
      socket.emit("wb:immune", { id: b.id });
      return;
    }

    const amount = Math.min(Math.round(dmg), R.maxHitDamage);
    b.hp -= amount;
    b.damage.set(socket.id, (b.damage.get(socket.id) ?? 0) + amount);
    if (b.hp <= 0) defeat(b, now);
  }

  function defeat(b, now) {
    const def = WORLD_BOSSES[b.id];
    alive.delete(b.id);
    cooldownUntil[b.id] = now + R.cooldownMs;
    const team = [...b.damage.keys()].filter((sid) => players[sid]);
    for (const sid of team) {
      io.to(sid).emit("wb:reward", { id: b.id, exp: def.exp, gems: def.gems, shards: def.shards, team: team.length });
    }
    io.emit("wb:defeated", { id: b.id, x: b.x, y: b.y, team: team.map((sid) => players[sid].name ?? "Wanderer") });
  }

  const timer = setInterval(() => {
    const now = Date.now();
    checkConditions(now);
    for (const b of [...alive.values()]) step(b, now);
    if (alive.size) io.emit("wb:state", [...alive.values()].map((b) => view(b, now)));
  }, R.tickMs);

  return {
    /** @param {import("socket.io").Socket} socket */
    onConnect(socket, { allowDebug = false } = {}) {
      socket.emit("wb:state", [...alive.values()].map((b) => view(b)));
      socket.on("wb:hit", (msg) => hit(socket, msg));
      // Development only: summon a boss without meeting its condition.
      if (allowDebug) socket.on("wb:debugSummon", (id) => WORLD_BOSSES[id] && !alive.has(id) && spawn(id));
    },
    onDisconnect(socketId) {
      for (const b of alive.values()) b.hits.delete(socketId);
    },
    stop: () => clearInterval(timer),
  };
}
