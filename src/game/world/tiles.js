// Tile ids shared by the asset generator (tools/gen-assets.js) and the game.
// Art is authored at 16px and upscaled x3, so one tile is 48px on screen.

export const ART_PX = 16;
export const ART_SCALE = 3;
export const TILE_SIZE = ART_PX * ART_SCALE;
export const TILESET_COLUMNS = 8;

export const BASE_TILES = [
  "grass",
  "grass2",
  "flowers",
  "tallgrass",
  "bush",
  "tree",
  "deadtree",
  "rock",
  "darkgrass",
  "darkgrass2",
  "darktall",
  "wall",
  "floor",
  "darkfloor",
  "rune",
  "pillar",
  "shrine",
  "gate",
  "gateopen",
  "bridge",
  // Ashen Wastes
  "sand",
  "sand2",
  "ash",
  "cactus",
  "lava",
  "obsidian",
  // Frostmere
  "snow",
  "snow2",
  "pine",
  "ice",
  // Starfall Crater
  "altar",
];

/** @type {Record<string, number>} */
export const TILE = Object.fromEntries(BASE_TILES.map((name, i) => [name, i]));

// Autotiled terrain: 16 variants each, indexed by a NESW bitmask of
// "neighbour is a different terrain" (N=1, E=2, S=4, W=8).
export const WATER_BASE = BASE_TILES.length;
export const PATH_BASE = WATER_BASE + 16;
export const TILE_COUNT = PATH_BASE + 16;

export const EDGE = Object.freeze({ N: 1, E: 2, S: 4, W: 8 });

export const SOLID_TILES = [
  TILE.bush,
  TILE.tree,
  TILE.deadtree,
  TILE.rock,
  TILE.wall,
  TILE.pillar,
  TILE.gate,
  TILE.cactus,
  TILE.lava,
  TILE.obsidian,
  TILE.pine,
  ...Array.from({ length: 16 }, (_, i) => WATER_BASE + i),
];

/** Tiles the sword can cut, mapped to what they leave behind. */
export const CUTTABLE = Object.freeze({
  [TILE.tallgrass]: TILE.grass2,
  [TILE.bush]: TILE.grass2,
  [TILE.darktall]: TILE.darkgrass2,
  [TILE.cactus]: TILE.sand2,
});

export const isWaterId = (id) => id >= WATER_BASE && id < WATER_BASE + 16;
