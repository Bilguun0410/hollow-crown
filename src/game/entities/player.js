import Phaser from "phaser";
import { characterKeys } from "../data/characters.js";
import { spriteKey } from "../assets/sprite-defs.js";
import { damageHero, getStats, heroDied, recordBolt, setCooldown, setStamina, spendMp, toast } from "../state/actions.js";
import { store } from "../state/store.js";
import { sfx } from "../sfx.js";

/** @typedef {{ x: number, y: number, angle?: number }} Dir */

/** @type {Record<"down" | "up" | "left" | "right", Dir>} */
export const DIRS = {
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
};

/** Visual centre of the hero, relative to the feet (sprite origin). */
export const BODY_CENTER_Y = 38;

export class Player extends Phaser.Physics.Arcade.Sprite {
  /** @param {import("../scenes/world-scene.js").WorldScene} scene */
  constructor(scene, x, y, character) {
    const keys = characterKeys(character.id);
    super(scene, x, y, keys.sheet, character.sprite.rows.down);
    this.character = character;
    this.keys = keys;
    this.skills = character.skills;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const sp = character.sprite;
    this.setOrigin(0.5, 1).setScale(sp.scale);
    this.arcadeBody.setSize(sp.body.width, sp.body.height).setOffset(sp.body.offsetX, sp.body.offsetY);
    this.setCollideWorldBounds(true);

    this.shadow = scene.add.image(x, y, spriteKey("shadow")).setScale(0.9);
    const { attack } = character.poses;
    this.pose = scene.add.image(x, y, keys.attack).setOrigin(attack.originX, attack.originY).setScale(sp.scale).setVisible(false);

    /** @type {"down" | "up" | "left" | "right"} */
    this.facing = "down";
    this.mode = "idle"; // idle | move | attack | dash | knock | dead
    this.modeUntil = 0;
    this.ready = { slash: 0, special: 0, dash: 0 };
    this.invulnUntil = 0;
    this.dashDir = DIRS.down;

    this.stamina = getStats().stamina;
    this.exhausted = false; // ran dry: no sprinting until 30% has refilled
    this.lastSprintAt = 0;
    this.nextStaminaPush = 0;
    this.nextDust = 0;
    this.sprinting = false;
    this.slashCount = 0;
    this.secondWindUsed = false; // resets each life (the scene restarts on respawn)
  }

  /** The owning scene, typed as the world scene. */
  get world() {
    return /** @type {import("../scenes/world-scene.js").WorldScene} */ (this.scene);
  }

  /** @returns {Phaser.Physics.Arcade.Body} */
  get arcadeBody() {
    return /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
  }

  get center() {
    return { x: this.x, y: this.y - BODY_CENTER_Y };
  }

  update(time, input) {
    this.syncAttachments();
    if (this.mode === "dead") return;

    if ((this.mode === "attack" || this.mode === "dash" || this.mode === "knock") && time >= this.modeUntil) {
      this.endPose();
      this.mode = "idle";
    }

    const vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = vx !== 0 || vy !== 0;

    if (this.mode === "dash") {
      this.setVelocity(this.dashDir.x * this.skills.dash.speed, this.dashDir.y * this.skills.dash.speed);
      if (time % 40 < 17) this.afterimage();
    } else if (this.mode !== "knock") {
      const stats = getStats();
      this.updateStamina(time, input.sprint && moving && this.mode !== "attack", stats);
      const sprintMult = this.sprinting ? this.skills.sprint.mult + stats.sprintMult : 1;
      const speed = stats.speed * (this.mode === "attack" ? 0.3 : sprintMult);
      const len = Math.hypot(vx, vy) || 1;
      this.setVelocity((vx / len) * speed, (vy / len) * speed);
      if (moving && this.mode !== "attack") {
        // Zelda-style: on diagonals keep the current facing if it's one of the two.
        const options = [];
        if (vx) options.push(vx < 0 ? "left" : "right");
        if (vy) options.push(vy < 0 ? "up" : "down");
        if (!options.includes(this.facing)) this.facing = options[0];
      }
      if (this.mode !== "attack") this.mode = moving ? "move" : "idle";
    }

    if (this.mode === "move" || this.mode === "dash") {
      this.anims.play(this.keys.walk(this.facing), true);
      this.anims.timeScale = this.sprinting ? 1.6 : 1;
    } else if (this.mode === "idle") {
      this.anims.stop();
      this.setFrame(this.character.sprite.rows[this.facing]);
    }

    if (this.mode === "idle" || this.mode === "move") {
      if (input.attack && time >= this.ready.slash) this.slash(time);
      else if (input.special && time >= this.ready.special) this.special(time);
      else if (input.dash && time >= this.ready.dash) this.dash(time, moving ? { x: vx, y: vy } : DIRS[this.facing]);
    }
  }

