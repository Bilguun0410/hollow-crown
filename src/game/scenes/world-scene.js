import Phaser from "phaser";
import { SCENE_KEYS } from "./scene-keys.js";
import { FONT_FAMILY, ITEM_ASSET_KEY } from "./asset-keys.js";
import { spriteKey, TILESET_KEY } from "../assets/sprite-defs.js";
import { CHARACTERS } from "../data/characters.js";
import { BOSS_TYPES } from "../data/monsters.js";
import { WORLD_BOSSES } from "../data/world-bosses.js";
import { Player } from "../entities/player.js";
import { Enemy, Monster } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";
import { WorldBoss } from "../entities/world-boss.js";
import { Chest, Pickup, Projectile } from "../entities/props.js";
import { buildWorld, randomTileIn, regionAt, SPAWN_ZONES, WORLD_BOSS_SITES } from "../world/map.js";
import { CUTTABLE, isWaterId, SOLID_TILES, TILE, TILE_SIZE } from "../world/tiles.js";
import { events, store } from "../state/store.js";
import * as A from "../state/actions.js";
import { sfx } from "../sfx.js";
import { connectNet } from "../net.js";

const TS = TILE_SIZE;
const FX_DEPTH = 100000;
const PARTICLES = {
  puff: { lifespan: 480, speed: { min: 40, max: 150 }, scale: { start: 2, end: 0 }, alpha: { start: 1, end: 0 } },
  spark: { lifespan: 380, speed: { min: 60, max: 200 }, scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 } },
  leaf: { lifespan: 650, speed: { min: 50, max: 140 }, scale: { start: 1.6, end: 0.4 }, alpha: { start: 1, end: 0 }, gravityY: 260, rotate: { min: 0, max: 360 } },
};
/** @type {Record<string, "attack" | "special" | "dash" | "interact">} */
const TAP_ACTIONS = {
  KeyJ: "attack",
  Space: "attack",
  KeyK: "special",
  KeyL: "dash",
  KeyE: "interact",
};
const GEM_COLORS = { gem_green: "#6dff8a", gem_blue: "#7ab8ff", gem_red: "#ff7a8e" };
/** How close a hidden boss must be before its HP bar shows. */
const WORLD_BOSS_BAR_RANGE = 1000;

/** @param {number} value */
const splitGems = (value) => {
  const out = [];
  for (const d of [20, 5, 1]) while (value >= d && out.length < 8) (value -= d), out.push(d);
  return out;
};
/** @param {number} v */
const gemTexture = (v) => (v >= 20 ? "gem_red" : v >= 5 ? "gem_blue" : "gem_green");

/** @typedef {Record<"up" | "down" | "left" | "right" | "up2" | "down2" | "left2" | "right2" | "attack" | "attack2" | "special" | "dash" | "sprint" | "interact", Phaser.Input.Keyboard.Key>} Keys */
/** @typedef {Enemy | WorldBoss} Target anything the hero's attacks can hit */
/** @typedef {"melee" | "bolt" | "thorns" | "blossom"} DamageSource */

