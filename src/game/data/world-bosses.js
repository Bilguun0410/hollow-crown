// Hidden co-op bosses. The server (server/world-bosses.js) owns their HP,
// position and attacks so every player fights the same boss; clients draw
// them and resolve the attacks against their own hero.
//
// Both have a Bond Shield: hits bounce off until two different players land a
// hit within `bondWindowMs`, which drops the shield for `shieldDownMs`. A solo
// hero can never break it, so these fights need a team.

export const WORLD_BOSSES = {
  eclipse: {
    name: "Eclipse Titan",
    title: "Herald of the Blood Moon",
    texture: "titan",
    condition: "During a Blood Moon, while two or more heroes roam the land",
    hp: 9000,
    atk: 42,
    def: 8,
    speed: 72,
    exp: 6000,
    gems: 450,
    shards: 20,
    shotTint: 0xff3b4a,
  },
  bound: {
    name: "The Bound Colossus",
    title: "Chained Beneath the Altar",
    texture: "colossus",
    condition: "When two heroes stand together on the Altar of Binding",
    hp: 12000,
    atk: 46,
    def: 10,
    speed: 58,
    exp: 8000,
    gems: 550,
    shards: 25,
    shotTint: 0x6ff5ff,
  },
};

export const WORLD_BOSS_RULES = {
  bondWindowMs: 2500, // two different heroes must hit within this window...
  shieldDownMs: 7000, // ...to drop the shield for this long
  hpPerExtraHero: 0.45, // max HP grows 45% for each hero past the second
  bloodMoonEveryMs: 20 * 60 * 1000,
  bloodMoonRetryMs: 60 * 1000, // not enough heroes online: try again soon
  bloodMoonMinHeroes: 2,
  altarHoldMs: 3000, // two heroes on the altar this long wakes the Colossus
  altarMinHeroes: 2,
  cooldownMs: 10 * 60 * 1000, // after a defeat before it can appear again
  idleDespawnMs: 90 * 1000, // nobody nearby for this long: it leaves
  maxHitDamage: 6000, // sanity cap on a single reported hit
  minHitIntervalMs: 90, // per hero, per boss
  tickMs: 100,
};

/** Max HP for a fight with `heroes` players nearby when it spawned. */
export const worldBossHp = (id, heroes) =>
  Math.round(WORLD_BOSSES[id].hp * (1 + WORLD_BOSS_RULES.hpPerExtraHero * Math.max(0, heroes - 2)));
