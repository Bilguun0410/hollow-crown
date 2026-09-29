// Client-side view of a server-run hidden boss: it only draws and smooths the
// state the server sends. HP, movement and attacks all live on the server.
import Phaser from "phaser";
import { spriteKey } from "../assets/sprite-defs.js";
import { WORLD_BOSSES } from "../data/world-bosses.js";

export class WorldBoss extends Phaser.GameObjects.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ id: string, x: number, y: number, hp: number, maxHp: number, shield: boolean }} state
   */
  constructor(scene, state) {
    const def = WORLD_BOSSES[state.id];
    super(scene, state.x, state.y, spriteKey(def.texture), 0);
    scene.add.existing(this);
    this.id = state.id;
    this.def = def;
    this.hp = state.hp;
    this.maxHp = state.maxHp;
    this.shield = state.shield;
    this.dead = false;
    this.flying = false;
    this.vulnerability = 1;
    this.tx = state.x;
    this.ty = state.y;
    this.setOrigin(0.5, 1);
    this.play(`${def.texture}-loop`);
    this.shadow = scene.add.image(state.x, state.y, spriteKey("shadow")).setScale(6, 3).setDepth(1);
    // The Bond Shield: a shimmering bubble while hits bounce off.
    this.bubble = scene.add.ellipse(state.x, state.y - 70, 170, 170, 0x6ff5ff, 0.08).setStrokeStyle(3, 0x9ff8ff, 0.7);
    this.label = scene.add
      .text(state.x, state.y, def.name, { fontFamily: '"VT323", monospace', fontSize: "20px", color: "#ffd0d4", stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5, 1);
  }

  /** @param {{ x: number, y: number, hp: number, maxHp: number, shield: boolean }} state */
  applyState(state) {
    this.tx = state.x;
    this.ty = state.y;
    this.hp = state.hp;
    this.maxHp = state.maxHp;
    this.shield = state.shield;
  }

  /** Called every frame: glide toward the latest server position. */
  tick(time) {
    this.x += (this.tx - this.x) * 0.2;
    this.y += (this.ty - this.y) * 0.2;
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 4);
    this.bubble
      .setPosition(this.x, this.y - 70)
      .setVisible(this.shield)
      .setDepth(this.y + 1)
      .setScale(1 + Math.sin(time / 200) * 0.03);
    this.label.setPosition(this.x, this.y - this.displayHeight - 6).setDepth(this.y + 2);
  }

  destroy(fromScene) {
    this.shadow?.destroy();
    this.bubble?.destroy();
    this.label?.destroy();
    super.destroy(fromScene);
  }
}
