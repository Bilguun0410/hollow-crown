import Phaser from "phaser";
import { spriteKey } from "../assets/sprite-defs.js";
import { MONSTERS } from "../data/monsters.js";

/** Shared behaviour for anything the hero can hit: HP, flashes, knockback, shadow. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Record<string, any>} def monster or boss stat block
   */
  constructor(scene, x, y, def) {
    super(scene, x, y, spriteKey(def.texture), 0);
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.dead = false;
    this.staggerUntil = 0;
    this.flying = !!def.flying;
    this.hover = 0;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.shadow = scene.add.image(x, y, spriteKey("shadow")).setDepth(1);
    if (this.anims.animationManager.exists(`${def.texture}-loop`)) this.play({ key: `${def.texture}-loop`, startFrame: Phaser.Math.Between(0, 1) });
  }

  /** The owning scene, typed as the world scene. */
  get world() {
    return /** @type {import("../scenes/world-scene.js").WorldScene} */ (this.scene);
  }

  /** @returns {Phaser.Physics.Arcade.Body} */
  get arcadeBody() {
    return /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
  }

  /** Multiplier on incoming damage (bosses override while stunned). */
  get vulnerability() {
    return 1;
  }

  /** Returns true if this hit killed it. */
  takeHit(amount, fromX, fromY, knock = 200) {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash();
    if (knock > 0) {
      const a = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
      this.setVelocity(Math.cos(a) * knock, Math.sin(a) * knock);
      this.staggerUntil = this.world.time.now + 180;
    }
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  flash() {
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.world.time.delayedCall(80, () => this.active && this.restoreTint());
  }

  restoreTint() {
    this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  syncAttachments(time) {
    if (this.flying) this.hover = 14 + Math.sin(time / 180 + this.x) * 4;
    this.shadow.setPosition(this.x, this.y + this.hover - 2);
    this.setDepth(this.y + this.hover);
  }

  destroy(fromScene) {
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}

/** Regular overworld monsters with three simple AIs: hopper, flutter, chaser. */
export class Monster extends Enemy {
  constructor(scene, x, y, type, zone) {
    super(scene, x, y, MONSTERS[type]);
    this.type = type;
    this.zone = zone;
    this.nextThink = 0;
    this.hopUntil = 0;
    this.nextShot = scene.time.now + 1500;
    this.phase = Math.random() * 10;
    this.wander = { x: 0, y: 0 };
    if (this.flying) this.arcadeBody.setSize(26, 20).setOffset(11, 16);
    else this.arcadeBody.setSize(30, 18).setOffset(9, 28);
  }

  think(time, player) {
    this.syncAttachments(time);
    if (time < this.staggerUntil) return;

    const p = player.center;
    const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, player.y);
    const alive = player.mode !== "dead";
    const aggro = alive && d < this.def.aggro;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, player.y - 8);
    const speed = this.def.speed;

    if (this.def.ai === "hopper") {
      if (aggro && time >= this.nextThink) {
        this.setVelocity(Math.cos(angle) * speed * 2.4, Math.sin(angle) * speed * 2.4);
        this.hopUntil = time + 300;
        this.nextThink = time + 850 + Math.random() * 400;
      } else if (!aggro && time >= this.nextThink) {
        this.pickWander(0.6);
        this.nextThink = time + 1200 + Math.random() * 1500;
      }
      if (aggro && time > this.hopUntil) this.arcadeBody.velocity.scale(0.82);
      if (!aggro) this.setVelocity(this.wander.x * speed, this.wander.y * speed);
      return;
    }

    // Any monster with a ranged attack uses it while it has the hero in range.
    const r = this.def.ranged;
    if (aggro && r && d < r.range && time >= this.nextShot) {
      this.nextShot = time + r.cooldown + Math.random() * 800;
      this.world.fireEnemyShot(this.x, this.y - 24 - this.hover, angle, { texture: r.texture, tint: r.tint, speed: r.speed, atk: r.atk, spin: r.texture === "bone" });
    }

    if (this.def.ai === "flutter") {
      const t = time / 1000 + this.phase;
      if (aggro) {
        const wob = Math.sin(t * 7) * 0.9;
        this.setVelocity((Math.cos(angle) - Math.sin(angle) * wob) * speed, (Math.sin(angle) + Math.cos(angle) * wob) * speed);
      } else {
        this.setVelocity(Math.cos(t * 0.8) * speed * 0.45, Math.sin(t * 1.3) * speed * 0.45);
      }
      return;
    }

    // chaser
    if (aggro) {
      if (d > 34) this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      else this.setVelocity(0, 0);
      this.anims.play(`${this.def.texture}-loop`, true);
    } else {
      if (time >= this.nextThink) {
        this.pickWander(0.55);
        this.nextThink = time + 1400 + Math.random() * 1400;
      }
      this.setVelocity(this.wander.x * speed * 0.6, this.wander.y * speed * 0.6);
      if (!this.wander.x && !this.wander.y) this.anims.pause();
      else this.anims.resume();
    }
  }

  pickWander(moveChance) {
    if (Math.random() > moveChance) {
      this.wander = { x: 0, y: 0 };
      return;
    }
    const a = Math.random() * Math.PI * 2;
    this.wander = { x: Math.cos(a), y: Math.sin(a) };
  }
}
