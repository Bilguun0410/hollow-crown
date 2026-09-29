// Passive skills offered on level up. Each pick adds one rank (up to `max`).
//
//   stats: flat bonuses per rank, added like gear stats (see STAT_LABELS)
//   pct:   percentage bonuses per rank, applied after all flat bonuses
//   flag:  a unique behaviour the game checks for (see world-scene / player)
//   requires: only offered to heroes whose special skill has this type

export const RARITIES = {
  common: { label: "Common", weight: 56, color: "#c9cad1" },
  rare: { label: "Rare", weight: 27, color: "#5aa2ff" },
  ultraRare: { label: "Ultra Rare", weight: 11, color: "#b070ff" },
  legendary: { label: "Legendary", weight: 5, color: "#ffb020" },
  mythic: { label: "Mythic", weight: 1, color: "#ff4d6d" },
};

export const RARITY_ORDER = Object.keys(RARITIES);

export const PASSIVES = {
  // ---------------------------------------------------------------- common
  vigor: { name: "Vigor", rarity: "common", max: 5, icon: "♥", stats: { maxHp: 15 }, desc: "+15 Max HP" },
  focus: { name: "Focus", rarity: "common", max: 5, icon: "◆", stats: { maxMp: 10 }, desc: "+10 Max MP" },
  might: { name: "Might", rarity: "common", max: 5, icon: "⚔", stats: { atk: 3 }, desc: "+3 Attack" },
  ironSkin: { name: "Iron Skin", rarity: "common", max: 5, icon: "⛨", stats: { def: 2 }, desc: "+2 Defense" },
  fleetFoot: { name: "Fleet Foot", rarity: "common", max: 3, icon: "»", stats: { speed: 10 }, desc: "+10 Speed" },
  keenEye: { name: "Keen Eye", rarity: "common", max: 5, icon: "✧", stats: { critRate: 0.04 }, desc: "+4% Crit Rate" },
  scholar: { name: "Scholar", rarity: "common", max: 3, icon: "✎", stats: { expBoost: 0.1 }, desc: "+10% EXP from all sources" },
  meditation: { name: "Meditation", rarity: "common", max: 3, icon: "☾", stats: { mpRegen: 1 }, desc: "Regenerate 1 MP per second" },
  endurance: { name: "Endurance", rarity: "common", max: 3, icon: "≋", stats: { stamina: 25 }, desc: "+25 Max Stamina for sprinting" },

  // ---------------------------------------------------------------- rare
  sage: { name: "Sage", rarity: "rare", max: 2, icon: "✎", stats: { expBoost: 0.2 }, desc: "+20% EXP from all sources" },
  cruelty: { name: "Cruelty", rarity: "rare", max: 3, icon: "✦", stats: { critDmg: 0.3 }, desc: "+30% Crit Damage" },
  trollBlood: { name: "Troll Blood", rarity: "rare", max: 3, icon: "✚", stats: { hpRegen: 1.5 }, desc: "Regenerate 1.5 HP per second" },
  thornhide: { name: "Thornhide", rarity: "rare", max: 2, icon: "✺", stats: { thorns: 0.4 }, desc: "Reflect 40% of contact damage back at the attacker" },
  luckyCharm: { name: "Lucky Charm", rarity: "rare", max: 2, icon: "☘", stats: { dropBoost: 0.3, luck: 0.15 }, desc: "+30% drop chance, slightly rarer passive offers" },
  magpie: { name: "Magpie", rarity: "rare", max: 3, icon: "◈", stats: { gemBoost: 0.25 }, desc: "+25% gems from pickups" },
  wideArc: { name: "Wide Arc", rarity: "rare", max: 2, icon: "◠", stats: { reach: 0.2 }, desc: "+20% sword reach" },
  manaSiphon: { name: "Mana Siphon", rarity: "rare", max: 2, icon: "◇", stats: { mpOnKill: 3 }, desc: "Restore 3 MP per kill" },
  marathoner: { name: "Marathoner", rarity: "rare", max: 2, icon: "≫", stats: { sprintMult: 0.2, stamina: 30 }, desc: "+20% sprint speed, +30 Max Stamina" },

  // ---------------------------------------------------------------- ultra rare
  vampiric: { name: "Vampiric Edge", rarity: "ultraRare", max: 2, icon: "✠", stats: { lifesteal: 0.06 }, desc: "Heal for 6% of the damage you deal" },
  shadowVeil: { name: "Shadow Veil", rarity: "ultraRare", max: 2, icon: "◐", stats: { dodge: 0.1 }, desc: "10% chance to dodge any hit" },
  phantomStep: { name: "Phantom Step", rarity: "ultraRare", max: 2, icon: "⇶", stats: { dashCdr: 0.3 }, desc: "-30% dash cooldown" },
  warlord: { name: "Warlord", rarity: "ultraRare", max: 2, icon: "♜", pct: { atk: 0.12 }, desc: "+12% Attack" },
  deadeye: { name: "Deadeye", rarity: "ultraRare", max: 2, icon: "◎", stats: { critRate: 0.1, critDmg: 0.25 }, desc: "+10% Crit Rate, +25% Crit Damage" },
  twinBolt: { name: "Twin Bolt", rarity: "ultraRare", max: 1, icon: "⋔", flag: "twinBolt", requires: "bolt", desc: "Shadow bolts split into three" },
  cyclone: { name: "Cyclone", rarity: "ultraRare", max: 1, icon: "↻", flag: "cyclone", requires: "whirlwind", desc: "Whirlwind reaches 35% farther and costs 4 less MP" },

  // ---------------------------------------------------------------- legendary
  secondWind: { name: "Second Wind", rarity: "legendary", max: 1, icon: "❂", flag: "secondWind", desc: "Once per life, survive a killing blow with 1 HP" },
  executioner: { name: "Executioner", rarity: "legendary", max: 1, icon: "☠", flag: "executioner", desc: "+75% damage to enemies below 30% HP" },
  berserker: { name: "Berserker's Rage", rarity: "legendary", max: 1, icon: "♨", flag: "berserker", desc: "Up to +60% damage as your HP drops" },
  colossus: { name: "Colossus", rarity: "legendary", max: 2, icon: "♛", pct: { maxHp: 0.15, atk: 0.15, def: 0.15 }, desc: "+15% Max HP, Attack and Defense" },
  fortune: { name: "Fortune's Favor", rarity: "legendary", max: 1, icon: "✪", stats: { luck: 0.6 }, desc: "Future passive offers are far more likely to be rare" },

  // ---------------------------------------------------------------- mythic
  ascendant: {
    name: "Ascendant",
    rarity: "mythic",
    max: 1,
    icon: "☀",
    stats: { expBoost: 0.5 },
    pct: { maxHp: 0.1, maxMp: 0.1, atk: 0.1, def: 0.1, speed: 0.1 },
    desc: "+50% EXP and +10% to every core stat",
  },
  fatalBlossom: { name: "Fatal Blossom", rarity: "mythic", max: 1, icon: "❀", flag: "fatalBlossom", desc: "Critical hits burst, dealing 50% of the damage to nearby foes" },
  eclipse: { name: "Eclipse", rarity: "mythic", max: 1, icon: "◉", flag: "eclipse", desc: "Every third sword slash also fires a free shadow bolt" },
};

export const OFFER_SIZE = 3;
export const REROLL_COST = { shards: 1 };

/**
 * Weighted random offer of passives the hero can still rank up.
 * `luck` pushes weight toward higher tiers: tier i is scaled by (1 + luck * i).
 */
export function rollOffer(owned, luck, specialType, rand = Math.random) {
  const available = Object.entries(PASSIVES).filter(
    ([id, p]) => (owned[id] ?? 0) < p.max && (!p.requires || p.requires === specialType),
  );
  const offer = [];
  while (offer.length < OFFER_SIZE) {
    const pool = available.filter(([id]) => !offer.includes(id));
    if (!pool.length) break;
    const tiers = RARITY_ORDER.filter((r) => pool.some(([, p]) => p.rarity === r));
    const weights = tiers.map((r) => RARITIES[r].weight * (1 + luck * RARITY_ORDER.indexOf(r)));
    let roll = rand() * weights.reduce((a, b) => a + b, 0);
    const tier = tiers.find((_, i) => (roll -= weights[i]) < 0) ?? tiers.at(-1);
    const inTier = pool.filter(([, p]) => p.rarity === tier);
    offer.push(inTier[Math.floor(rand() * inTier.length)][0]);
  }
  return offer;
}
