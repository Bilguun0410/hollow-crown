import Phaser from "phaser";
import { SCENE_KEYS } from "./scene-keys.js";
import { ITEM_ASSET_KEY } from "./asset-keys.js";
import { CHARACTERS, characterKeys } from "../data/characters.js";
import { ITEMS } from "../data/items.js";
import { frameSize, SPRITE_DEFS, spriteKey, spriteUrl, TILESET_KEY, TILESET_URL } from "../assets/sprite-defs.js";
import { store } from "../state/store.js";

const LOOP_FPS = { bat: 10, skeleton: 5, wraith: 3, golem: 2 };

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.PRELOAD_SCENE, active: true });
  }

  preload() {
    this.load.on("progress", (p) => store.set({ assetsLoaded: p }));

    for (const ch of Object.values(CHARACTERS)) {
      const keys = characterKeys(ch.id);
      const { url, frameWidth, frameHeight } = ch.sprite;
      this.load.spritesheet(keys.sheet, url, { frameWidth, frameHeight });
      this.load.image(keys.attack, ch.poses.attack.url);
      this.load.image(keys.die, ch.poses.die.url);
    }

    this.load.image(TILESET_KEY, TILESET_URL);
    for (const name of Object.keys(SPRITE_DEFS)) {
      this.load.spritesheet(spriteKey(name), spriteUrl(name), frameSize(name));
    }
    for (const [id, item] of Object.entries(ITEMS)) {
      this.load.image(ITEM_ASSET_KEY(id), item.icon);
    }
  }

  create() {
    for (const ch of Object.values(CHARACTERS)) {
      const keys = characterKeys(ch.id);
      const { rows, framesPerDir } = ch.sprite;
      for (const [dir, start] of Object.entries(rows)) {
        this.anims.create({
          key: keys.walk(dir),
          frames: this.anims.generateFrameNumbers(keys.sheet, { start, end: start + framesPerDir - 1 }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }
    for (const [name, def] of Object.entries(SPRITE_DEFS)) {
      if (def.frames < 2 || name === "chest") continue;
      this.anims.create({
        key: `${name}-loop`,
        frames: this.anims.generateFrameNumbers(spriteKey(name), { start: 0, end: def.frames - 1 }),
        frameRate: LOOP_FPS[name] ?? 3,
        repeat: -1,
      });
    }
    store.set({ assetsReady: true, assetsLoaded: 1 });
  }
}
