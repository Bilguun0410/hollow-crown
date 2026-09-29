// Game rules that don't need Phaser: stats, EXP/levels, currencies, loot,
// equipment, shop, achievements and saving. Both the scene and the UI call these.
import { ACHIEVEMENTS } from "../data/achievements.js";
import { CHARACTERS, DEFAULT_CHARACTER } from "../data/characters.js";
import {
  CONSUMABLES,
  CURRENCIES,
  gearFor,
  ITEMS,
  SHOP,
  shopPrice,
} from "../data/items.js";
import {
  BOSS_RETURN_MS,
  BOSS_TYPES,
  REMATCH_COST,
} from "../data/monsters.js";
import { PASSIVES, REROLL_COST, rollOffer } from "../data/passives.js";
import { WORLD_BOSSES } from "../data/world-bosses.js";
import { sfx } from "../sfx.js";
import { events, freshProgress, PERSISTED_KEYS, store } from "./store.js";

const SAVE_KEY = "hollow-crown.save.v1";
export const MAX_LEVEL = 999;
export const expToNext = (level) => Math.floor(18 * level ** 1.6);

// ------------------------------------------------------------------ stats

// Stats every hero has even if the character data doesn't set them.
const STAT_DEFAULTS = {
  magnet: 40,
  critRate: 0,
  critDmg: 1.5,
  stamina: 100,
  expBoost: 0,
  gemBoost: 0,
  dropBoost: 0,
  lifesteal: 0,
  hpRegen: 0,
  mpRegen: 0,
  mpOnKill: 0,
  dodge: 0,
  thorns: 0,
  reach: 0,
  dashCdr: 0,
  sprintMult: 0,
  luck: 0,
};
const WHOLE_STATS = ["maxHp", "maxMp", "atk", "def", "speed", "stamina"];

/**
 * Final hero stats: base + level growth + blessings + gear + passives (flat),
 * then passive percentage bonuses. `flags` holds unique passive behaviours.
 */
export function getStats(s = store.get()) {
  const ch = CHARACTERS[s.hero.characterId];
  const stats = { ...STAT_DEFAULTS, ...ch.baseStats };
  const add = (bonus, times = 1) => {
    for (const [k, v] of Object.entries(bonus))
      stats[k] = (stats[k] ?? 0) + v * times;
  };
  add(ch.growth, s.hero.level - 1);
  add(s.blessings);
  for (const id of Object.values(s.equipment)) if (id) add(ITEMS[id].stats);

  const pct = {};
  const flags = new Set();
  for (const [id, rank] of Object.entries(s.passives ?? {})) {
    const p = PASSIVES[id];
    if (!p || !rank) continue;
    if (p.stats) add(p.stats, rank);
    for (const [k, v] of Object.entries(p.pct ?? {}))
      pct[k] = (pct[k] ?? 0) + v * rank;
    if (p.flag) flags.add(p.flag);
  }
  for (const [k, v] of Object.entries(pct)) stats[k] *= 1 + v;
  for (const k of WHOLE_STATS) stats[k] = Math.round(stats[k]);
  stats.dashCdr = Math.min(stats.dashCdr, 0.6);
  stats.dodge = Math.min(stats.dodge, 0.5);
  stats.flags = flags;
  return stats;
}

const clampVitals = (s) => {
  const st = getStats(s);
  return {
    ...s.hero,
    hp: Math.min(s.hero.hp ?? st.maxHp, st.maxHp),
    mp: Math.min(s.hero.mp ?? st.maxMp, st.maxMp),
  };
};

// ------------------------------------------------------------------ save / load

let saveTimer = null;
export function saveNow() {
  clearTimeout(saveTimer);
  const s = store.get();
  if (!s.hero.name) return;
  try {
    const data = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, s[k]]));
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...data, settings: s.settings }),
    );
  } catch {
    // storage unavailable (private mode) – play on without saving
  }
}
const saveSoon = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
};

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function detectSave() {
  const save = readSave();
  store.set({
    hasSave: !!save,
    settings: save?.settings ?? store.get().settings,
    savedName: save?.hero?.name ?? null,
    savedCharacter: save?.hero?.characterId ?? null,
  });
}

export function newGame(name, characterId = DEFAULT_CHARACTER) {
  const progress = freshProgress(
    name.trim() || CHARACTERS[characterId].defaultName,
    characterId,
  );
  store.set({
    ...progress,
    screen: "playing",
    overlay: null,
    toasts: [],
    boss: null,
  });
  store.set((s) => ({ hero: clampVitals(s) }));
  saveNow();
  events.emit("start");
}

