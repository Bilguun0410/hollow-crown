// Single source of truth shared by Phaser (writes during play) and React
// (renders the HUD/menus and dispatches actions). Immutable updates only, so
// React's useSyncExternalStore can compare snapshots by reference.
import { useSyncExternalStore } from "react";
import { DEFAULT_CHARACTER } from "../data/characters.js";
import { slotsFor } from "../data/items.js";

export function freshProgress(name, characterId = DEFAULT_CHARACTER) {
  return {
    hero: { name, characterId, level: 1, exp: 0, hp: null, mp: null },
    wallet: { gems: 0, shards: 0 },
    bag: { potion: 1, ether: 0 },
    owned: [],
    equipment: Object.fromEntries(slotsFor(characterId).map((s) => [s, null])),
    blessings: {},
    purchases: {},
    passives: {}, // passive id -> rank
    perkOffer: null, // passive ids offered for the current level-up pick
    pendingPerks: 0, // level-ups not yet spent on a passive
    rerolls: 0,
    // bossesDefeated: first-kill unlocks. bossKills: times beaten (= its tier
    // on return). bossReturnsAt: epoch ms when a defeated boss reappears.
    world: { chestsOpened: [], bossesDefeated: [], bossKills: {}, bossReturnsAt: {} },
    counters: { kills: {}, totalKills: 0, cut: 0, gemsEarned: 0, bolts: 0, purchases: 0, deaths: 0, flawlessBosses: 0, worldBossKills: {} },
    achievements: {},
  };
}

/** Keys written to localStorage; everything else is session-only. */
export const PERSISTED_KEYS = Object.keys(freshProgress(""));

const initial = {
  ...freshProgress(""),
  screen: "title", // title | playing | dead
  overlay: null, // null | menu | shop
  menuTab: "hero",
  assetsLoaded: 0,
  assetsReady: false,
  hasSave: false,
  settings: { muted: false },
  // transient HUD state
  toasts: [],
  boss: null,
  worldBoss: null, // nearest co-op boss for the HUD bar
  region: "",
  prompt: null,
  emote: "neutral",
  cooldowns: {},
  stamina: null, // null = full; the player pushes updates while sprinting
};

let state = initial;
const listeners = new Set();

export const store = {
  get: () => state,
  set(patch) {
    const next = typeof patch === "function" ? patch(state) : patch;
    if (!next) return;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useGame = () => useSyncExternalStore(store.subscribe, store.get);

// Tiny event bus for one-off signals between UI and game (not state).
const handlers = new Map();
export const events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => handlers.get(name).delete(fn);
  },
  emit(name, payload) {
    handlers.get(name)?.forEach((fn) => fn(payload));
  },
};