  updateStamina(time, wantsSprint, stats) {
    const { sprint } = this.skills;
    const dt = this.world.game.loop.delta / 1000;
    this.sprinting = wantsSprint && !this.exhausted && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - sprint.drain * dt);
      this.lastSprintAt = time;
      if (this.stamina === 0) this.exhausted = true;
      if (time >= this.nextDust) {
        this.nextDust = time + 90;
        this.world.burst("puff", this.x, this.y - 4, 2, 0xd8c9a0);
      }
    } else if (time - this.lastSprintAt > sprint.regenDelay) {
      this.stamina = Math.min(stats.stamina, this.stamina + sprint.regen * dt);
      if (this.exhausted && this.stamina >= stats.stamina * 0.3) this.exhausted = false;
    }
    if (time >= this.nextStaminaPush) {
      this.nextStaminaPush = time + 100;
      setStamina(Math.round(this.stamina));
    }
  }

  syncAttachments() {
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 2).setDepth(1);
    this.pose.setPosition(this.x, this.y).setDepth(this.y + 0.5);
  }

  // ---------------------------------------------------------------- skills

  slash(time) {
    const dir = DIRS[this.facing];
    const skill = this.skills.slash;
    this.mode = "attack";
    this.modeUntil = time + Math.max(200, skill.cooldown * 0.45); // heavy weapons hold the pose longer
    this.ready.slash = time + skill.cooldown;
    this.setVelocity(0, 0);
    sfx.slash();

    if (dir.x !== 0) {
      // Side slashes use the character's hand-drawn attack pose.
      const { attack } = this.character.poses;
      const flip = dir.x < 0;
      this.pose.setTexture(this.keys.attack).setFlipX(flip).setOrigin(flip ? 1 - attack.originX : attack.originX, attack.originY).setVisible(true);
      this.setVisible(false);
    } else {
      const c = this.center;
      const fx = this.world.add
        .image(c.x + dir.x * 30, c.y + dir.y * 36, spriteKey("slash"))
        .setRotation(dir.angle)
        .setScale(skill.reach / 66)
        .setDepth(this.y + dir.y * 10);
      this.world.tweens.add({ targets: fx, alpha: 0, scale: fx.scale * 1.3, duration: 180, onComplete: () => fx.destroy() });
    }

    const stats = getStats();
    const scale = 1 + stats.reach;
    const reach = skill.reach * scale;
    const half = skill.halfWidth * scale; // half-width of the swing across the facing axis
    const c = this.center;
    const rect =
      dir.x !== 0
        ? new Phaser.Geom.Rectangle(dir.x > 0 ? c.x : c.x - reach, c.y - half, reach, half * 2)
        : new Phaser.Geom.Rectangle(c.x - half, dir.y > 0 ? c.y + 6 : c.y - reach - 6, half * 2, reach);
    this.world.meleeHit(rect, { power: skill.power, knock: skill.knock });

    // Eclipse: every third slash also looses a free shadow bolt.
    this.slashCount++;
    if (stats.flags.has("eclipse") && this.slashCount % 3 === 0) {
      this.world.firePlayerBolt(c.x + dir.x * 20, c.y + dir.y * 20, dir);
    }
  }

  /** The character's K skill (see skills.special.type). */
  special(time) {
    const skill = this.skills.special;
    const cyclone = skill.type === "whirlwind" && getStats().flags.has("cyclone");
    if (!spendMp(skill.mpCost - (cyclone ? 4 : 0))) {
      this.ready.special = time + 400;
      sfx.error();
      toast("Not enough MP");
      return;
    }
    this.ready.special = time + skill.cooldown;
    setCooldown("special", Date.now() + skill.cooldown, skill.cooldown);
    if (skill.type === "whirlwind") this.whirlwind(time, skill);
    else this.bolt(skill);
  }

  bolt(skill) {
    recordBolt();
    sfx.bolt();
    const dir = DIRS[this.facing];
    const c = this.center;
    this.world.firePlayerBolt(c.x + dir.x * 20, c.y + dir.y * 20, dir, skill.power);
  }

  /** Spin the claymore in a full circle, hitting everything around the hero. */
  whirlwind(time, skill) {
    const spinMs = 360;
    this.endPose();
    this.mode = "attack";
    this.modeUntil = time + spinMs;
    this.setVelocity(0, 0);
    this.anims.stop();
    sfx.slash();
    sfx.dash();

    // Face each way in turn so the sprite reads as spinning.
    const turn = ["down", "right", "up", "left"];
    const { rows } = this.character.sprite;
    let step = 0;
    this.world.time.addEvent({
      delay: spinMs / 8,
      repeat: 7,
      callback: () => this.mode === "attack" && this.setFrame(rows[turn[step++ % 4]]),
    });

    const stats = getStats();
    const radius = skill.radius * (1 + stats.reach) * (stats.flags.has("cyclone") ? 1.35 : 1);
    const c = this.center;
    for (let i = 0; i < 4; i++) {
      const fx = this.world.add.image(c.x, c.y, spriteKey("slash")).setScale(radius / 60).setDepth(this.y + 1).setAlpha(0.9);
      this.world.tweens.add({
        targets: fx,
        rotation: { from: (i * Math.PI) / 2, to: (i * Math.PI) / 2 + Math.PI * 2 },
        alpha: 0,
        duration: spinMs,
        onComplete: () => fx.destroy(),
      });
    }
    this.world.shockwave(c.x, c.y + 20, radius);
    this.world.areaHit(c.x, c.y, radius, { power: skill.power, knock: 320 });
  }

  dash(time, vec) {
    const len = Math.hypot(vec.x, vec.y) || 1;
    this.dashDir = { x: vec.x / len, y: vec.y / len };
    this.mode = "dash";
    this.modeUntil = time + this.skills.dash.duration;
    const cooldown = this.skills.dash.cooldown * (1 - getStats().dashCdr);
    this.ready.dash = time + cooldown;
    this.invulnUntil = Math.max(this.invulnUntil, time + this.skills.dash.duration + 60);
    setCooldown("dash", Date.now() + cooldown, cooldown);
    sfx.dash();
  }

  afterimage() {
    const ghost = this.world.add
      .image(this.x, this.y, this.texture.key, this.frame.name)
      .setOrigin(0.5, 1)
      .setScale(this.scaleX)
      .setDepth(this.depth - 1)
      .setAlpha(0.45)
      .setTint(0x8a6bff);
    this.world.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  endPose() {
    this.pose.setVisible(false);
    this.setVisible(true);
  }

  // ---------------------------------------------------------------- damage

  isInvulnerable(time) {
    return this.mode === "dead" || time < this.invulnUntil;
  }

  /** Returns the damage actually taken (0 if avoided). */
  hurt(amount, fromX, fromY) {
    const time = this.world.time.now;
    if (this.isInvulnerable(time)) return 0;
    const stats = getStats();
    if (Math.random() < stats.dodge) {
      this.invulnUntil = time + 250;
      this.afterimage();
      this.world.floatText(this.x, this.y - 70, "DODGE", "#b8a8ff", 22);
      return 0;
    }
    let dmg = Math.max(1, Math.round(amount * (0.9 + Math.random() * 0.2) - stats.def * 0.6));
    const heroHp = store.get().hero.hp;
    if (stats.flags.has("secondWind") && !this.secondWindUsed && dmg >= heroHp) {
      // Second Wind: this blow leaves 1 HP and a moment of grace instead.
      this.secondWindUsed = true;
      dmg = Math.max(0, heroHp - 1);
      this.invulnUntil = time + 2000;
      this.world.burst("spark", this.x, this.y - 40, 30, 0xffb020);
      this.world.floatText(this.x, this.y - 96, "SECOND WIND", "#ffb020", 30);
      sfx.levelUp();
    }
    const hp = damageHero(dmg);
    this.world.onPlayerDamaged(dmg);
    sfx.hurt();
    this.world.cameras.main.shake(120, 0.006);
    this.world.floatText(this.x, this.y - 70, `-${dmg}`, "#ff6b6b");

    if (hp <= 0) {
      this.die();
      return dmg;
    }
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    this.endPose();
    this.mode = "knock";
    this.modeUntil = time + 160;
    this.setVelocity(Math.cos(a) * 300, Math.sin(a) * 300);
    this.invulnUntil = Math.max(this.invulnUntil, time + 1000);
    this.setTint(0xff7070);
    this.world.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 90,
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        this.setAlpha(1);
        this.clearTint();
      },
    });
    return dmg;
  }

  die() {
    this.mode = "dead";
    this.setVelocity(0, 0);
    this.arcadeBody.enable = false;
    this.anims.stop();
    this.setVisible(false);
    const { die } = this.character.poses;
    this.pose.setTexture(this.keys.die).setFlipX(false).setOrigin(die.originX, die.originY).setVisible(true).setAlpha(1);
    this.world.cameras.main.shake(250, 0.01);
    heroDied();
  }
}