export function continueGame() {
  const save = readSave();
  if (!save) return newGame("");
  const base = freshProgress(save.hero.name, save.hero.characterId);
  const merged = Object.fromEntries(
    PERSISTED_KEYS.map((k) => [
      k,
      save[k] && typeof save[k] === "object" && !Array.isArray(save[k])
        ? { ...base[k], ...save[k] }
        : (save[k] ?? base[k]),
    ]),
  );
  merged.counters.kills = { ...save.counters?.kills };
  store.set({
    ...merged,
    screen: "playing",
    overlay: null,
    toasts: [],
    boss: null,
  });
  store.set((s) => ({ hero: clampVitals(s) }));
  // Saves from before passives existed get one pick per level already gained.
  if (!("pendingPerks" in save)) {
    store.set((s) => ({ pendingPerks: s.hero.level - 1 }));
  }
  if (store.get().pendingPerks > 0 && !store.get().perkOffer?.length) {
    store.set((s) => ({ perkOffer: offerFor(s) }));
  }
  checkAchievements(); // catches achievements added since this save was made
  events.emit("start");
}

// ------------------------------------------------------------------ toasts & emotes

let toastId = 0;
export function toast(text, { kind = "info", icon = null, sub = null } = {}) {
  const id = ++toastId;
  store.set((s) => ({
    toasts: [...s.toasts.slice(-4), { id, text, kind, icon, sub }],
  }));
  setTimeout(
    () => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    kind === "achievement" ? 4200 : 2800,
  );
}

let emoteTimer = null;
export function flashEmote(emote, ms = 900) {
  clearTimeout(emoteTimer);
  store.set({ emote });
  emoteTimer = setTimeout(() => store.set({ emote: "neutral" }), ms);
}

// ------------------------------------------------------------------ vitals

export function damageHero(amount) {
  const s = store.get();
  const hp = Math.max(0, s.hero.hp - amount);
  store.set({ hero: { ...s.hero, hp } });
  if (hp > 0) flashEmote("hurt", 600);
  return hp;
}

export function heal(amount) {
  store.set((s) => ({
    hero: { ...s.hero, hp: Math.min(getStats(s).maxHp, s.hero.hp + amount) },
  }));
}

export function restoreMp(amount) {
  store.set((s) => ({
    hero: { ...s.hero, mp: Math.min(getStats(s).maxMp, s.hero.mp + amount) },
  }));
}

export function spendMp(amount) {
  const s = store.get();
  if (s.hero.mp < amount) return false;
  store.set({ hero: { ...s.hero, mp: s.hero.mp - amount } });
  return true;
}

export function heroDied() {
  store.set((s) => ({
    counters: { ...s.counters, deaths: s.counters.deaths + 1 },
    boss: null,
    prompt: null,
  }));
  sfx.death();
  setTimeout(() => store.set({ screen: "dead" }), 1400);
}

export function respawn() {
  store.set((s) => {
    const lost = Math.floor(s.wallet.gems * 0.1);
    const st = getStats(s);
    return {
      screen: "playing",
      wallet: { ...s.wallet, gems: s.wallet.gems - lost },
      hero: { ...s.hero, hp: st.maxHp, mp: st.maxMp },
      lastDeathPenalty: lost,
    };
  });
  saveNow();
  events.emit("respawn");
}

// ------------------------------------------------------------------ progression

/** Adds EXP (after the hero's EXP boost) and returns the amount gained. */
export function gainExp(baseAmount) {
  const amount = Math.round(baseAmount * (1 + getStats().expBoost));
  let leveled = 0;
  store.set((s) => {
    let { level, exp } = s.hero;
    exp += amount;
    while (level < MAX_LEVEL && exp >= expToNext(level)) {
      exp -= expToNext(level);
      level++;
      leveled++;
    }
    if (level >= MAX_LEVEL) exp = 0;
    return { hero: { ...s.hero, level, exp } };
  });
  if (leveled) {
    const s = store.get();
    const st = getStats(s);
    store.set({
      hero: { ...s.hero, hp: st.maxHp, mp: st.maxMp },
      pendingPerks: s.pendingPerks + leveled,
    });
    if (!s.perkOffer?.length) store.set((st2) => ({ perkOffer: offerFor(st2) }));
    toast(`Level up! Lv. ${s.hero.level}`, {
      kind: "level",
      sub: "HP & MP restored · choose a passive skill",
    });
    flashEmote("laugh", 1400);
    sfx.levelUp();
    events.emit("levelUp", s.hero.level);
  }
  checkAchievements();
  saveSoon();
  return amount;
}

