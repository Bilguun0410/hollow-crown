// Equipment, consumables, currencies and the shrine shop.

// Every slot any hero can have, in display order. Each hero only gets the
// slots their gear set covers (see slotsFor).
export const EQUIP_SLOTS = ["weapon", "head", "armor", "hands", "wrist", "belt", "boots", "ring"];

export const SLOT_LABELS = {
  weapon: "Weapon",
  head: "Head",
  armor: "Armor",
  hands: "Hands",
  wrist: "Bracer",
  belt: "Belt",
  boots: "Boots",
  ring: "Ring",
};

// `owner` is the character id that can wear the piece. Chests and bosses drop
// a slot ({ gear: "boots" }) and the hero receives their own set's piece.
export const ITEMS = {
  // ---------------------------------------------------------------- Shadowblade
  sword: {
    owner: "shadowblade",
    name: "Moonsteel Blade",
    slot: "weapon",
    icon: "assets/equipment/sword.png",
    stats: { atk: 17, critRate: 0.5 },
    desc: "Pried from the Golem's mossy core. Hums faintly at night.",
  },
  coat: {
    owner: "shadowblade",
    name: "Nightweave Coat",
    slot: "armor",
    icon: "assets/equipment/coat.png",
    stats: { def: 4, maxHp: 25 },
    desc: "Tattered, but the thread drinks in blows.",
  },
  ring: {
    owner: "shadowblade",
    name: "Band of Echoes",
    slot: "ring",
    icon: "assets/equipment/ring.png",
    stats: { maxMp: 20, magic: 0.3 },
    desc: "Your shadow bolts ring twice as loud.",
  },
  belt: {
    owner: "shadowblade",
    name: "Hunter's Belt",
    slot: "belt",
    icon: "assets/equipment/belt.png",
    stats: { def: 1, magnet: 70 },
    desc: "Loose gems seem to find their way to you.",
  },
  boots: {
    owner: "shadowblade",
    name: "Shadowstep Boots",
    slot: "boots",
    icon: "assets/equipment/boot_left.png",
    stats: { speed: 35 },
    desc: "Soles that make no sound on stone.",
  },

  // ---------------------------------------------------------------- Berserker (Revee)
  rv_claymore: {
    owner: "berserker",
    name: "Silencer",
    slot: "weapon",
    icon: "assets/characters/revee/item_claymore.png",
    stats: { atk: 10, critDmg: 0.3 },
    desc: "A notched claymore. A blade that cuts silence.",
  },
  rv_hood: {
    owner: "berserker",
    name: "Shade Hood",
    slot: "head",
    icon: "assets/characters/revee/item_hood.png",
    stats: { def: 1, dodge: 0.05 },
    desc: "No face, no name, no witnesses.",
  },
  rv_coat: {
    owner: "berserker",
    name: "Mourning Coat",
    slot: "armor",
    icon: "assets/characters/revee/item_coat.png",
    stats: { def: 5, maxHp: 40 },
    desc: "Heavy black wool, strapped for a long war.",
  },
  rv_gloves: {
    owner: "berserker",
    name: "Iron Grip",
    slot: "hands",
    icon: "assets/characters/revee/item_gloves.png",
    stats: { atk: 3, critRate: 0.04 },
    desc: "The claymore never slips, even wet.",
  },
  rv_bracer: {
    owner: "berserker",
    name: "Bloodbound Bracer",
    slot: "wrist",
    icon: "assets/characters/revee/item_bracer.png",
    stats: { atk: 2, lifesteal: 0.03 },
    desc: "Taken from the Hollow King's hoard. It drinks what the blade spills.",
  },
  rv_belt: {
    owner: "berserker",
    name: "Harness of Burdens",
    slot: "belt",
    icon: "assets/characters/revee/item_belt.png",
    stats: { stamina: 30, magnet: 50 },
    desc: "Buckles for every blade and every coin.",
  },
  rv_boots: {
    owner: "berserker",
    name: "Sellsword Boots",
    slot: "boots",
    icon: "assets/characters/revee/item_boots.png",
    stats: { speed: 30, def: 1 },
    desc: "Worn through on a hundred roads.",
  },
  rv_ring: {
    owner: "berserker",
    name: "Chain of Oaths",
    slot: "ring",
    icon: "assets/characters/revee/item_ring.png",
    stats: { maxMp: 15, hpRegen: 1 },
    desc: "Every link a promise he kept.",
  },
};

