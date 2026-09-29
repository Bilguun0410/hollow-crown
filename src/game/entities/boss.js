import Phaser from "phaser";
import { bossForTier } from "../data/monsters.js";
import { engageBoss } from "../state/actions.js";
import { sfx } from "../sfx.js";
import { Enemy } from "./enemy.js";

/**
 * Boss state machine. Each boss cycles "move" -> attack pattern -> recover,
 * gets angrier below an HP threshold, and only acts once the hero steps into
 * its arena (the scene calls engage()).
 */
export class Boss extends Enemy {
  /**
   * @param {import("../scenes/world-scene.js").WorldScene} scene
   * @param {{ id: string, x: number, y: number, arena: number[], doors: number[][], sealedUntil?: string, openTile?: string }} cfg positions in px
   * @param {Phaser.Geom.Rectangle} arena
   * @param {number} tier how many times this boss has been beaten; scales stats and rewards
   */
  constructor(scene, cfg, arena, tier = 0) {
    super(scene, cfg.x, cfg.y, bossForTier(cfg.id, tier));
    this.id = cfg.id;
    this.tier = tier;
    this.arena = arena; // Phaser.Geom.Rectangle in world px
    this.engaged = false;
    this.busy = false;
    this.nextAction = 0;
    this.enraged = false;
    this.stunnedUntil = 0;
    this.contactMul = 1;
    this.summoned = new Set();
    this.setImmovable(true);
    this.cfg = cfg;
    this.ai = this.def.ai; // "golem" walks and slams, "wraith" floats and casts
    this.shotTint = this.def.shot?.tint;
    this.shadow.setScale(this.ai === "golem" ? 4 : 3.2, 2.2);
    if (this.ai === "golem") {
      this.arcadeBody.setSize(60, 30).setOffset(18, 62);
    } else {
      this.flying = true;
      this.arcadeBody.setSize(54, 50).setOffset(21, 30);
    }
  }

  get vulnerability() {
    return this.world.time.now < this.stunnedUntil ? 1.6 : 1;
  }

  engage() {
    if (this.engaged) return;
    this.engaged = true;
    this.nextAction = this.world.time.now + 1200;
    engageBoss(this.id, this.hp, this.maxHp, this.tier);
    sfx.roar();
    this.world.cameras.main.shake(500, 0.008);
  }

  takeHit(amount, fromX, fromY) {
    const killed = super.takeHit(amount, fromX, fromY, 0);
    if (!killed && !this.enraged && this.hp < this.maxHp * (this.ai === "golem" ? 0.5 : 0.4)) this.enrage();
    return killed;
  }

  restoreTint() {
    super.restoreTint();
    if (this.enraged) this.setTint(this.ai === "golem" ? 0xffb58a : 0xd6a8ff);
  }

  enrage() {
    this.enraged = true;
    this.restoreTint();
    sfx.roar();
    this.world.cameras.main.shake(400, 0.01);
    this.world.floatText(this.x, this.y - 110, "ENRAGED!", "#ff9a4d", 34);
  }

  think(time, player) {
    this.syncAttachments(time);
    if (!this.engaged || this.dead) return;
    if (this.ai === "golem") {
      this.golem(time, player); // walks, so the arena walls contain it
    } else {
      this.wraith(time, player);
      this.clampToArena(); // floats over walls, so keep it inside by hand
    }
  }

  later(ms, fn) {
    this.world.time.delayedCall(ms, () => !this.dead && this.active && fn());
  }

  clampToArena() {
    const a = this.arena;
    const x = Phaser.Math.Clamp(this.x, a.left + 40, a.right - 40);
    const y = Phaser.Math.Clamp(this.y, a.top + 70, a.bottom - 10);
    if (x !== this.x || y !== this.y) this.setPosition(x, y);
  }

  // ------------------------------------------------------------------ golem

  golem(time, player) {
    const speed = this.def.speed * (this.enraged ? 1.35 : 1);
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    if (time < this.stunnedUntil) return this.setVelocity(0, 0);
    if (this.charging) {
      if (this.arcadeBody.blocked.none === false || time > this.chargeEnd) {
        this.charging = false;
        this.contactMul = 1;
        this.setVelocity(0, 0);
        if (!this.arcadeBody.blocked.none) {
          this.stunnedUntil = time + 1300;
          sfx.stomp();
          this.world.cameras.main.shake(300, 0.012);
          this.world.floatText(this.x, this.y - 110, "STUNNED", "#ffe08a", 28);
          this.world.burst("puff", this.x, this.y - 20, 18, 0xb6b9c3);
        }
        this.nextAction = time + 900;
      }
      return;
    }
    if (this.busy) return;
    if (time < this.nextAction) {
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      return;
    }
    this.setVelocity(0, 0);
    const roll = Math.random();
    if (d < 170 && roll < 0.55) this.stomp();
    else if (roll < 0.6) this.hurl(player);
    else this.charge(player);
  }

  stomp() {
    this.busy = true;
    const windup = this.enraged ? 480 : 720;
    const radius = 140;
    const ring = this.world.add.circle(this.x, this.y - 10, radius, 0xff3b3b, 0.12).setStrokeStyle(3, 0xff5a5a, 0.8).setDepth(2);
    this.world.tweens.add({ targets: ring, fillAlpha: 0.38, duration: windup });
    this.setFrame(1);
    this.anims.pause();
    this.later(windup, () => {
      ring.destroy();
      sfx.stomp();
      this.world.cameras.main.shake(260, 0.014);
      this.world.burst("puff", this.x, this.y - 10, 26, 0x9d9585);
      this.world.shockwave(this.x, this.y - 10, radius);
      const p = this.world.player;
      if (Phaser.Math.Distance.Between(this.x, this.y - 10, p.x, p.y) < radius + 8) p.hurt(this.def.atk * 1.25, this.x, this.y);
      this.anims.resume();
      this.busy = false;
      this.nextAction = this.world.time.now + 900;
    });
    // Ring must not outlive the boss if it dies mid-windup.
    this.once("destroy", () => ring.active && ring.destroy());
  }