// ------------------------------------------------------------------ passives

/** A fresh offer, or null once every passive is maxed out. */
function offerFor(s) {
  const luck = getStats(s).luck + s.hero.level * 0.02;
  const special = CHARACTERS[s.hero.characterId].skills.special.type;
  const offer = rollOffer(s.passives, luck, special);
  return offer.length ? offer : null;
}

export function choosePerk(id) {
  const s = store.get();
  if (!s.perkOffer?.includes(id)) return;
  const before = getStats(s);
  const rank = (s.passives[id] ?? 0) + 1;
  const pendingPerks = Math.max(0, s.pendingPerks - 1);
  store.set({
    passives: { ...s.passives, [id]: rank },
    pendingPerks,
    perkOffer: null,
  });
  // Extra max HP/MP from the pick arrives filled rather than empty.
  const after = getStats();
  store.set((st) => ({
    hero: {
      ...st.hero,
      hp: Math.min(after.maxHp, st.hero.hp + Math.max(0, after.maxHp - before.maxHp)),
      mp: Math.min(after.maxMp, st.hero.mp + Math.max(0, after.maxMp - before.maxMp)),
    },
  }));
  if (pendingPerks > 0) store.set((st) => ({ perkOffer: offerFor(st) }));

  const p = PASSIVES[id];
  toast(rank > 1 ? `${p.name} · rank ${rank}` : p.name, { kind: "perk", sub: p.desc });
  if (["legendary", "mythic"].includes(p.rarity)) sfx.achievement();
  else sfx.equip();
  checkAchievements();
  saveNow();
}

export function rerollPerks() {
  const s = store.get();
  const affordable = Object.entries(REROLL_COST).every(
    ([cur, n]) => s.wallet[cur] >= n,
  );
  if (!s.perkOffer || !affordable) return sfx.error();
  const wallet = { ...s.wallet };
  for (const [cur, n] of Object.entries(REROLL_COST)) wallet[cur] -= n;
  store.set({ wallet, rerolls: s.rerolls + 1 });
  store.set((st) => ({ perkOffer: offerFor(st) }));
  sfx.coin();
  saveSoon();
}

/** Stamina is session-only and pushed a few times a second while it changes. */
export const setStamina = (value) =>
  store.get().stamina !== value && store.set({ stamina: value });

export function addCurrency(kind, amount) {
  if (!amount) return;
  store.set((s) => ({
    wallet: { ...s.wallet, [kind]: s.wallet[kind] + amount },
    counters:
      kind === "gems"
        ? { ...s.counters, gemsEarned: s.counters.gemsEarned + amount }
        : s.counters,
  }));
  checkAchievements();
  saveSoon();
}

export function addConsumable(id, n = 1) {
  store.set((s) => ({ bag: { ...s.bag, [id]: (s.bag[id] ?? 0) + n } }));
  saveSoon();
}

export function useConsumable(id) {
  const s = store.get();
  if (!s.bag[id] || s.screen !== "playing") return;
  const st = getStats(s);
  if (id === "potion" && s.hero.hp >= st.maxHp)
    return toast("HP is already full");
  if (id === "ether" && s.hero.mp >= st.maxMp)
    return toast("MP is already full");
  store.set({ bag: { ...s.bag, [id]: s.bag[id] - 1 } });
  if (id === "potion") heal(Math.ceil(st.maxHp * 0.5));
  if (id === "ether") restoreMp(Math.ceil(st.maxMp * 0.5));
  sfx.drink();
  events.emit("consumed", id);
  saveSoon();
}

function bump(counter, n = 1) {
  store.set((s) => ({
    counters: { ...s.counters, [counter]: s.counters[counter] + n },
  }));
  checkAchievements();
  saveSoon();
}

export const recordCut = () => bump("cut");
export const recordBolt = () => bump("bolts");

export function recordKill(type) {
  store.set((s) => ({
    counters: {
      ...s.counters,
      totalKills: s.counters.totalKills + 1,
      kills: { ...s.counters.kills, [type]: (s.counters.kills[type] ?? 0) + 1 },
    },
  }));
  checkAchievements();
}

// ------------------------------------------------------------------ items & loot

export function grantItem(id) {
  const item = ITEMS[id];
  const s = store.get();
  if (s.owned.includes(id)) return;
  store.set({ owned: [...s.owned, id] });
  toast(`Found ${item.name}!`, {
    kind: "item",
    icon: item.icon,
    sub: item.desc,
  });
  if (!store.get().equipment[item.slot]) equip(id, { quiet: true });
  flashEmote("happy", 1400);
  saveSoon();
}

