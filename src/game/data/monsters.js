// Monster and boss stat blocks. `texture` names refer to SPRITE_DEFS.
// drops.gems is a [min, max] total value, other drops are chances (0..1).

export const MONSTERS = {
  slime: {
    name: "Slime",
    texture: "slime_green",
    ai: "hopper",
    hp: 22,
    atk: 6,
    def: 0,
    speed: 55,
    aggro: 180,
    exp: 5,
    drops: { gems: [1, 3], heart: 0.14, ether: 0.05, potion: 0.02 },
  },
  redslime: {
    name: "Ember Slime",
    texture: "slime_red",
    ai: "hopper",
    hp: 46,
    atk: 11,
    def: 1,
    speed: 72,
    aggro: 210,
    exp: 11,
    drops: { gems: [3, 8], heart: 0.16, potion: 0.05, shard: 0.03 },
  },
  bat: {
    name: "Dusk Bat",
    texture: "bat",
    ai: "flutter",
    flying: true,
    hp: 14,
    atk: 7,
    def: 0,
    speed: 105,
    aggro: 240,
    exp: 7,
    drops: { gems: [1, 4], heart: 0.1, ether: 0.1 },
  },
  skeleton: {
    name: "Bonewalker",
    texture: "skeleton",
    ai: "chaser",
    hp: 52,
    atk: 12,
    def: 2,
    speed: 72,
    aggro: 270,
    exp: 15,
    ranged: { texture: "bone", speed: 230, cooldown: 2400, range: 320, atk: 9 },
    drops: { gems: [4, 10], heart: 0.16, potion: 0.05, shard: 0.08 },
  },

  // ---- Ashen Wastes
  scorpion: {
    name: "Dune Scorpion",
    texture: "scorpion",
    ai: "chaser",
    hp: 95,
    atk: 17,
    def: 4,
    speed: 82,
    aggro: 250,
    exp: 28,
    drops: { gems: [6, 14], heart: 0.15, potion: 0.06, shard: 0.08 },
  },
  imp: {
    name: "Cinder Imp",
    texture: "imp",
    ai: "flutter",
    flying: true,
    hp: 55,
    atk: 14,
    def: 2,
    speed: 115,
    aggro: 280,
    exp: 24,
    ranged: { texture: "orb", tint: 0xff7a2a, speed: 250, cooldown: 2000, range: 300, atk: 13 },
    drops: { gems: [5, 12], ether: 0.1, shard: 0.06 },
  },

  // ---- Frostmere
  wolf: {
    name: "Frost Wolf",
    texture: "wolf",
    ai: "chaser",
    hp: 80,
    atk: 16,
    def: 3,
    speed: 125,
    aggro: 300,
    exp: 26,
    drops: { gems: [6, 13], heart: 0.18, potion: 0.05, shard: 0.06 },
  },
  wisp: {
    name: "Ice Wisp",
    texture: "wisp",
    ai: "flutter",
    flying: true,
    hp: 50,
    atk: 14,
    def: 2,
    speed: 95,
    aggro: 290,
    exp: 25,
    ranged: { texture: "orb", tint: 0x9fe8ff, speed: 230, cooldown: 1800, range: 320, atk: 12 },
    drops: { gems: [5, 12], ether: 0.12, shard: 0.07 },
  },
};

/** How long a defeated boss stays gone before returning to its arena. */
export const BOSS_RETURN_MS = 10 * 60 * 1000;
/** Price to call a defeated boss back early at the shrine. */
export const REMATCH_COST = { shards: 3 };

/**
 * A boss's stats and rewards for its Nth appearance. Tier 0 is the first
 * fight; every return after a defeat is one tier stronger and richer.
 */
export function bossForTier(id, tier = 0) {
  const b = BOSS_TYPES[id];
  if (!tier) return b;
  const more = (v, per) => Math.round(v * (1 + per * tier));
  return {
    ...b,
    hp: more(b.hp, 0.4),
    atk: more(b.atk, 0.2),
    def: b.def + tier,
    exp: more(b.exp, 0.5),
    drops: { ...b.drops, gems: b.drops.gems.map((g) => more(g, 0.5)), shards: b.drops.shards + 2 * tier },
  };
}

export const BOSS_TYPES = {
  golem: {
    name: "Mossback Golem",
    title: "Warden of the Ruins",
    texture: "golem",
    ai: "golem",
    shot: { texture: "boulder" },
    hp: 650,
    atk: 18,
    def: 4,
    speed: 70,
    exp: 150,
    drops: { gems: [60, 80], shards: 5, gear: "weapon" },
  },
  wraith: {
    name: "The Hollow King",
    title: "Lord of the Sunken Sanctum",
    texture: "wraith",
    ai: "wraith",
    shot: { texture: "orb", tint: 0xb070ff },
    hp: 1100,
    atk: 22,
    def: 5,
    speed: 90,
    exp: 400,
    drops: { gems: [120, 150], shards: 10, gear: "wrist" },
  },
  pyre: {
    name: "Pyre Colossus",
    title: "Heart of the Cinder Forge",
    texture: "pyre",
    ai: "golem",
    shot: { texture: "orb", tint: 0xff6a1a },
    hp: 1600,
    atk: 30,
    def: 8,
    speed: 75,
    exp: 700,
    drops: { gems: [160, 210], shards: 8 },
  },
  rime: {
    name: "The Rime Witch",
    title: "Keeper of the Frozen Hollow",
    texture: "rime",
    ai: "wraith",
    shot: { texture: "orb", tint: 0x9fe8ff },
    hp: 1800,
    atk: 32,
    def: 7,
    speed: 95,
    exp: 800,
    drops: { gems: [170, 230], shards: 10 },
  },
};
