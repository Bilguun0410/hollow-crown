import Phaser from "phaser";
import { SCENE_KEYS } from "./scenes/scene-keys.js";
import { PreloadScene } from "./scenes/preload-scene.js";
import { WorldScene } from "./scenes/world-scene.js";
import { events } from "./state/store.js";

export function createGame(parent) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    pixelArt: true,
    backgroundColor: "#0b0d12",
    physics: { default: "arcade", arcade: { debug: false } },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
  game.scene.add(SCENE_KEYS.WORLD_SCENE, WorldScene);

  events.on("start", async () => {
    // Floating combat text uses the pixel web font; make sure it's ready first.
    await document.fonts?.load('24px "VT323"').catch(() => {});
    game.scene.start(SCENE_KEYS.WORLD_SCENE);
  });
  events.on("respawn", () => game.scene.getScene(SCENE_KEYS.WORLD_SCENE).scene.restart());

  return game;
}