/** The current hero's piece for a gear slot, or null if their set has none. */
export const heroGear = (slot, s = store.get()) =>
  slot ? gearFor(s.hero.characterId, slot) : null;

/** Loot table object: { item, gear, gems, shards, potion, ether }. */
export function grantLoot(loot) {
  if (loot.item) grantItem(loot.item);
  const gear = heroGear(loot.gear);
  if (gear) grantItem(gear);
  for (const cur of Object.keys(CURRENCIES)) {
    if (loot[cur]) {
      addCurrency(cur, loot[cur]);
      toast(`+${loot[cur]} ${CURRENCIES[cur].name}`, {
        icon: CURRENCIES[cur].icon,
      });
    }
  }
  for (const c of Object.keys(CONSUMABLES)) {
    if (loot[c]) {
      addConsumable(c, loot[c]);
      toast(`+${loot[c]} ${CONSUMABLES[c].name}`, {
        icon: CONSUMABLES[c].icon,
      });
    }
  }
}

export function openChest(id, loot) {
  const s = store.get();
  if (s.world.chestsOpened.includes(id)) return false;
  store.set({
    world: { ...s.world, chestsOpened: [...s.world.chestsOpened, id] },
  });
  sfx.chest();
  grantLoot(loot);
  checkAchievements();
  saveSoon();
  return true;
}

export function equip(id, { quiet = false } = {}) {
  const item = ITEMS[id];
  if (item.owner && item.owner !== store.get().hero.characterId) return;
  store.set((s) => ({ equipment: { ...s.equipment, [item.slot]: id } }));
  store.set((s) => ({ hero: clampVitals(s) }));
  if (!quiet) sfx.equip();
  checkAchievements();
  saveSoon();
}

export function unequip(slot) {
  store.set((s) => ({ equipment: { ...s.equipment, [slot]: null } }));
  store.set((s) => ({ hero: clampVitals(s) }));
  sfx.equip();
  saveSoon();
}

// ------------------------------------------------------------------ shrine shop

export function buy(entryId) {
  const entry = SHOP.find((e) => e.id === entryId);
  const s = store.get();
  const price = shopPrice(entry, s.purchases[entryId] ?? 0);
  if (Object.entries(price).some(([cur, n]) => s.wallet[cur] < n)) {
    sfx.error();
    return false;
  }
  const wallet = { ...s.wallet };
  for (const [cur, n] of Object.entries(price)) wallet[cur] -= n;
  const patch = {
    wallet,
    purchases: { ...s.purchases, [entryId]: (s.purchases[entryId] ?? 0) + 1 },
    counters: { ...s.counters, purchases: s.counters.purchases + 1 },
  };
  if (entry.kind === "consumable")
    patch.bag = { ...s.bag, [entry.item]: (s.bag[entry.item] ?? 0) + 1 };
  if (entry.kind === "blessing")
    patch.blessings = {
      ...s.blessings,
      [entry.stat]: (s.blessings[entry.stat] ?? 0) + entry.amount,
    };
  store.set(patch);
  if (entry.kind === "blessing") store.set((st) => ({ hero: clampVitals(st) }));
  sfx.coin();
  checkAchievements();
  saveSoon();
  return true;
}

export function prayAtShrine() {
  const s = store.get();
  const st = getStats(s);
  store.set({
    hero: { ...s.hero, hp: st.maxHp, mp: st.maxMp },
    overlay: "shop",
  });
  sfx.shrine();
  saveNow();
}

// ------------------------------------------------------------------ bosses

/** Times this boss has been beaten, which is also its tier when it returns. */
export const bossTier = (s, id) => s.world.bossKills?.[id] ?? 0;

/** Whether the boss should be in its arena right now. */
export function bossPresent(s, id) {
  if (!s.world.bossesDefeated.includes(id)) return true;
  return Date.now() >= (s.world.bossReturnsAt?.[id] ?? Infinity);
}

export function engageBoss(id, hp, maxHp, tier) {
  const b = BOSS_TYPES[id];
  store.set({ boss: { id, name: b.name, title: b.title, hp, maxHp, tier } });
  flashEmote("angry", 2500);
}

