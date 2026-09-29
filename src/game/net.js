// Multiplayer over socket.io: other connected heroes are drawn as "ghosts"
// walking the same world, and the server-run hidden bosses are relayed to the
// scene. Regular monsters and loot stay local to each player.
import { CHARACTERS, characterKeys } from "./data/characters.js";
import { FONT_FAMILY } from "./scenes/asset-keys.js";
import { store } from "./state/store.js";

/** Server -> client world boss events, forwarded to the scene as "wb:<name>". */
const WORLD_BOSS_EVENTS = ["state", "spawn", "announce", "attack", "shield", "immune", "reward", "defeated", "despawn", "altar"];

/**
 * @typedef {{ sprite: Phaser.GameObjects.Sprite, label: Phaser.GameObjects.Text, ch: any, keys: ReturnType<typeof characterKeys>, tx: number, ty: number, dir: string, moving: boolean }} Ghost
 */

/**
 * @param {import("./scenes/world-scene.js").WorldScene} scene
 * @param {any} character
 * @param {(event: string, payload: any) => void} onWorldBoss
 */
export function connectNet(scene, character, onWorldBoss) {
  if (typeof window.io !== "function") return null;
  const socket = window.io();
  /** @type {Map<string, Ghost>} */
  const ghosts = new Map();
  let lastSent = 0;
  let lastMsg = "";

  const remove = (id) => {
    const g = ghosts.get(id);
    g?.sprite.destroy();
    g?.label.destroy();
    ghosts.delete(id);
  };

  const upsert = (p) => {
    if (!p || p.id === socket.id || !p.active) return;
    let g = ghosts.get(p.id);
    if (!g) {
      const ch = CHARACTERS[p.characterId] ?? character;
      const keys = characterKeys(ch.id);
      const sprite = scene.add.sprite(p.x, p.y, keys.sheet, ch.sprite.rows.down).setOrigin(0.5, 1).setScale(ch.sprite.scale).setAlpha(0.8);
      const label = scene.add
        .text(p.x, p.y, "", { fontFamily: FONT_FAMILY, fontSize: "18px", color: "#cfe3ff", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(100001);
      g = { sprite, label, ch, keys, tx: p.x, ty: p.y, dir: "down", moving: false };
      ghosts.set(p.id, g);
    }
    Object.assign(g, { tx: p.x, ty: p.y, dir: p.dir, moving: p.moving });
    g.sprite.setAlpha(p.dead ? 0.35 : 0.8);
    g.label.setText(`${p.name} · Lv.${p.level}`);
  };

  socket.on("init", ({ players }) => Object.values(players).forEach(upsert));
  socket.on("playerJoined", upsert);
  socket.on("playerMoved", upsert);
  socket.on("playerLeft", remove);
  for (const name of WORLD_BOSS_EVENTS) socket.on(`wb:${name}`, (payload) => onWorldBoss(name, payload));

  return {
    /** Number of other heroes currently in the world. */
    get allies() {
      return ghosts.size;
    },

    update(time) {
      for (const g of ghosts.values()) {
        g.sprite.x += (g.tx - g.sprite.x) * 0.25;
        g.sprite.y += (g.ty - g.sprite.y) * 0.25;
        g.sprite.setDepth(g.sprite.y);
        if (g.moving) g.sprite.anims.play(g.keys.walk(g.dir), true);
        else {
          g.sprite.anims.stop();
          g.sprite.setFrame(g.ch.sprite.rows[g.dir] ?? 0);
        }
        g.label.setPosition(g.sprite.x, g.sprite.y - g.sprite.displayHeight - 2);
      }
      if (time - lastSent < 100) return;
      lastSent = time;
      const p = scene.player;
      const { hero } = store.get();
      const msg = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        dir: p.facing,
        moving: p.mode === "move" || p.mode === "dash",
        dead: p.mode === "dead",
        name: hero.name,
        level: hero.level,
        characterId: character.id,
      };
      const key = JSON.stringify(msg);
      if (key !== lastMsg) {
        socket.emit("move", msg);
        lastMsg = key;
      }
    },

    /** Report a hit on a hidden boss; the server applies it (or bounces it off the shield). */
    hitWorldBoss(id, dmg) {
      socket.emit("wb:hit", { id, dmg });
    },

    /** Development only: summon a hidden boss without meeting its condition. */
    debugSummon(id) {
      socket.emit("wb:debugSummon", id);
    },

    disconnect() {
      socket.disconnect();
      [...ghosts.keys()].forEach(remove);
    },
  };
}