/** A hero's gear set: slot -> item id. */
export function gearSet(characterId) {
  return Object.fromEntries(
    Object.entries(ITEMS)
      .filter(([, item]) => item.owner === characterId)
      .map(([id, item]) => [item.slot, id]),
  );
}

/** The slots a hero can fill, in display order. */
export const slotsFor = (characterId) => EQUIP_SLOTS.filter((slot) => slot in gearSet(characterId));

/** The hero's own piece for a slot, or null if their set has none. */
export const gearFor = (characterId, slot) => gearSet(characterId)[slot] ?? null;

export const CONSUMABLES = {
  potion: { name: "Red Tonic", icon: "assets/generated/potion.png", hotkey: "1", desc: "Restores 50% HP." },
  ether: { name: "Blue Ether", icon: "assets/generated/ether.png", hotkey: "2", desc: "Restores 50% MP." },
};

export const CURRENCIES = {
  gems: { name: "Gems", icon: "assets/generated/gem_green.png" },
  shards: { name: "Soul Shards", icon: "assets/generated/shard.png" },
};

export const STAT_LABELS = {
  maxHp: "Max HP",
  maxMp: "Max MP",
  atk: "Attack",
  def: "Defense",
  speed: "Speed",
  critRate: "Crit Rate",
  critDmg: "Crit Damage",
  magic: "Magic",
  magnet: "Magnet",
  stamina: "Stamina",
  expBoost: "EXP Gain",
  gemBoost: "Gem Gain",
  dropBoost: "Drop Chance",
  lifesteal: "Lifesteal",
  hpRegen: "HP Regen",
  mpRegen: "MP Regen",
  mpOnKill: "MP on Kill",
  dodge: "Dodge",
  thorns: "Thorns",
  reach: "Slash Reach",
  dashCdr: "Dash Cooldown",
  sprintMult: "Sprint Speed",
  luck: "Luck",
};

/** Stats stored as fractions and shown as percentages. */
const PERCENT_STATS = new Set(["critRate", "critDmg", "magic", "expBoost", "gemBoost", "dropBoost", "lifesteal", "dodge", "thorns", "reach", "sprintMult", "luck"]);

export function formatStat(stat, v) {
  if (stat === "dashCdr") return `-${Math.round(v * 100)}%`;
  if (PERCENT_STATS.has(stat)) return `+${Math.round(v * 100)}%`;
  if (stat === "hpRegen" || stat === "mpRegen") return `+${v}/s`;
  return `+${v}`;
}

// Blessings get pricier each time you buy them.
export const SHOP = [
  { id: "potion", kind: "consumable", item: "potion", cost: { gems: 20 } },
  { id: "ether", kind: "consumable", item: "ether", cost: { gems: 20 } },
  { id: "vigor", kind: "blessing", name: "Blessing of Vigor", stat: "maxHp", amount: 10, cost: { shards: 2 } },
  { id: "edge", kind: "blessing", name: "Blessing of Edge", stat: "atk", amount: 4, cost: { shards: 3 } },
  { id: "focus", kind: "blessing", name: "Blessing of Focus", stat: "maxMp", amount: 8, cost: { shards: 2 } },
  { id: "ward", kind: "blessing", name: "Blessing of Ward", stat: "def", amount: 1, cost: { shards: 3 } },
];

export const shopPrice = (entry, timesBought = 0) =>
  Object.fromEntries(
    Object.entries(entry.cost).map(([cur, n]) => [cur, entry.kind === "blessing" ? n + timesBought : n]),
  );