/** Shrine rematch: pay shards to have a defeated boss return right away. */
export function summonBoss(id) {
  const s = store.get();
  const affordable = Object.entries(REMATCH_COST).every(
    ([cur, n]) => s.wallet[cur] >= n,
  );
  if (bossPresent(s, id) || !affordable) return sfx.error();
  const wallet = { ...s.wallet };
  for (const [cur, n] of Object.entries(REMATCH_COST)) wallet[cur] -= n;
  store.set({
    wallet,
    world: {
      ...s.world,
      bossReturnsAt: { ...s.world.bossReturnsAt, [id]: Date.now() },
    },
  });
  toast(`${BOSS_TYPES[id].name} stirs in its lair…`, {
    kind: "level",
    sub: `Empowered ★${bossTier(s, id)}`,
  });
  sfx.gate();
  saveNow();
}

export const updateBossHp = (hp) =>
  store.set((s) =>
    s.boss ? { boss: { ...s.boss, hp: Math.max(0, hp) } } : null,
  );

export function defeatBoss(id, flawless) {
  const s = store.get();
  store.set({
    boss: s.boss?.id === id ? null : s.boss,
    world: {
      ...s.world,
      bossesDefeated: [...new Set([...s.world.bossesDefeated, id])],
      bossKills: { ...s.world.bossKills, [id]: bossTier(s, id) + 1 },
      bossReturnsAt: {
        ...s.world.bossReturnsAt,
        [id]: Date.now() + BOSS_RETURN_MS,
      },
    },
    counters: flawless
      ? { ...s.counters, flawlessBosses: s.counters.flawlessBosses + 1 }
      : s.counters,
  });
  toast(`${BOSS_TYPES[id].name} has fallen!`, {
    kind: "level",
    sub: `Returns stronger in ${BOSS_RETURN_MS / 60000} min, or sooner via the shrine`,
  });
  checkAchievements();
  saveNow();
}

// ------------------------------------------------------------------ co-op world bosses

/** The server says this hero helped defeat a hidden boss. */
export function worldBossReward({ id, exp, gems, shards, team }) {
  const def = WORLD_BOSSES[id];
  if (!def) return;
  store.set((s) => ({
    counters: {
      ...s.counters,
      worldBossKills: {
        ...s.counters.worldBossKills,
        [id]: (s.counters.worldBossKills?.[id] ?? 0) + 1,
      },
    },
  }));
  toast(`${def.name} is vanquished!`, {
    kind: "level",
    sub: `Victory with ${team} heroes · +${exp} EXP`,
  });
  sfx.achievement();
  flashEmote("laugh", 2000);
  addCurrency("gems", gems);
  addCurrency("shards", shards);
  gainExp(exp);
  saveNow();
}

/** Only rewrites the HUD bar when something visible changed. */
export function setWorldBossBar(bar) {
  const cur = store.get().worldBoss;
  const same =
    cur === bar ||
    (cur && bar && cur.id === bar.id && cur.hp === bar.hp && cur.maxHp === bar.maxHp && cur.shield === bar.shield);
  if (!same) store.set({ worldBoss: bar });
}

// ------------------------------------------------------------------ achievements

export function checkAchievements() {
  const s = store.get();
  const unlocked = ACHIEVEMENTS.filter((a) => {
    if (s.achievements[a.id]) return false;
    const [cur, goal] = a.progress(s);
    return cur >= goal;
  });
  if (!unlocked.length) return;
  const now = Date.now();
  store.set((st) => ({
    achievements: {
      ...st.achievements,
      ...Object.fromEntries(unlocked.map((a) => [a.id, now])),
    },
    wallet: {
      ...st.wallet,
      gems: st.wallet.gems + unlocked.reduce((n, a) => n + a.reward, 0),
    },
  }));
  for (const a of unlocked) {
    toast(a.name, { kind: "achievement", sub: `${a.desc}  +${a.reward} gems` });
    sfx.achievement();
  }
  saveSoon();
}

// ------------------------------------------------------------------ UI helpers

export const openOverlay = (overlay, menuTab) =>
  store.set((s) => ({ overlay, menuTab: menuTab ?? s.menuTab }));
export const closeOverlay = () => store.set({ overlay: null });
export const setPrompt = (prompt) =>
  store.get().prompt !== prompt && store.set({ prompt });
export const setRegion = (region) =>
  store.get().region !== region && store.set({ region });
export const setCooldown = (skill, readyAt, duration) =>
  store.set((s) => ({
    cooldowns: { ...s.cooldowns, [skill]: { readyAt, duration } },
  }));

export function toggleMute() {
  store.set((s) => ({ settings: { ...s.settings, muted: !s.settings.muted } }));
  sfx.setMuted(store.get().settings.muted);
  saveSoon();
}
