// Achievements are checked against the persisted counters after every change.
// `progress` returns [current, goal] for the menu's progress bars.
import { CHESTS } from "../world/map.js";
import { slotsFor } from "./items.js";
import { PASSIVES } from "./passives.js";

const kills = (s, type) => s.counters.kills[type] ?? 0;
const passiveRanks = (s) => Object.values(s.passives ?? {}).reduce((a, b) => a + b, 0);
const ownsRarity = (s, rarity) => Object.keys(s.passives ?? {}).some((id) => PASSIVES[id]?.rarity === rarity);

export const ACHIEVEMENTS = [
  { id: "first_blood", name: "First Blood", desc: "Defeat your first monster.", reward: 5, progress: (s) => [s.counters.totalKills, 1] },
  { id: "slime_slayer", name: "Slime Slayer", desc: "Defeat 15 slimes of any kind.", reward: 20, progress: (s) => [kills(s, "slime") + kills(s, "redslime"), 15] },
  { id: "bat_bane", name: "Bat Bane", desc: "Defeat 10 Dusk Bats.", reward: 20, progress: (s) => [kills(s, "bat"), 10] },
  { id: "bone_breaker", name: "Bone Breaker", desc: "Defeat 10 Bonewalkers.", reward: 30, progress: (s) => [kills(s, "skeleton"), 10] },
  { id: "hunter", name: "Monster Hunter", desc: "Defeat 100 monsters.", reward: 80, progress: (s) => [s.counters.totalKills, 100] },
  { id: "lawn_keeper", name: "Lawn Keeper", desc: "Cut 40 bushes or tufts of grass.", reward: 10, progress: (s) => [s.counters.cut, 40] },
  { id: "pocket_change", name: "Pocket Change", desc: "Collect 100 gems in total.", reward: 10, progress: (s) => [s.counters.gemsEarned, 100] },
  { id: "hoarder", name: "Hoarder", desc: "Collect 1,000 gems in total.", reward: 100, progress: (s) => [s.counters.gemsEarned, 1000] },
  { id: "treasure_hunter", name: "Treasure Hunter", desc: "Open every chest in the land.", reward: 50, progress: (s) => [s.world.chestsOpened.length, CHESTS.length] },
  { id: "well_equipped", name: "Well Equipped", desc: "Fill every equipment slot.", reward: 40, progress: (s) => { const slots = slotsFor(s.hero.characterId); return [slots.filter((k) => s.equipment[k]).length, slots.length]; } },
  { id: "arcanist", name: "Arcanist", desc: "Cast 30 shadow bolts.", reward: 15, progress: (s) => [s.counters.bolts, 30] },
  { id: "patron", name: "Patron of the Shrine", desc: "Buy something at the shrine.", reward: 5, progress: (s) => [s.counters.purchases, 1] },
  { id: "level_5", name: "Seasoned", desc: "Reach level 5.", reward: 25, progress: (s) => [s.hero.level, 5] },
  { id: "level_10", name: "Veteran", desc: "Reach level 10.", reward: 75, progress: (s) => [s.hero.level, 10] },
  { id: "build_crafter", name: "Build Crafter", desc: "Learn 10 ranks of passive skills.", reward: 40, progress: (s) => [passiveRanks(s), 10] },
  { id: "legend_born", name: "Legend Born", desc: "Learn a Legendary passive skill.", reward: 60, progress: (s) => [ownsRarity(s, "legendary") ? 1 : 0, 1] },
  { id: "touched_by_myth", name: "Touched by Myth", desc: "Learn a Mythic passive skill.", reward: 120, progress: (s) => [ownsRarity(s, "mythic") ? 1 : 0, 1] },
  { id: "golem_fall", name: "Moss and Stone", desc: "Defeat the Mossback Golem.", reward: 50, progress: (s) => [s.world.bossesDefeated.includes("golem") ? 1 : 0, 1] },
  { id: "crownbreaker", name: "Crownbreaker", desc: "Defeat the Hollow King.", reward: 150, progress: (s) => [s.world.bossesDefeated.includes("wraith") ? 1 : 0, 1] },
  { id: "relentless", name: "Relentless", desc: "Defeat an empowered boss that came back for more.", reward: 80, progress: (s) => [Object.values(s.world.bossKills ?? {}).some((n) => n >= 2) ? 1 : 0, 1] },
  { id: "blood_moon", name: "Blood Moon Breaker", desc: "Defeat the Eclipse Titan with your allies.", reward: 200, progress: (s) => [s.counters.worldBossKills?.eclipse ?? 0, 1] },
  { id: "oathbreaker", name: "Oathbreaker", desc: "Defeat the Bound Colossus with your allies.", reward: 250, progress: (s) => [s.counters.worldBossKills?.bound ?? 0, 1] },
  { id: "untouchable", name: "Untouchable", desc: "Defeat a boss without taking damage.", reward: 100, progress: (s) => [s.counters.flawlessBosses, 1] },
];