  hurl(player) {
    this.busy = true;
    this.setFrame(1);
    this.anims.pause();
    this.later(420, () => {
      const n = this.enraged ? 5 : 3;
      const base = Phaser.Math.Angle.Between(this.x, this.y - 50, player.x, player.y - 30);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.24;
        this.world.fireEnemyShot(this.x, this.y - 60, a, { texture: this.def.shot.texture, tint: this.shotTint, speed: this.enraged ? 330 : 270, atk: this.def.atk * 0.8, spin: true, scale: 1.4 });
      }
      this.anims.resume();
      this.busy = false;
      this.nextAction = this.world.time.now + 1100;
    });
  }

  charge(player) {
    this.busy = true;
    this.setTint(0xff6a6a);
    this.world.tweens.add({ targets: this, x: this.x + 3, duration: 50, yoyo: true, repeat: 5 });
    this.later(560, () => {
      this.restoreTint();
      const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      const speed = this.enraged ? 480 : 400;
      this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      this.charging = true;
      this.contactMul = 1.3;
      this.chargeEnd = this.world.time.now + 900;
      this.busy = false;
    });
  }

  // ------------------------------------------------------------------ wraith

  wraith(time, player) {
    const summonAt = [0.66, 0.33].find((f) => this.hp < this.maxHp * f && !this.summoned.has(f));
    if (summonAt && !this.busy) {
      this.summoned.add(summonAt);
      this.summon();
      return;
    }
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const t = time / 1000;
    if (!this.busy) {
      const toward = d > 260 ? 1 : d < 170 ? -1 : 0;
      const s = this.def.speed * (this.enraged ? 1.3 : 1);
      this.setVelocity(Math.cos(angle) * s * toward + Math.cos(t * 1.7) * 40, Math.sin(angle) * s * toward + Math.sin(t * 2.3) * 30);
    } else {
      this.arcadeBody.velocity.scale(0.9);
    }
    if (this.busy || time < this.nextAction) return;
    const roll = Math.random();
    if (roll < 0.4) this.spiral();
    else if (roll < 0.75) this.volley(player);
    else this.blink(player);
  }

  spiral() {
    this.busy = true;
    const arms = this.enraged ? 4 : 3;
    const shots = this.enraged ? 22 : 16;
    let rot = Math.random() * Math.PI;
    for (let i = 0; i < shots; i++) {
      this.later(i * 110, () => {
        rot += 0.33;
        for (let k = 0; k < arms; k++) {
          this.world.fireEnemyShot(this.x, this.y - 50, rot + (k * Math.PI * 2) / arms, { texture: "orb", speed: 170, atk: this.def.atk * 0.65, tint: this.shotTint });
        }
      });
    }
    this.later(shots * 110 + 200, () => {
      this.busy = false;
      this.nextAction = this.world.time.now + 900;
    });
  }

  volley(player) {
    this.busy = true;
    const n = this.enraged ? 5 : 3;
    for (let i = 0; i < n; i++) {
      this.later(200 + i * 160, () => {
        const a = Phaser.Math.Angle.Between(this.x, this.y - 50, player.x, player.y - 30);
        this.world.fireEnemyShot(this.x, this.y - 50, a, { texture: "orb", speed: 320, atk: this.def.atk * 0.75, tint: 0x6ff5ff, scale: 1.3 });
      });
    }
    this.later(200 + n * 160 + 300, () => {
      this.busy = false;
      this.nextAction = this.world.time.now + 800;
    });
  }

  blink(player) {
    this.busy = true;
    this.world.tweens.add({
      targets: this,
      alpha: 0,
      duration: 260,
      onComplete: () => {
        if (this.dead) return;
        const a = this.arena;
        let x = 0;
        let y = 0;
        for (let i = 0; i < 20; i++) {
          x = Phaser.Math.Between(a.left + 80, a.right - 80);
          y = Phaser.Math.Between(a.top + 120, a.bottom - 40);
          if (Phaser.Math.Distance.Between(x, y, player.x, player.y) > 240) break;
        }
        this.setPosition(x, y);
        this.world.burst("spark", x, y - 50, 14, 0xb070ff);
        this.world.tweens.add({ targets: this, alpha: 1, duration: 260 });
        this.later(300, () => {
          this.busy = false;
          this.nextAction = this.world.time.now + 400;
        });
      },
    });
  }

  summon() {
    this.busy = true;
    sfx.roar();
    this.world.floatText(this.x, this.y - 110, "RISE, MY SERVANTS", "#d6a8ff", 26);
    // Each caster calls minions that suit its lair.
    const minions = this.id === "rime" ? ["wisp", "wolf"] : ["bat", "skeleton"];
    /** @type {[number, number, string][]} */
    const spots = [
      [-120, 40, minions[0]],
      [120, 40, minions[0]],
      [0, 120, minions[1]],
    ];
    for (const [dx, dy, type] of spots) {
      const x = Phaser.Math.Clamp(this.x + dx, this.arena.left + 60, this.arena.right - 60);
      const y = Phaser.Math.Clamp(this.y + dy, this.arena.top + 80, this.arena.bottom - 30);
      this.world.burst("spark", x, y - 20, 12, 0xb070ff);
      this.later(350, () => this.world.spawnMonster(type, x, y, "boss"));
    }
    this.later(900, () => {
      this.busy = false;
      this.nextAction = this.world.time.now + 600;
    });
  }
}