export class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.WORLD_SCENE });
  }

  create() {
    const s = store.get();
    this.world = buildWorld();
    /** @type {Record<string, Phaser.GameObjects.Particles.ParticleEmitter>} */
    this.emitters = {};
    this.bossDamageTaken = 0;
    this.nextTick = 0;
    this.nextRespawn = 0;
    this.nextRegen = 0;
    this.nextImmuneHint = 0;
    this.stats = A.getStats();
    const W = this.world.width * TS;
    const H = this.world.height * TS;

    // ---- terrain
    const map = this.make.tilemap({ data: this.world.ids, tileWidth: TS, tileHeight: TS });
    const tileset = map.addTilesetImage("tiles", TILESET_KEY, TS, TS, 0, 0);
    this.layer = map.createLayer(0, tileset, 0, 0).setDepth(0);
    this.layer.setCollision(SOLID_TILES);
    this.physics.world.setBounds(0, 0, W, H);

    // ---- hero
    const ch = CHARACTERS[s.hero.characterId];
    const { start } = this.world;
    this.player = new Player(this, start.x * TS, start.y * TS, ch);
    this.physics.add.collider(this.player, this.layer);

    // ---- groups
    this.monsters = this.physics.add.group({ collideWorldBounds: true });
    this.pickups = this.physics.add.group({ collideWorldBounds: true });
    /** @type {Chest[]} */
    this.chests = [];
    /** @type {Boss[]} */
    this.bosses = [];
    /** @type {Projectile[]} enemy projectiles, hit-tested by hand against the hero's hurtbox */
    this.shots = [];
    /** @type {Projectile[]} */
    this.bolts = [];
    /** @type {Map<string, WorldBoss>} */
    this.worldBosses = new Map();
    /** @type {{ count: number, needed: number, progress: number, sleeping: boolean, at: number } | null} */
    this.altarStatus = null;

    const notFlying = (/** @type {any} */ a, /** @type {any} */ b) => !a.flying && !b?.flying;
    this.physics.add.collider(this.monsters, this.layer, undefined, notFlying);
    this.physics.add.collider(this.monsters, this.monsters, undefined, notFlying);
    this.physics.add.overlap(this.player, this.monsters, (_, m) => this.contact(/** @type {Enemy} */ (/** @type {unknown} */ (m))));
    this.physics.add.collider(this.pickups, this.layer);
    this.physics.add.overlap(this.player, this.pickups, (_, item) => this.collect(/** @type {Pickup} */ (/** @type {unknown} */ (item))));

    this.createChests(s);
    this.physics.add.collider(this.player, this.chests);
    this.createBosses(s);
    for (const sp of this.world.spawns) this.spawnMonster(sp.type, sp.x * TS + TS / 2, sp.y * TS + TS - 6, sp.zone);

    // ---- camera & input
    this.cameras.main.setBounds(0, 0, W, H).startFollow(this.player, true, 0.14, 0.14, 0, 38).fadeIn(450, 0, 0, 0);
    const keyboard = /** @type {Phaser.Input.Keyboard.KeyboardPlugin} */ (this.input.keyboard);
    /** @type {Keys} */
    this.keys = /** @type {Keys} */ (
      keyboard.addKeys({
        up: "W", down: "S", left: "A", right: "D",
        up2: "UP", down2: "DOWN", left2: "LEFT", right2: "RIGHT",
        attack: "J", attack2: "SPACE", special: "K", dash: "L", sprint: "SHIFT", interact: "E",
      })
    );
    // Key polling misses taps pressed and released within one frame, so
    // action keys are also buffered from raw keydown events.
    /** @type {Set<string>} */
    this.tapped = new Set();
    keyboard.on("keydown", (/** @type {KeyboardEvent} */ e) => {
      const action = TAP_ACTIONS[e.code];
      if (action) this.tapped.add(action);
    });

    // ---- store / event wiring
    const unsubs = [
      store.subscribe(() => this.syncPause()),
      events.on("levelUp", () => this.levelUpFx()),
      events.on("consumed", (id) => this.burst("spark", this.player.x, this.player.y - 40, 16, id === "potion" ? 0xff6b8a : 0x6fa8ff)),
      events.on("debug:summon", (id) => this.net?.debugSummon(id)),
    ];
    this.net = connectNet(this, ch, (name, payload) => this.onWorldBossEvent(name, payload));
    this.events.once("shutdown", () => {
      unsubs.forEach((u) => u());
      this.net?.disconnect();
      A.setWorldBossBar(null);
    });
    A.setRegion(regionAt(Math.floor(start.x), Math.floor(start.y)));
  }

  /** Live regular monsters and bosses. */
  get enemies() {
    return /** @type {Enemy[]} */ (/** @type {unknown} */ (this.monsters.getChildren()));
  }

  /** Everything the hero can currently hit (dormant bosses excluded). */
  targets() {
    /** @type {Target[]} */
    const list = this.enemies.filter((m) => !m.dead && !(m instanceof Boss && !m.engaged));
    for (const b of this.worldBosses.values()) list.push(b);
    return list;
  }

  syncPause() {
    const s = store.get();
    // A pending level-up pick (perkOffer) freezes the world until chosen.
    const shouldPause = !!s.overlay || !!s.perkOffer?.length || s.screen !== "playing";
    if (shouldPause && this.scene.isActive()) this.scene.pause();
    else if (!shouldPause && this.scene.isPaused()) {
      this.scene.resume();
      this.input.keyboard?.resetKeys();
    }
  }

  // ------------------------------------------------------------------ setup

  createChests(s) {
    for (const c of this.world.chests) {
      const chest = new Chest(this, c.x * TS + TS / 2, c.y * TS + TS / 2, c, s.world.chestsOpened.includes(c.id));
      chest.setDepth(c.y * TS + TS - 4);
      this.chests.push(chest);
    }
  }

  createBosses(s) {
    const defeated = s.world.bossesDefeated;
    for (const cfg of this.world.bosses) {
      const sealed = cfg.sealedUntil && !defeated.includes(cfg.sealedUntil);
      if (!sealed) this.setDoors(cfg, "open");
      // Gear the hero never picked up (died or reloaded first) waits where the boss fell.
      const item = A.heroGear(BOSS_TYPES[cfg.id].drops.gear, s);
      if (defeated.includes(cfg.id) && item && !s.owned.includes(item)) {
        this.spawnPickup("item", cfg.x * TS, cfg.y * TS, 1, item).setVelocity(0, 0);
      }
      if (A.bossPresent(s, cfg.id)) this.spawnBoss(cfg, A.bossTier(s, cfg.id));
    }
  }

  spawnBoss(cfg, tier) {
    const [x0, y0, x1, y1] = cfg.arena;
    const arena = new Phaser.Geom.Rectangle(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
    const boss = new Boss(this, { ...cfg, x: cfg.x * TS, y: cfg.y * TS }, arena, tier);
    this.monsters.add(boss);
    boss.setImmovable(true);
    this.bosses.push(boss);
    return boss;
  }

  /** Bring back defeated bosses whose return time has come (timer or shrine rematch). */
  returnBosses() {
    const s = store.get();
    const p = this.player;
    for (const cfg of this.world.bosses) {
      if (this.bosses.some((b) => b.id === cfg.id) || !A.bossPresent(s, cfg.id)) continue;
      const [x0, y0, x1, y1] = cfg.arena;
      const inArena = p.x >= x0 * TS && p.x <= (x1 + 1) * TS && p.y >= y0 * TS && p.y <= (y1 + 2) * TS;
      if (inArena) continue; // never pop in on top of the hero; wait until they leave
      const boss = this.spawnBoss(cfg, A.bossTier(s, cfg.id));
      boss.setAlpha(0);
      this.tweens.add({ targets: boss, alpha: 1, duration: 800 });
      A.toast(`${boss.def.name} has returned`, { kind: "level", sub: `Empowered ★${boss.tier}` });
    }
  }

  /** @param {{ doors: number[][], openTile?: string }} cfg */
  setDoors(cfg, state) {
    const open = TILE[cfg.openTile ?? "gateopen"];
    for (const [x, y] of cfg.doors) this.layer.putTileAt(state === "closed" ? TILE.gate : open, x, y);
  }

  spawnMonster(type, x, y, zone) {
    const m = new Monster(this, x, y, type, zone);
    this.monsters.add(m);
    m.setAlpha(0);
    this.tweens.add({ targets: m, alpha: 1, duration: 300 });
    return m;
  }

  // ------------------------------------------------------------------ loop

  update(time) {
    const k = this.keys;
    const tap = this.tapped;
    const input = {
      up: k.up.isDown || k.up2.isDown,
      down: k.down.isDown || k.down2.isDown,
      left: k.left.isDown || k.left2.isDown,
      right: k.right.isDown || k.right2.isDown,
      attack: tap.has("attack") || k.attack.isDown || k.attack2.isDown,
      special: tap.has("special") || k.special.isDown,
      dash: tap.has("dash") || k.dash.isDown,
      sprint: k.sprint.isDown,
    };
    this.stats = A.getStats();
    this.player.update(time, input);
    if (tap.has("interact")) this.interact();
    tap.clear();

    const p = this.player;
    for (const m of this.enemies.slice()) {
      if (m.dead) continue;
      const far = Math.abs(m.x - p.x) > 900 || Math.abs(m.y - p.y) > 700;
      if (far && !(m instanceof Boss)) {
        m.setVelocity(0, 0);
        continue;
      }
      /** @type {Monster | Boss} */ (m).think(time, p);
    }
    for (const b of this.worldBosses.values()) b.tick(time);

    this.updateBosses();
    this.updateProjectiles(time);
    this.updatePickups(time);

    if (time >= this.nextTick) {
      this.nextTick = time + 200;
      A.setRegion(regionAt(Math.floor(p.x / TS), Math.floor((p.y - 10) / TS)));
      this.updatePrompt();
      this.updateWorldBossBar();
    }
    if (time >= this.nextRespawn) {
      this.nextRespawn = time + 3000;
      this.respawnTick();
    }
    if (time >= this.nextRegen) {
      this.nextRegen = time + 1000;
      this.regenTick();
    }
    this.net?.update(time);
  }

  /** Once a second: passive HP/MP regeneration. */
  regenTick() {
    const { hpRegen, mpRegen, maxHp, maxMp } = this.stats;
    if (this.player.mode === "dead") return;
    const { hero } = store.get();
    if (hpRegen > 0 && hero.hp < maxHp) A.heal(hpRegen);
    if (mpRegen > 0 && hero.mp < maxMp) A.restoreMp(mpRegen);
  }

  // ------------------------------------------------------------------ combat

  /** @param {Phaser.Geom.Rectangle} rect */
  meleeHit(rect, { power = 1, knock = 240 } = {}) {
    const { x, y } = this.player;
    for (const m of this.targets()) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, m.getBounds())) {
        this.damageEnemy(m, this.stats.atk * power, { source: "melee", fromX: x, fromY: y, knock });
      }
    }
    this.cutTiles(this.layer.getTilesWithinWorldXY(rect.x, rect.y, rect.width, rect.height));
  }

  /** Circular melee hit (Whirlwind): every enemy and cuttable tile in range. */
  areaHit(cx, cy, radius, { power = 1, knock = 240 } = {}) {
    for (const m of this.targets()) {
      const b = m.getBounds();
      const nx = Phaser.Math.Clamp(cx, b.left, b.right);
      const ny = Phaser.Math.Clamp(cy, b.top, b.bottom);
      if (Phaser.Math.Distance.Between(cx, cy, nx, ny) <= radius) {
        this.damageEnemy(m, this.stats.atk * power, { source: "melee", fromX: cx, fromY: cy, knock });
      }
    }
    const tiles = this.layer.getTilesWithinWorldXY(cx - radius, cy - radius, radius * 2, radius * 2);
    this.cutTiles(tiles.filter((t) => Phaser.Math.Distance.Between(cx, cy, t.getCenterX(), t.getCenterY()) <= radius));
  }

  /** @param {Phaser.Tilemaps.Tile[]} tiles */
  cutTiles(tiles) {
    for (const t of tiles) {
      const to = CUTTABLE[t.index];
      if (to === undefined) continue;
      this.layer.putTileAt(to, t.x, t.y);
      this.onCut(t.pixelX + TS / 2, t.pixelY + TS / 2);
    }
  }

  /**
   * "melee" | "bolt" are the hero's own attacks, so crits and damage passives
   * apply. "thorns" | "blossom" are secondary damage: no crits, no chaining.
   * @param {Target} m
   * @param {number} base
   * @param {{ source: DamageSource, fromX: number, fromY: number, knock?: number }} opts
   */
  damageEnemy(m, base, { source, fromX, fromY, knock = 0 }) {
    if (m.dead) return;
    const st = this.stats;
    const byHero = source === "melee" || source === "bolt";
    let dmg = base * (0.9 + Math.random() * 0.2) - m.def.def * 0.5;
    let crit = false;
    if (byHero) {
      const { hp } = store.get().hero;
      if (st.flags.has("berserker")) dmg *= 1 + 0.6 * (1 - hp / st.maxHp);
      if (st.flags.has("executioner") && m.hp < m.maxHp * 0.3) dmg *= 1.75;
      crit = Math.random() < st.critRate;
      if (crit) dmg *= st.critDmg;
    }
    dmg = Math.max(1, Math.round(dmg * m.vulnerability));
    const top = m.y - m.displayHeight + (m.flying ? 10 : 0);
    let killed = false;

    // Hidden bosses: the server owns their HP and may bounce the hit off the Bond Shield.
    if (m instanceof WorldBoss) {
      if (!byHero || !this.net) return;
      this.net.hitWorldBoss(m.id, dmg);
      if (m.shield) {
        this.floatText(m.x, top, "IMMUNE", "#9ff8ff", 24);
        sfx.error();
        return;
      }
    } else {
      killed = m.takeHit(dmg, fromX, fromY, knock);
      if (m instanceof Boss) A.updateBossHp(m.hp);
    }

    const color = crit ? "#ffe066" : byHero ? "#ffffff" : "#ff9ad5";
    this.floatText(m.x, top, crit ? `${dmg}!` : `${dmg}`, color, crit ? 32 : 24);
    this.burst("spark", m.x, m.y - m.displayHeight / 2, crit ? 10 : 5, 0xffffff);
    if (crit) {
      sfx.crit();
      this.cameras.main.shake(80, 0.004);
    } else sfx.hit();

    if (byHero && st.lifesteal > 0) A.heal(Math.max(1, Math.round(dmg * st.lifesteal)));
    if (crit && st.flags.has("fatalBlossom")) this.blossom(m, dmg);
    if (killed && m instanceof Enemy) this.killEnemy(m); // last: it destroys the sprite
  }

  /**
   * Fatal Blossom: a crit bursts outward, hitting nearby foes for half.
   * @param {Target} origin
   */
  blossom(origin, dmg) {
    const { x, y } = origin;
    this.shockwave(x, y - 20, 110);
    this.burst("spark", x, y - 20, 16, 0xff7ac8);
    for (const o of this.targets()) {
      if (o === origin || o instanceof WorldBoss) continue;
      if (Phaser.Math.Distance.Between(o.x, o.y, x, y) > 110) continue;
      this.damageEnemy(o, dmg * 0.5, { source: "blossom", fromX: x, fromY: y, knock: 140 });
    }
  }

  /** @param {Enemy} m */
  killEnemy(m) {
    if (!m.active) return;
    if (m instanceof Boss) return this.killBoss(m);
    const monster = /** @type {Monster} */ (m);
    sfx.kill();
    this.burst("puff", m.x, m.y - 20, 14, monster.type === "redslime" ? 0xff8a6a : monster.type === "slime" ? 0x9be36a : 0xd6d0e6);
    const gained = A.gainExp(m.def.exp);
    this.floatText(m.x, m.y - 56, `+${gained} EXP`, "#b4f06a", 20);
    if (this.stats.mpOnKill) A.restoreMp(this.stats.mpOnKill);
    A.recordKill(monster.type);
    if (monster.zone !== "boss") this.dropLoot(m.def.drops, m.x, m.y - 16);
    m.destroy();
  }

  /** @param {Boss} b */
  killBoss(b) {
    const flawless = this.bossDamageTaken === 0;
    b.setVelocity(0, 0);
    b.arcadeBody.enable = false;
    sfx.roar();
    this.cameras.main.shake(900, 0.012);
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(i * 110, () => {
        this.burst("puff", b.x + Phaser.Math.Between(-40, 40), b.y - Phaser.Math.Between(10, 90), 12, i % 2 ? 0xffffff : 0xffc36a);
        sfx.hit();
      });
    }
    this.tweens.add({ targets: b, alpha: 0, duration: 1000, delay: 200 });
    // Clear leftover minions and projectiles in the arena.
    for (const m of this.enemies.slice()) {
      if (m instanceof Monster && m.zone === "boss") {
        this.burst("puff", m.x, m.y - 20, 8, 0xd6a8ff);
        m.destroy();
      }
    }
    this.shots.forEach((s) => s.destroy());
    this.shots = [];

    const firstKill = !store.get().world.bossesDefeated.includes(b.id);
    this.time.delayedCall(1150, () => {
      const def = b.def; // tier-scaled stats and rewards
      const gained = A.gainExp(def.exp);
      this.floatText(b.x, b.y - 100, `+${gained} EXP`, "#b4f06a", 34);
      this.dropLoot({ gems: def.drops.gems }, b.x, b.y - 30);
      for (let i = 0; i < def.drops.shards; i++) this.spawnPickup("shard", b.x, b.y - 30);
      const gear = A.heroGear(def.drops.gear);
      if (gear && !store.get().owned.includes(gear)) this.spawnPickup("item", b.x, b.y - 30, 1, gear);
      this.setDoors(b.cfg, "open");
      A.defeatBoss(b.id, flawless);
      this.bosses = this.bosses.filter((x) => x !== b);
      b.destroy();
      if (!firstKill) return; // story unlocks below only happen once
      const sealed = this.world.bosses.find((c) => c.sealedUntil === b.id);
      if (sealed) {
        this.setDoors(sealed, "open");
        sfx.gate();
        A.toast("A distant seal shatters…", { kind: "info", sub: "The Sanctum to the north is open." });
      }
      if (b.id === "wraith") this.time.delayedCall(2500, () => A.openOverlay("victory"));
    });
  }

  updateBosses() {
    const p = this.player;
    if (p.mode === "dead") return;
    for (const b of this.bosses) {
      if (b.engaged || b.dead || !b.arena.contains(p.x, p.y - 12)) continue;
      b.engage();
      this.bossDamageTaken = 0;
      this.setDoors(b.cfg, "closed");
      sfx.gate();
    }
  }

  /** @param {Enemy} m */
  contact(m) {
    if (m.dead || (m instanceof Boss && !m.engaged) || m.alpha < 0.5) return;
    const atk = m.def.atk * (m instanceof Boss ? m.contactMul : 1);
    const taken = this.player.hurt(atk, m.x, m.y);
    if (taken && this.stats.thorns > 0) {
      const { x, y } = this.player;
      this.damageEnemy(m, atk * this.stats.thorns, { source: "thorns", fromX: x, fromY: y, knock: 200 });
    }
  }

  onPlayerDamaged(dmg) {
    if (this.bosses.some((b) => b.engaged)) this.bossDamageTaken += dmg;
  }

  // ------------------------------------------------------------------ co-op world bosses

  /**
   * Events relayed from the server (see server/world-bosses.js).
   * @param {string} name
   * @param {any} msg
   */
  onWorldBossEvent(name, msg) {
    switch (name) {
      case "state": {
        const alive = new Set(msg.map((st) => st.id));
        for (const st of msg) this.upsertWorldBoss(st);
        for (const [id, b] of this.worldBosses) if (!alive.has(id)) (b.destroy(), this.worldBosses.delete(id));
        break;
      }
      case "spawn": {
        const b = this.upsertWorldBoss(msg);
        this.burst("spark", b.x, b.y - 60, 40, WORLD_BOSSES[b.id].shotTint);
        if (Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y) < 1200) this.cameras.main.shake(700, 0.012);
        break;
      }
      case "announce":
        A.toast(msg.text, { kind: "level", sub: msg.sub });
        sfx.roar();
        break;
      case "attack":
        this.worldBossAttack(msg);
        break;
      case "shield": {
        const b = this.worldBosses.get(msg.id);
        if (b) {
          b.shield = false;
          this.floatText(b.x, b.y - b.displayHeight - 20, "BOND! SHIELD SHATTERED", "#9ff8ff", 30);
          this.burst("spark", b.x, b.y - 70, 30, 0x9ff8ff);
          sfx.gate();
        }
        break;
      }
      case "immune":
        if (this.time.now >= this.nextImmuneHint) {
          this.nextImmuneHint = this.time.now + 6000;
          A.toast("The Bond Shield holds", { sub: "Strike together with another hero to shatter it." });
        }
        break;
      case "reward":
        A.worldBossReward(msg);
        this.burst("spark", this.player.x, this.player.y - 40, 50, 0xffe08a);
        break;
      case "defeated": {
        const b = this.worldBosses.get(msg.id);
        if (b) {
          for (let i = 0; i < 12; i++) {
            this.time.delayedCall(i * 90, () => this.burst("puff", b.x + Phaser.Math.Between(-70, 70), b.y - Phaser.Math.Between(10, 130), 14, i % 2 ? 0xffffff : 0xff6a6a));
          }
          this.tweens.add({ targets: b, alpha: 0, duration: 1200, onComplete: () => b.destroy() });
          this.worldBosses.delete(msg.id);
        }
        this.updateWorldBossBar(); // the loop may be paused by a level-up pick
        A.toast(`${WORLD_BOSSES[msg.id].name} has fallen`, { sub: `Heroes: ${msg.team.join(", ")}` });
        break;
      }
      case "despawn":
        this.worldBosses.get(msg.id)?.destroy();
        this.worldBosses.delete(msg.id);
        this.updateWorldBossBar();
        A.toast(msg.text);
        break;
      case "altar":
        this.altarStatus = { ...msg, at: this.time.now };
        break;
    }
  }

  upsertWorldBoss(st) {
    let b = this.worldBosses.get(st.id);
    if (!b) {
      b = new WorldBoss(this, st);
      this.worldBosses.set(st.id, b);
    }
    b.applyState(st);
    return b;
  }

  /**
   * Draw a boss attack and resolve it against this client's hero only.
   * @param {{ id: string, kind: string, delay?: number, atk: number, spots?: { x: number, y: number, r: number }[], x?: number, y?: number, count?: number, speed?: number, offset?: number, tint?: number }} msg
   */
  worldBossAttack(msg) {
    const p = this.player;
    const boss = this.worldBosses.get(msg.id);
    if (!boss || Phaser.Math.Distance.Between(boss.x, boss.y, p.x, p.y) > 1400) return;
    if (msg.kind === "nova") {
      for (let i = 0; i < msg.count; i++) {
        const angle = msg.offset + (i * Math.PI * 2) / msg.count;
        this.fireEnemyShot(msg.x, msg.y, angle, { texture: "orb", speed: msg.speed, atk: msg.atk, tint: msg.tint, scale: 1.4 });
      }
      return;
    }
    for (const spot of msg.spots) {
      const ring = this.add.circle(spot.x, spot.y, spot.r, 0xff3b3b, 0.12).setStrokeStyle(3, 0xff5a5a, 0.9).setDepth(2);
      this.tweens.add({ targets: ring, fillAlpha: 0.4, duration: msg.delay });
      this.time.delayedCall(msg.delay, () => {
        ring.destroy();
        this.shockwave(spot.x, spot.y, spot.r);
        this.burst("puff", spot.x, spot.y, 16, 0x9d9585);
        sfx.stomp();
        if (Phaser.Math.Distance.Between(spot.x, spot.y, p.x, p.y) <= spot.r + 8) p.hurt(msg.atk, spot.x, spot.y);
      });
    }
  }

  /** Show the HP bar for the nearest hidden boss. */
  updateWorldBossBar() {
    let near = null;
    let best = WORLD_BOSS_BAR_RANGE;
    for (const b of this.worldBosses.values()) {
      const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y);
      if (d < best) [best, near] = [d, b];
    }
    A.setWorldBossBar(near && { id: near.id, name: near.def.name, title: near.def.title, hp: near.hp, maxHp: near.maxHp, shield: near.shield });
  }

  // ------------------------------------------------------------------ projectiles

  fireEnemyShot(x, y, angle, { texture, speed, atk, tint = undefined, spin = false, scale = 1 }) {
    const s = new Projectile(this, x, y, texture, { angle, speed, atk, tint, spin, scale, lifeMs: 4000 }).setDepth(FX_DEPTH);
    this.shots.push(s);
  }

  /** power: damage as a multiple of Attack (× Magic). Eclipse bolts use the default. */
  firePlayerBolt(x, y, dir, power = 1.4) {
    const base = Math.atan2(dir.y, dir.x);
    // Twin Bolt splits every cast into a three-way fan.
    const spread = this.stats.flags.has("twinBolt") ? [0, -0.26, 0.26] : [0];
    for (const offset of spread) this.spawnBolt(x, y, base + offset, power);
  }

  spawnBolt(x, y, angle, power) {
    const b = new Projectile(this, x, y, "orb", { angle, speed: 540, power, tint: 0x9ac4ff, scale: 1.3, lifeMs: 850 }).setDepth(FX_DEPTH);
    b.trail = this.add.particles(0, 0, spriteKey("px"), {
      lifespan: 280,
      speed: { min: 5, max: 25 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x9ac4ff, 0x7a5cff, 0xffffff],
      frequency: 16,
    });
    b.trail.startFollow(b).setDepth(FX_DEPTH - 1);
    this.bolts.push(b);
  }

  updateProjectiles(time) {
    const dt = this.game.loop.delta / 1000;
    const p = this.player;
    const hurtbox = new Phaser.Geom.Rectangle(p.x - 14, p.y - 70, 28, 66);
    // Projectiles fly at chest height, so test the tile just below them.
    const solidAt = (x, y) => {
      const t = this.layer.getTileAtWorldXY(x, y);
      return !t || (t.collides && !isWaterId(t.index) && t.index !== TILE.lava);
    };

    this.shots = this.shots.filter((s) => {
      s.advance(dt);
      if (time > s.expiresAt || solidAt(s.x, s.y + 10)) {
        this.burst("puff", s.x, s.y, 5, 0xcfcfcf);
        s.destroy();
        return false;
      }
      if (hurtbox.contains(s.x, s.y) && !p.isInvulnerable(time)) {
        p.hurt(s.atk, s.x - s.vx, s.y - s.vy);
        this.burst("spark", s.x, s.y, 6, s.color);
        s.destroy();
        return false;
      }
      return true;
    });

    const st = this.stats;
    this.bolts = this.bolts.filter((b) => {
      b.advance(dt);
      const hit = this.targets().find((m) => m.getBounds().contains(b.x, b.y));
      if (hit) {
        this.damageEnemy(hit, st.atk * b.power * st.magic, { source: "bolt", fromX: b.x - b.vx, fromY: b.y - b.vy, knock: 180 });
      }
      if (hit || time > b.expiresAt || solidAt(b.x, b.y + 20)) {
        this.burst("spark", b.x, b.y, 10, 0x9ac4ff);
        b.destroy();
        return false;
      }
      return true;
    });
  }

  // ------------------------------------------------------------------ loot

  dropLoot(drops, x, y) {
    if (drops.gems) {
      const [min, max] = drops.gems;
      for (const v of splitGems(Phaser.Math.Between(min, max))) this.spawnPickup("gem", x, y, v);
    }
    const boost = 1 + this.stats.dropBoost;
    for (const kind of /** @type {const} */ (["heart", "potion", "ether", "shard"])) {
      if (drops[kind] && Math.random() < drops[kind] * boost) this.spawnPickup(kind, x, y);
    }
  }

  /**
   * @param {"gem" | "heart" | "potion" | "ether" | "shard" | "item"} kind
   * @param {string | null} itemId
   */
  spawnPickup(kind, x, y, value = 1, itemId = null) {
    const key = kind === "item" ? ITEM_ASSET_KEY(itemId) : spriteKey(kind === "gem" ? gemTexture(value) : kind);
    const it = new Pickup(this, x, y, kind, key, value, itemId);
    this.pickups.add(it);
    if (kind === "item") it.setScale(44 / it.height);
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 130;
    it.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp).setDrag(420, 420).setDepth(y);
    return it;
  }

  updatePickups(time) {
    const p = this.player;
    const { magnet } = this.stats;
    const items = /** @type {Pickup[]} */ (/** @type {unknown} */ (this.pickups.getChildren()));
    for (const it of items.slice()) {
      if (time > it.expiresAt) {
        it.destroy();
        continue;
      }
      if (it.expiresAt - time < 5000) it.setAlpha(Math.floor(time / 120) % 2 ? 0.3 : 1);
      if (time - it.spawnedAt > 400 && p.mode !== "dead" && Phaser.Math.Distance.Between(it.x, it.y, p.x, p.y - 20) < magnet) {
        const a = Phaser.Math.Angle.Between(it.x, it.y, p.x, p.y - 20);
        it.setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
      }
      it.setDepth(it.y);
    }
  }

  /** @param {Pickup} it */
  collect(it) {
    if (!it.active || this.time.now - it.spawnedAt < 400 || this.player.mode === "dead") return;
    const { x, y } = it;
    switch (it.kind) {
      case "gem": {
        const value = Math.round(it.value * (1 + this.stats.gemBoost));
        A.addCurrency("gems", value);
        sfx.gem();
        this.floatText(x, y - 10, `+${value}`, GEM_COLORS[gemTexture(it.value)], 20);
        break;
      }
      case "heart":
        A.heal(Math.ceil(this.stats.maxHp * 0.12));
        sfx.heart();
        this.floatText(x, y - 10, "+HP", "#ff8a9a", 20);
        break;
      case "shard":
        A.addCurrency("shards", 1);
        sfx.coin();
        this.floatText(x, y - 10, "+1 shard", "#d6a8ff", 20);
        break;
      case "potion":
      case "ether":
        A.addConsumable(it.kind);
        sfx.coin();
        this.floatText(x, y - 10, it.kind === "potion" ? "+Red Tonic" : "+Blue Ether", it.kind === "potion" ? "#ff8a9a" : "#8ab8ff", 20);
        break;
      case "item":
        if (it.itemId) A.grantItem(it.itemId);
        sfx.chest();
        break;
    }
    it.destroy();
  }

  onCut(x, y) {
    sfx.cut();
    A.recordCut();
    this.burst("leaf", x, y, 10, 0x7cc65a);
    const r = Math.random();
    if (r < 0.14) this.spawnPickup("gem", x, y, Math.random() < 0.15 ? 5 : 1);
    else if (r < 0.2) this.spawnPickup("heart", x, y);
  }

  // ------------------------------------------------------------------ interaction

  /** @returns {{ kind: "chest", obj: Chest } | { kind: "shrine" | "seal" | "altar" | "eclipse" } | null} */
  findInteractable() {
    const p = this.player;
    const px = p.x;
    const py = p.y - 12;
    for (const c of this.chests) {
      if (!c.opened && Phaser.Math.Distance.Between(px, py, c.x, c.y) < 64) return { kind: "chest", obj: c };
    }
    const sh = this.world.shrine;
    if (Phaser.Math.Distance.Between(px, py, sh.x * TS + TS / 2, sh.y * TS + TS / 2) < 70) return { kind: "shrine" };
    for (const cfg of this.world.bosses) {
      if (!cfg.sealedUntil || store.get().world.bossesDefeated.includes(cfg.sealedUntil)) continue;
      const [dx, dy] = cfg.doors[0];
      if (Phaser.Math.Distance.Between(px, py, dx * TS + TS, dy * TS + TS) < 110) return { kind: "seal" };
    }
    const tx = Math.floor(px / TS);
    const ty = Math.floor(py / TS);
    const [ax0, ay0, ax1, ay1] = WORLD_BOSS_SITES.bound.altar;
    if (tx >= ax0 && tx <= ax1 && ty >= ay0 && ty <= ay1) return { kind: "altar" };
    const ec = WORLD_BOSS_SITES.eclipse;
    if (!this.worldBosses.has("eclipse") && Math.hypot(tx - ec.x, ty - ec.y) < 4) return { kind: "eclipse" };
    return null;
  }

  altarPrompt() {
    if (this.worldBosses.has("bound")) return "The Colossus is awake. Fight together!";
    if (!this.net) return "The Altar of Binding needs two heroes. Play online with a friend to wake what sleeps below.";
    const st = this.altarStatus;
    if (!st || this.time.now - st.at > 600) return "Altar of Binding · waiting for another hero…";
    if (st.sleeping) return "The chains are still settling. The Colossus will stir again later.";
    if (st.count < st.needed) return `Altar of Binding · ${st.count}/${st.needed} heroes. Call an ally to stand with you.`;
    return `The chains tremble… ${Math.round(st.progress * 100)}%`;
  }

  updatePrompt() {
    if (this.player.mode === "dead") return A.setPrompt(null);
    const t = this.findInteractable();
    /** @type {Record<string, string>} */
    const text = {
      chest: "E · Open the chest",
      shrine: "E · Pray at the shrine  (heal · save · shop)",
      seal: "A violet seal bars the way. Defeat the Warden of the Ruins to the east.",
      eclipse: "Scorched glass in the sand… something vast fell here. It returns under a Blood Moon.",
    };
    A.setPrompt(t?.kind === "altar" ? this.altarPrompt() : (t && text[t.kind]) ?? null);
  }

  interact() {
    if (this.player.mode === "dead") return;
    const t = this.findInteractable();
    if (t?.kind === "chest") {
      const c = t.obj;
      c.opened = true;
      c.setFrame(1);
      A.openChest(c.chest.id, c.chest.loot);
      this.burst("spark", c.x, c.y - 10, 18, 0xffe08a);
      const loot = c.chest.loot;
      const gear = loot.item ?? A.heroGear(loot.gear);
      const icon = gear ? ITEM_ASSET_KEY(gear) : spriteKey(loot.shards ? "shard" : loot.potion ? "potion" : "gem_blue");
      const img = this.add.image(c.x, c.y - 20, icon).setDepth(FX_DEPTH);
      img.setScale((gear ? 44 : 30) / img.height);
      this.tweens.add({ targets: img, y: c.y - 70, duration: 600, ease: "Back.easeOut" });
      this.tweens.add({ targets: img, alpha: 0, delay: 1400, duration: 400, onComplete: () => img.destroy() });
    } else if (t?.kind === "shrine") {
      A.prayAtShrine();
      this.burst("spark", this.player.x, this.player.y - 40, 20, 0x9fe8ff);
    }
  }

  respawnTick() {
    this.returnBosses();
    /** @type {Record<string, number>} */
    const counts = {};
    for (const m of this.enemies) if (m instanceof Monster && !m.dead) counts[`${m.zone}:${m.type}`] = (counts[`${m.zone}:${m.type}`] ?? 0) + 1;
    const p = this.player;
    for (const zone of SPAWN_ZONES) {
      for (const [type, quota] of Object.entries(zone.monsters)) {
        if ((counts[`${zone.id}:${type}`] ?? 0) >= quota) continue;
        for (let i = 0; i < 20; i++) {
          const t = randomTileIn(zone.rect);
          const x = t.x * TS + TS / 2;
          const y = t.y * TS + TS - 6;
          if (!this.world.walkable(t.x, t.y) || this.layer.getTileAt(t.x, t.y)?.collides) continue;
          if (Phaser.Math.Distance.Between(x, y, p.x, p.y) < 560) continue;
          this.spawnMonster(type, x, y, zone.id);
          return; // one per tick keeps the world from refilling instantly
        }
      }
    }
  }

  // ------------------------------------------------------------------ fx

  /** @param {keyof typeof PARTICLES} kind */
  emitter(kind) {
    this.emitters[kind] ??= this.add
      .particles(0, 0, spriteKey(kind === "spark" ? "spark" : "px"), { ...PARTICLES[kind], emitting: false })
      .setDepth(FX_DEPTH + 5);
    return this.emitters[kind];
  }

  /** @param {keyof typeof PARTICLES} kind */
  burst(kind, x, y, n, tint = 0xffffff) {
    const e = this.emitter(kind);
    e.particleTint = tint;
    e.explode(n, x, y);
  }

  floatText(x, y, text, color = "#ffffff", size = 24) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(FX_DEPTH + 10);
    this.tweens.add({ targets: t, y: y - 36, duration: 850, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: t, alpha: 0, delay: 450, duration: 400, onComplete: () => t.destroy() });
  }

  shockwave(x, y, radius) {
    const ring = this.add.circle(x, y, 10).setStrokeStyle(5, 0xffe0a0, 1).setDepth(3);
    this.tweens.add({ targets: ring, scale: radius / 10, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }

  levelUpFx() {
    const p = this.player;
    this.burst("spark", p.x, p.y - 40, 40, 0xffe08a);
    this.floatText(p.x, p.y - 96, "LEVEL UP!", "#ffe08a", 38);
    this.cameras.main.flash(260, 255, 236, 170);
  }
}
