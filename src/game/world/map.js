// The overworld, painted deterministically from a seed: hand-placed landmarks
// (shrine, lake, ruins, boss arenas) with noise-driven forests and grass.
//
// Layout (tiles): the original heartland is x 0-63, y 0-55. The Ashen Wastes
// lie east (x 64-103, y 0-43), Starfall Crater south-east (x 64-103, y 44-87)
// and Frostmere south (x 0-63, y 56-87), each behind a ridge with passes.
// Pure JS (no Phaser) so tools/gen-assets.js can render a preview of it.
import { EDGE, PATH_BASE, SOLID_TILES, TILE, WATER_BASE } from "./tiles.js";

export const MAP_W = 104;
export const MAP_H = 88;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(rng, cell) {
  const gw = Math.ceil(MAP_W / cell) + 2;
  const gh = Math.ceil(MAP_H / cell) + 2;
  const g = Array.from({ length: gh }, () => Array.from({ length: gw }, rng));
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = s(fx - x0);
    const v = s(fy - y0);
    const a = g[y0][x0];
    const b = g[y0][x0 + 1];
    const c = g[y0 + 1][x0];
    const d = g[y0 + 1][x0 + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Named areas, used for the Zelda-style "entering <area>" banner. First match wins. */
export const REGIONS = [
  { name: "Cinder Forge", rect: [86, 3, 100, 16] },
  { name: "Ashen Wastes", rect: [64, 0, 103, 43] },
  { name: "Rime Hollow", rect: [4, 66, 19, 80] },
  { name: "Frostmere", rect: [0, 56, 63, 87] },
  { name: "Altar of Binding", rect: [76, 58, 92, 74] },
  { name: "Starfall Crater", rect: [64, 44, 103, 87] },
  { name: "Sanctum of the Hollow King", rect: [23, 2, 42, 15] },
  { name: "Mossback Ruins", rect: [43, 2, 61, 27] },
  { name: "Whispering Woods", rect: [2, 2, 20, 27] },
  { name: "Haunted Grove", rect: [21, 2, 44, 26] },
  { name: "Mirror Lake", rect: [2, 28, 20, 44] },
  { name: "Eastern Wilds", rect: [45, 28, 61, 53] },
  { name: "Southern Hedges", rect: [2, 45, 44, 53] },
  { name: "Shrine Meadow", rect: [21, 27, 44, 44] },
];

/** Monster spawn zones: [x0, y0, x1, y1] in tiles (inclusive). */
export const SPAWN_ZONES = [
  { id: "meadow", rect: [21, 27, 44, 44], monsters: { slime: 6 } },
  { id: "woods", rect: [2, 2, 20, 27], monsters: { bat: 5, slime: 2 } },
  { id: "lake", rect: [2, 28, 20, 44], monsters: { slime: 3 } },
  { id: "grove", rect: [21, 16, 44, 26], monsters: { skeleton: 3, bat: 3 } },
  { id: "ruins", rect: [43, 17, 61, 27], monsters: { skeleton: 4 } },
  { id: "east", rect: [45, 28, 61, 53], monsters: { redslime: 5, slime: 2 } },
  { id: "south", rect: [2, 45, 44, 53], monsters: { slime: 4, redslime: 2 } },
  { id: "wastes", rect: [66, 2, 102, 41], monsters: { scorpion: 5, imp: 4 } },
  { id: "frost", rect: [2, 58, 61, 86], monsters: { wolf: 5, wisp: 4 } },
  { id: "crater", rect: [66, 46, 102, 86], monsters: { skeleton: 3, imp: 2, wisp: 2 } },
];

// `gear` is an equipment slot: the hero gets their own set's piece for it (if any).
export const CHESTS = [
  { id: "woods", x: 8, y: 9, loot: { gear: "boots" } },
  { id: "island", x: 10, y: 36, loot: { gear: "ring" } },
  { id: "hedges", x: 32, y: 50, loot: { gear: "belt" } },
  { id: "ruins", x: 58, y: 21, loot: { gear: "armor" } },
  { id: "wilds", x: 56, y: 45, loot: { potion: 2, ether: 2, gems: 30, gear: "hands" } },
  { id: "grove", x: 24, y: 19, loot: { shards: 3, gems: 15, gear: "head" } },
  { id: "wastes", x: 70, y: 8, loot: { gems: 80, shards: 4, potion: 2 } },
  { id: "frost", x: 52, y: 82, loot: { gems: 80, shards: 4, ether: 2 } },
  { id: "crater", x: 99, y: 84, loot: { gems: 120, shards: 6 } },
];

// openTile: what the doorway turns into once the fight is over.
export const BOSSES = [
  { id: "golem", x: 52.5, y: 9, arena: [46, 4, 59, 15], doors: [[51, 16], [52, 16]], openTile: "floor" },
  { id: "wraith", x: 32.5, y: 7, arena: [24, 3, 41, 14], doors: [[32, 15], [33, 15]], sealedUntil: "golem" },
  { id: "pyre", x: 93, y: 9.5, arena: [87, 4, 99, 15], doors: [[92, 16], [93, 16]] },
  { id: "rime", x: 12, y: 75, arena: [5, 67, 18, 79], doors: [[11, 66], [12, 66]] },
];

/**
 * Hidden co-op bosses (run by the server, see server/world-bosses.js).
 * x/y: spawn point in tiles; leash: how far (px) they roam from it.
 */
export const WORLD_BOSS_SITES = {
  eclipse: { x: 80, y: 27, leash: 420 },
  bound: { x: 84, y: 64, leash: 380, altar: [83, 67, 85, 69] },
};

const SOLID = new Set(SOLID_TILES);
const PATHLIKE = new Set(["path", "floor", "shrine", "bridge", "gate", "gateopen"]);

export function buildWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const noise = valueNoise(rng, 5);
  const fine = valueNoise(rng, 2.5);
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill("grass"));
  const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const set = (x, y, t) => inMap(x, y) && (grid[y][x] = t);
  const get = (x, y) => (inMap(x, y) ? grid[y][x] : "tree");
  const each = ([x0, y0, x1, y1], fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
  };
  const fill = (r, t) => each(r, (x, y) => set(x, y, t));
  const inEllipse = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

  // 1. Ground cover.
  each([0, 0, MAP_W - 1, MAP_H - 1], (x, y) => set(x, y, rng() < 0.3 ? "grass2" : "grass"));

  // 2. Haunted grove + the darkened land around the sanctum.
  each([21, 2, 44, 27], (x, y) => {
    if (y >= 25 && rng() < (y - 24) / 4) return; // dithered southern edge
    set(x, y, rng() < 0.3 ? "darkgrass2" : "darkgrass");
    const n = fine(x, y);
    if (n > 0.72) set(x, y, "deadtree");
    else if (n > 0.62) set(x, y, "darktall");
  });

  // 3. Whispering Woods (north-west) and the south-west thicket.
  const forest = (r, density) =>
    each(r, (x, y) => {
      const n = noise(x, y) * 0.7 + fine(x, y) * 0.3;
      if (n > density) set(x, y, "tree");
      else if (n > density - 0.1) set(x, y, "tallgrass");
    });
  forest([2, 2, 20, 27], 0.46);
  forest([2, 45, 14, 53], 0.5);

  // 4. Mirror Lake with its island.
  each([2, 28, 21, 45], (x, y) => {
    const wobble = (fine(x, y) - 0.5) * 1.6;
    if (inEllipse(x, y, 12, 36, 8.5 + wobble, 6.5 + wobble)) set(x, y, "water");
  });
  each([7, 33, 13, 39], (x, y) => inEllipse(x, y, 10, 36.5, 2.7, 2.3) && set(x, y, "grass"));

  // 5. Meadow scatter.
  each([21, 28, 44, 44], (x, y) => {
    const r = rng();
    if (r < 0.05) set(x, y, "flowers");
    else if (r < 0.07) set(x, y, "bush");
    else if (r < 0.08) set(x, y, "rock");
    else if (noise(x, y) > 0.72) set(x, y, "tallgrass");
  });

  // 6. Eastern Wilds: heavy tall grass and boulders.
  each([45, 28, 61, 53], (x, y) => {
    const r = rng();
    if (noise(x, y) < 0.42) set(x, y, "tallgrass");
    if (r < 0.035) set(x, y, "rock");
    else if (r < 0.06) set(x, y, "flowers");
  });

  // 7. Southern Hedges: bush rows with gaps, flowers everywhere.
  each([15, 45, 44, 53], (x, y) => {
    if (rng() < 0.08) set(x, y, "flowers");
    if ((y === 46 || y === 53) && x % 7 !== 3) set(x, y, "bush");
  });

  // 8. Mossback Ruins + Golem arena.
  each([43, 17, 61, 27], (x, y) => rng() < 0.18 && set(x, y, "floor"));
  for (let i = 0; i < 9; i++) {
    const x = 44 + Math.floor(rng() * 16);
    const y = 18 + Math.floor(rng() * 9);
    const horizontal = rng() < 0.5;
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) set(horizontal ? x + k : x, horizontal ? y : y + k, "wall");
  }
  fill([45, 3, 60, 16], "wall");
  fill([46, 4, 59, 15], "floor");
  for (const [x, y] of [[48, 6], [57, 6], [48, 13], [57, 13]]) set(x, y, "pillar");
  set(51, 16, "floor");
  set(52, 16, "floor");

  // 9. Sanctum of the Hollow King.
  fill([23, 2, 42, 15], "wall");
  fill([24, 3, 41, 14], "darkfloor");
  each([24, 3, 41, 14], (x, y) => {
    const d = Math.hypot(x + 0.5 - 33, y + 0.5 - 8.5);
    if (d > 4.3 && d < 5.3) set(x, y, "rune");
  });
  for (const [x, y] of [[26, 5], [39, 5], [26, 12], [39, 12]]) set(x, y, "pillar");
  set(32, 15, "gate");
  set(33, 15, "gate");

  // 10. Roads (2 tiles wide) and the shrine plaza.
  fill([32, 16, 33, 32], "path"); // north to the sanctum gate
  fill([21, 35, 29, 36], "path"); // west to the bridge
  fill([36, 35, 50, 36], "path"); // east
  fill([51, 17, 52, 36], "path"); // north-east to the golem arena
  fill([32, 39, 33, 47], "path"); // south
  fill([30, 33, 35, 38], "floor");
  set(32, 35, "shrine");
  for (const [x, y] of [[30, 33], [35, 33], [30, 38], [35, 38]]) set(x, y, "pillar");
  for (let x = 13; x <= 22; x++) {
    for (const y of [35, 36]) set(x, y, get(x, y) === "water" ? "bridge" : "path");
  }
  // Trail into the woods to the hidden chest clearing.
  fill([14, 23, 21, 24], "path");
  fill([14, 12, 15, 24], "path");
  fill([8, 11, 15, 12], "path");
  each([5, 6, 11, 11], (x, y) => get(x, y) === "tree" && set(x, y, "grass"));

  // 11. Chest nooks.
  each([30, 48, 35, 52], (x, y) => set(x, y, "grass"));
  for (const [x, y] of [[30, 49], [30, 50], [30, 51], [31, 48], [34, 48], [35, 49], [35, 50], [35, 51], [31, 52], [32, 52], [33, 52], [34, 52]])
    set(x, y, "bush");
  for (const [x, y] of [[55, 44], [57, 44], [55, 46], [56, 46], [57, 46], [55, 45]]) set(x, y, "bush");
  set(57, 45, "grass");

  // 12. Expansion: ridges between regions, with passes.
  const ridge = (r, tiles, passes) =>
    each(r, (x, y) => {
      if (passes.some(([px0, py0, px1, py1]) => x >= px0 && x <= px1 && y >= py0 && y <= py1)) return;
      set(x, y, tiles[(x + y) % tiles.length]);
    });
  // east: heartland | Ashen Wastes and Starfall Crater
  ridge([62, 0, 65, 55], ["tree", "obsidian"], [[62, 18, 65, 19], [62, 35, 65, 36]]);
  // south: heartland | Frostmere
  ridge([0, 54, 63, 57], ["tree", "pine"], [[10, 54, 11, 57], [44, 54, 45, 57]]);
  // Ashen Wastes | Starfall Crater
  ridge([66, 42, 103, 45], ["obsidian", "obsidian", "cactus"], [[80, 42, 81, 45], [96, 42, 97, 45]]);
  // Frostmere | Starfall Crater
  ridge([62, 56, 65, 87], ["pine", "obsidian"], [[62, 72, 65, 73]]);

  // 13. Ashen Wastes: dunes of sand and ash, cacti, lava pools.
  each([66, 0, 103, 41], (x, y) => {
    const n = noise(x, y);
    const f = fine(x, y);
    set(x, y, n > 0.58 ? "ash" : rng() < 0.3 ? "sand2" : "sand");
    if (n > 0.74 && f > 0.45) set(x, y, "lava");
    else if (n > 0.7) set(x, y, "obsidian");
    else if (rng() < 0.035) set(x, y, "cactus");
  });
  // Cinder Forge (Pyre Colossus arena)
  fill([86, 3, 100, 16], "wall");
  fill([87, 4, 99, 15], "darkfloor");
  for (const [x, y] of [[89, 6], [97, 6], [89, 13], [97, 13]]) set(x, y, "lava");
  set(92, 16, "darkfloor");
  set(93, 16, "darkfloor");
  // Eclipse field: open ground where the blood-moon Titan descends.
  each([72, 20, 88, 34], (x, y) => inEllipse(x, y, 80.5, 27.5, 8, 7) && set(x, y, "sand"));

  // 14. Frostmere: snowfields, pine woods and a frozen lake.
  each([0, 58, 61, 87], (x, y) => {
    const n = noise(x, y) * 0.7 + fine(x, y) * 0.3;
    set(x, y, rng() < 0.3 ? "snow2" : "snow");
    if (n > 0.6) set(x, y, "pine");
  });
  each([20, 64, 42, 80], (x, y) => {
    const wobble = (fine(x, y) - 0.5) * 1.4;
    if (inEllipse(x, y, 31, 72, 10 + wobble, 6 + wobble)) set(x, y, "ice");
  });
  // Rime Hollow (Rime Witch arena)
  fill([4, 66, 19, 80], "wall");
  fill([5, 67, 18, 79], "ice");
  for (const [x, y] of [[7, 69], [16, 69], [7, 77], [16, 77]]) set(x, y, "pillar");
  set(11, 66, "ice");
  set(12, 66, "ice");

  // 15. Starfall Crater: scorched ground, an obsidian rim, the Altar of Binding.
  each([66, 46, 103, 87], (x, y) => {
    set(x, y, rng() < 0.3 ? "darkgrass2" : noise(x, y) > 0.55 ? "ash" : "darkgrass");
    if (fine(x, y) > 0.78) set(x, y, "deadtree");
    else if (rng() < 0.02) set(x, y, "obsidian");
  });
  each([70, 52, 98, 80], (x, y) => {
    const d = Math.hypot(x + 0.5 - 84.5, y + 0.5 - 66.5);
    if (d < 11.5) set(x, y, "darkfloor");
    if (d >= 11.5 && d < 13 && Math.abs(y + 0.5 - 66.5) > 2 && Math.abs(x + 0.5 - 84.5) > 2) set(x, y, "obsidian");
    if (d > 7.3 && d < 8.3) set(x, y, "rune");
  });
  fill([83, 67, 85, 69], "altar");

  // 16. Expansion roads.
  fill([53, 35, 93, 36], "path"); // east through the pass into the wastes
  fill([92, 17, 93, 36], "path"); // north to the Cinder Forge
  fill([80, 37, 81, 52], "path"); // south through the rim to the crater
  fill([44, 37, 45, 64], "path"); // south through the pass into Frostmere
  fill([11, 63, 45, 64], "path"); // west to Rime Hollow
  fill([11, 63, 12, 65], "path");
  fill([46, 72, 71, 73], "path"); // east through the pass to the crater
  fill([44, 64, 45, 73], "path");

  // 17. Tree border, a little ragged.
  each([0, 0, MAP_W - 1, MAP_H - 1], (x, y) => {
    const d = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const frozen = y >= 56 && x < 64;
    if (d < 2 || (d < 3 && fine(x, y) > 0.55)) set(x, y, get(x, y) === "water" ? "water" : x >= 64 ? "obsidian" : frozen ? "pine" : "tree");
  });

  // 18. Keep landmarks walkable.
  for (const c of CHESTS) {
    const t = get(c.x, c.y);
    if (SOLID.has(TILE[t]) || t === "water") set(c.x, c.y, c.x >= 64 ? "ash" : c.y >= 56 ? "snow" : "grass");
  }
  each([29, 37, 36, 41], (x, y) => ["bush", "rock", "tallgrass"].includes(get(x, y)) && set(x, y, "grass"));

  // ---- Autotile into ids.
  const ids = grid.map((row, y) =>
    row.map((t, x) => {
      if (t === "water") {
        const land = (nx, ny) => !["water", "bridge"].includes(get(nx, ny));
        return WATER_BASE + mask(x, y, land);
      }
      if (t === "path") return PATH_BASE + mask(x, y, (nx, ny) => !PATHLIKE.has(get(nx, ny)));
      return TILE[t];
    }),
  );
  function mask(x, y, differs) {
    return (differs(x, y - 1) ? EDGE.N : 0) | (differs(x + 1, y) ? EDGE.E : 0) | (differs(x, y + 1) ? EDGE.S : 0) | (differs(x - 1, y) ? EDGE.W : 0);
  }

  const walkable = (x, y) => inMap(x, y) && !SOLID.has(ids[y][x]);
  const start = { x: 32.5, y: 40 };

  // Initial monster placements (the game re-rolls respawns from the same zones).
  const spawns = [];
  for (const zone of SPAWN_ZONES) {
    for (const [type, count] of Object.entries(zone.monsters)) {
      for (let i = 0, tries = 0; i < count && tries < 500; tries++) {
        const p = randomTileIn(zone.rect, rng);
        if (!walkable(p.x, p.y) || Math.hypot(p.x - start.x, p.y - start.y) < 7) continue;
        spawns.push({ type, zone: zone.id, x: p.x, y: p.y });
        i++;
      }
    }
  }

  return {
    width: MAP_W,
    height: MAP_H,
    grid,
    ids,
    start,
    shrine: { x: 32, y: 35 },
    chests: CHESTS,
    bosses: BOSSES,
    spawns,
    walkable,
  };
}

/** @param {number[]} rect [x0, y0, x1, y1] in tiles, inclusive */
export function randomTileIn([x0, y0, x1, y1], rand = Math.random) {
  return { x: x0 + Math.floor(rand() * (x1 - x0 + 1)), y: y0 + Math.floor(rand() * (y1 - y0 + 1)) };
}

export function regionAt(tx, ty) {
  return REGIONS.find(({ rect: [x0, y0, x1, y1] }) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1)?.name ?? "Wilderness";
}
