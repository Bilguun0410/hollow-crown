// Small world objects: projectiles, pickups and chests. Declared as classes so
// their extra fields are typed instead of being stuck onto plain Phaser images.
import Phaser from "phaser";
import { spriteKey } from "../assets/sprite-defs.js";

/** A projectile moved by hand each frame (no physics body). */
export class Projectile extends Phaser.GameObjects.Image {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} texture generated sprite name
   * @param {{ angle: number, speed: number, lifeMs: number, atk?: number, power?: number, tint?: number, spin?: boolean, scale?: number }} opts
   */
  constructor(scene, x, y, texture, { angle, speed, lifeMs, atk = 0, power = 1, tint, spin = false, scale = 1 }) {
    super(scene, x, y, spriteKey(texture));
    scene.add.existing(this);
    this.setScale(scale);
    if (tint !== undefined) this.setTint(tint);
    this.color = tint ?? 0xffffff;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.atk = atk;
    this.power = power;
    this.spin = spin;
    this.expiresAt = scene.time.now + lifeMs;
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter | null} */
    this.trail = null;
  }

  /** @param {number} dt seconds */
  advance(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.spin) this.rotation += 12 * dt;
  }

  destroy(fromScene) {
    const trail = this.trail;
    if (trail) {
      trail.stopFollow();
      trail.stop();
      this.scene?.time.delayedCall(300, () => trail.destroy());
    }
    super.destroy(fromScene);
  }
}

/** Gems, hearts, potions, shards and gear lying on the ground. */
export class Pickup extends Phaser.Physics.Arcade.Image {
  /**
   * @param {Phaser.Scene} scene
   * @param {"gem" | "heart" | "potion" | "ether" | "shard" | "item"} kind
   * @param {string} textureKey
   */
  constructor(scene, x, y, kind, textureKey, value = 1, itemId = null) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.kind = kind;
    this.value = value;
    /** @type {string | null} */
    this.itemId = itemId;
    this.spawnedAt = scene.time.now;
    this.expiresAt = kind === "item" ? Infinity : scene.time.now + 25000;
  }
}

/** A treasure chest with a static physics body. */
export class Chest extends Phaser.GameObjects.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ id: string, x: number, y: number, loot: Record<string, any> }} chest
   */
  constructor(scene, x, y, chest, opened) {
    super(scene, x, y, spriteKey("chest"), opened ? 1 : 0);
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    const body = /** @type {Phaser.Physics.Arcade.StaticBody} */ (this.body);
    body.setSize(40, 26).setOffset(4, 18);
    this.chest = chest;
    this.opened = opened;
  }
}
