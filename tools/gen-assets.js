// Procedural Zelda-style pixel art: tileset, monsters, bosses, items and FX.
//
//   bun tools/gen-assets.js            -> public/assets/generated/*.png
//   bun tools/gen-assets.js --preview out.png   also renders the world map
//
// Everything is drawn at 16px-per-tile "art" resolution from shape masks with
// automatic top-light / bottom-dark shading and outlines, then upscaled x3.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { encodePNG } from "./png.js";
import {
  ART_SCALE,
  BASE_TILES,
  EDGE,
  PATH_BASE,
  TILE_COUNT,
  TILESET_COLUMNS,
  WATER_BASE,
} from "../src/game/world/tiles.js";
import { SPRITE_DEFS } from "../src/game/assets/sprite-defs.js";

const OUT = join(import.meta.dir, "..", "public", "assets", "generated");

// ---------------------------------------------------------------- helpers

const hex = (s, a = 255) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
  a,
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  alpha(x, y) {
    return this.inside(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
  }
  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!c || !this.inside(x, y)) return this;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1 || this.d[i + 3] === 0) {
      this.d.set(c, i);
      return this;
    }
    for (let k = 0; k < 3; k++) this.d[i + k] = c[k] * a + this.d[i + k] * (1 - a);
    this.d[i + 3] = Math.max(this.d[i + 3], c[3]);
    return this;
  }
  fill(c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
    return this;
  }
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        if (src.d[i + 3]) this.set(dx + x, dy + y, src.d.subarray(i, i + 4));
      }
    return this;
  }
  clone() {
    const c = new Img(this.w, this.h);
    c.d.set(this.d);
    return c;
  }
  scaled(n) {
    const out = new Img(this.w * n, this.h * n);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const i = (Math.floor(y / n) * this.w + Math.floor(x / n)) * 4;
        out.d.set(this.d.subarray(i, i + 4), (y * out.w + x) * 4);
      }
    return out;
  }
  flipX() {
    const out = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        out.d.set(this.d.subarray(i, i + 4), (y * this.w + (this.w - 1 - x)) * 4);
      }
    return out;
  }
}

// Shape masks: (x, y) => boolean, sampled at pixel centres.
const ell = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const box = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const tri = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const px = x + 0.5;
  const py = y + 0.5;
  const s = (p1x, p1y, p2x, p2y) => (px - p2x) * (p1y - p2y) - (p1x - p2x) * (py - p2y);
  const d1 = s(ax, ay, bx, by);
  const d2 = s(bx, by, cx, cy);
  const d3 = s(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const or = (...fs) => (x, y) => fs.some((f) => f(x, y));
const and = (...fs) => (x, y) => fs.every((f) => f(x, y));
const not = (f) => (x, y) => !f(x, y);

/**
 * Fill a mask with base colour, lighter top-left rim and darker bottom-right rim.
 * @param {Img} img
 * @param {(x: number, y: number) => boolean} mask
 * @param {{ base: number[], light?: number[], dark?: number[], hi?: number[] }} colors
 */
function shade(img, mask, { base, light, dark, hi }) {
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (!mask(x, y)) continue;
      let c = base;
      if (dark && (!mask(x, y + 1) || !mask(x + 1, y))) c = dark;
      if (light && (!mask(x, y - 1) || !mask(x - 1, y))) c = light;
      if (hi && !mask(x, y - 1) && !mask(x - 1, y)) c = hi;
      img.set(x, y, c);
    }
  return img;
}

function outline(img, color, diagonal = false) {
  const src = img.clone();
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (src.alpha(x, y)) continue;
      let n = src.alpha(x - 1, y) || src.alpha(x + 1, y) || src.alpha(x, y - 1) || src.alpha(x, y + 1);
      if (diagonal)
        n ||= src.alpha(x - 1, y - 1) || src.alpha(x + 1, y - 1) || src.alpha(x - 1, y + 1) || src.alpha(x + 1, y + 1);
      if (n) img.set(x, y, color);
    }
  return img;
}

const pts = (img, list, c) => list.forEach(([x, y]) => img.set(x, y, c));

// ---------------------------------------------------------------- palettes

const PAL = {
  grass: { base: hex("#4f9a45"), dark: hex("#3b7d39"), light: hex("#6db654"), tuft: hex("#2f6a31") },
  dark: { base: hex("#3d5a4a"), dark: hex("#2c4438"), light: hex("#557661"), tuft: hex("#223529") },
  leaf: { base: hex("#4e9c3e"), light: hex("#7cc65a"), dark: hex("#33702f"), line: hex("#1a3d1b") },
  canopy: { base: hex("#2e7a3c"), light: hex("#4f9e48"), dark: hex("#1f5a2e"), hi: hex("#76be5c"), line: hex("#0f2c19") },
  bark: { base: hex("#6c4a2c"), light: hex("#8a6038"), dark: hex("#4a321d") },
  stone: { base: hex("#8d909b"), light: hex("#b6b9c3"), dark: hex("#5d606c"), line: hex("#262731") },
  dirt: { base: hex("#c7a26b"), dark: hex("#a8834f"), light: hex("#dcc190") },
  water: { base: hex("#3a78c2"), dark: hex("#2f65ab"), light: hex("#8cc2f2"), sand: hex("#d8c78f"), sandDark: hex("#b49f68"), foam: hex("#e3f2ff") },
};

// ---------------------------------------------------------------- tiles

function groundTile(seed, pal, { tufts = 3, specks = 14 } = {}) {
  const t = new Img(16, 16).fill(pal.base);
  const r = rng(seed);
  for (let i = 0; i < specks; i++) t.set(r() * 16, r() * 16, pal.dark);
  for (let i = 0; i < specks / 2; i++) t.set(r() * 16, r() * 16, pal.light);
  for (let i = 0; i < tufts; i++) {
    const x = 2 + Math.floor(r() * 12);
    const y = 3 + Math.floor(r() * 11);
    pts(t, [[x - 1, y - 1], [x, y], [x + 1, y - 1]], pal.tuft);
    t.set(x, y - 1, pal.light);
  }
  return t;
}

function grassClump(seed, pal, bg) {
  const r = rng(seed);
  const layer = new Img(16, 16);
  const blades = [];
  for (let i = 0; i < 6; i++) {
    const bx = 1 + i * 2.7;
    blades.push(tri(bx - 1.6, 15.5, bx + 1.8, 15.5, bx + (r() - 0.5) * 4, 2 + r() * 4));
  }
  const mask = or(...blades, box(1, 11, 14, 15));
  shade(layer, mask, { base: pal.light, light: hex("#9edb72"), dark: pal.base });
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(r() * 12);
    const y = 8 + Math.floor(r() * 6);
    pts(layer, [[x, y], [x + 1, y + 1]], pal.dark);
  }
  outline(layer, pal.tuft);
  return bg.clone().blit(layer);
}

function bushTile(bg) {
  const l = new Img(16, 16);
  const mask = or(ell(8, 8.8, 6.6, 6), ell(4.4, 6.5, 3.2, 3.2), ell(11.6, 6.5, 3.2, 3.2), ell(8, 4.3, 3.8, 3.2), ell(4, 11, 3.2, 3.2), ell(12, 11, 3.2, 3.2));
  shade(l, mask, { base: PAL.leaf.base, light: PAL.leaf.light, dark: PAL.leaf.dark, hi: hex("#b3e58a") });
  const arcs = [[5, 7], [9, 5], [10, 10], [5, 11], [8, 8]];
  for (const [x, y] of arcs) pts(l, [[x, y], [x + 1, y + 1], [x + 2, y]], PAL.leaf.dark);
  outline(l, PAL.leaf.line);
  return bg.clone().blit(l);
}

function treeTile(bg) {
  const l = new Img(16, 16);
  shade(l, box(6, 11, 9, 15), PAL.bark);
  const canopy = or(ell(8, 6.6, 7.4, 5.8), ell(3.4, 8.4, 3.4, 3.2), ell(12.6, 8.4, 3.4, 3.2), ell(8, 3, 4.4, 3));
  shade(l, canopy, PAL.canopy);
  const arcs = [[4, 5], [9, 3], [11, 7], [6, 9], [2, 8]];
  for (const [x, y] of arcs) pts(l, [[x, y], [x + 1, y - 1], [x + 2, y - 1], [x + 3, y]], PAL.canopy.dark);
  pts(l, [[5, 3], [6, 2], [4, 4]], PAL.canopy.hi);
  outline(l, PAL.canopy.line);
  return bg.clone().blit(l);
}

function deadTreeTile(bg) {
  const l = new Img(16, 16);
  const bark = { base: hex("#5d5049"), light: hex("#7c6c61"), dark: hex("#3b312b") };
  const branches = or(
    box(7, 5, 8, 15),
    box(6, 14, 9, 15),
    tri(7, 9, 7.8, 8, 2.5, 3.5),
    tri(8.5, 8, 9, 7, 13.5, 2.5),
    tri(8.5, 11, 9, 10.2, 13.5, 8.5),
    tri(7, 5.5, 8, 5.5, 6, 1.5),
  );
  shade(l, branches, bark);
  outline(l, hex("#161211"));
  return bg.clone().blit(l);
}

function rockTile(bg) {
  const l = new Img(16, 16);
  shade(l, or(ell(8, 9.4, 6.6, 5.2), ell(7, 7.6, 5, 4.4)), { ...PAL.stone, hi: hex("#dadce3") });
  pts(l, [[9, 7], [10, 8], [10, 9], [11, 10]], PAL.stone.dark);
  outline(l, PAL.stone.line);
  return bg.clone().blit(l);
}

function flowerTile(bg, seed) {
  const t = bg.clone();
  const r = rng(seed);
  const colors = [hex("#f4f1e6"), hex("#f6d95a"), hex("#f28bb3"), hex("#9fc3ff")];
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(r() * 12);
    const y = 2 + Math.floor(r() * 12);
    const c = colors[Math.floor(r() * colors.length)];
    pts(t, [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], c);
    t.set(x, y, hex("#e8a93a"));
    t.set(x, y + 2, PAL.grass.tuft);
  }
  return t;
}

function wallTile() {
  const t = new Img(16, 16).fill(hex("#474b58"));
  const r = rng(77);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let bx = -8; bx < 16; bx += 8) {
      const x0 = bx + off;
      for (let y = row * 4; y < row * 4 + 3; y++)
        for (let x = x0; x < x0 + 7; x++) {
          let c = hex("#7b8190");
          if (y === row * 4) c = hex("#a1a7b5");
          else if (y === row * 4 + 2 || x === x0 + 6) c = hex("#5e6371");
          t.set(x, y, c);
        }
    }
  }
  for (let i = 0; i < 6; i++) t.set(r() * 16, r() * 16, hex("#4f7a3a"));
  return t;
}

function floorTile({ base, seam, light }, seed) {
  const t = new Img(16, 16).fill(base);
  const r = rng(seed);
  for (let i = 0; i < 16; i++) {
    t.set(i, 0, seam);
    t.set(0, i, seam);
    t.set(i, 8, seam);
    t.set(8, i, seam);
  }
  for (const [x0, y0] of [[1, 1], [9, 1], [1, 9], [9, 9]]) {
    for (let i = 0; i < 6; i++) {
      t.set(x0 + i, y0, light);
      t.set(x0, y0 + i, light);
    }
  }
  for (let i = 0; i < 6; i++) t.set(r() * 16, r() * 16, seam);
  return t;
}

const FLOOR = { base: hex("#a59c89"), seam: hex("#7c7465"), light: hex("#bfb6a2") };
const DARK_FLOOR = { base: hex("#3b3550"), seam: hex("#26213a"), light: hex("#4e4768") };

function runeTile() {
  const t = floorTile(DARK_FLOOR, 5);
  const ring = and(ell(8, 8, 6, 6), not(ell(8, 8, 4.8, 4.8)));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ring(x, y)) t.set(x, y, hex("#8a4fe0"));
  pts(t, [[8, 5], [8, 6], [7, 7], [9, 7], [8, 8], [8, 9], [7, 10], [9, 10]], hex("#d9b8ff"));
  return t;
}

function pillarTile() {
  const t = floorTile(FLOOR, 9);
  const l = new Img(16, 16);
  shade(l, box(4, 7, 11, 14), { base: hex("#9d9585"), light: hex("#b9b09d"), dark: hex("#6d6657") });
  shade(l, ell(8, 6.5, 5, 4.2), { base: hex("#cfc6b1"), light: hex("#e7dfcb"), dark: hex("#9d9585") });
  pts(l, [[6, 6], [7, 5], [8, 5]], hex("#f5efe0"));
  outline(l, hex("#2f2b24"));
  return t.blit(l);
}

function shrineTile() {
  const t = floorTile(FLOOR, 13);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (ell(8, 8, 7, 7)(x, y)) t.set(x, y, hex("#9fe8ff", 70));
  const l = new Img(16, 16);
  shade(l, box(4, 12, 11, 14), { base: hex("#8d8573"), light: hex("#b4ab97"), dark: hex("#5f5949") });
  const crystal = or(tri(8, 1, 12.5, 7.5, 3.5, 7.5), tri(3.5, 7.5, 12.5, 7.5, 8, 12.5));
  shade(l, crystal, { base: hex("#5fd4ff"), light: hex("#c8f4ff"), dark: hex("#2a8ab8"), hi: hex("#ffffff") });
  outline(l, hex("#0f3a52"));
  return t.blit(l);
}

function gateTile(open) {
  const t = floorTile(DARK_FLOOR, 21);
  if (open) {
    for (let x = 0; x < 16; x++) {
      t.set(x, 0, hex("#5a5178"));
      t.set(x, 15, hex("#5a5178"));
    }
    return t;
  }
  for (let x = 0; x < 16; x++) {
    for (const y of [1, 2, 13, 14]) t.set(x, y, hex("#2a2338"));
    t.set(x, 1, hex("#4a4063"));
  }
  for (const bx of [1, 5, 9, 13]) {
    for (let y = 3; y < 13; y++) {
      t.set(bx, y, hex("#b98cff"));
      t.set(bx + 1, y, hex("#7a3fd6"));
    }
    t.set(bx, 3 + (bx % 7), hex("#ffffff"));
  }
  return t;
}

function bridgeTile() {
  const t = new Img(16, 16).fill(hex("#8b5a2e"));
  for (let x = 0; x < 16; x++) {
    if (x % 4 === 3) for (let y = 2; y < 14; y++) t.set(x, y, hex("#4d2f16"));
    if (x % 4 === 0) for (let y = 2; y < 14; y++) t.set(x, y, hex("#a8723f"));
    for (const y of [0, 1, 14, 15]) t.set(x, y, hex("#5a3818"));
    t.set(x, 0, hex("#7a5028"));
    t.set(x, 14, hex("#7a5028"));
  }
  for (const x of [3, 11]) {
    t.set(x, 1, hex("#c9b48a"));
    t.set(x, 15, hex("#c9b48a"));
  }
  return t;
}

function waterTile(mask) {
  const W = PAL.water;
  const t = new Img(16, 16).fill(W.base);
  const r = rng(404);
  for (let i = 0; i < 10; i++) t.set(r() * 16, r() * 16, W.dark);
  for (const [x, y] of [[2, 4], [9, 9], [4, 13], [11, 3]]) pts(t, [[x, y], [x + 1, y - 1], [x + 2, y - 1], [x + 3, y]], W.light);
  // Shoreline: sand rim, dark lip, then broken foam, on each land-facing side.
  const edge = (fn) => {
    for (let i = 0; i < 16; i++) {
      fn(i, 0, W.sandDark);
      fn(i, 1, W.sand);
      if ((i * 7) % 5 < 3) fn(i, 2, W.foam);
    }
  };
  if (mask & EDGE.N) edge((i, d, c) => t.set(i, d, c));
  if (mask & EDGE.S) edge((i, d, c) => t.set(i, 15 - d, c));
  if (mask & EDGE.W) edge((i, d, c) => t.set(d, i, c));
  if (mask & EDGE.E) edge((i, d, c) => t.set(15 - d, i, c));
  return t;
}

function pathTile(mask) {
  const D = PAL.dirt;
  const G = PAL.grass;
  const t = new Img(16, 16).fill(D.base);
  const r = rng(99);
  for (let i = 0; i < 12; i++) t.set(r() * 16, r() * 16, D.dark);
  for (let i = 0; i < 6; i++) t.set(r() * 16, r() * 16, D.light);
  pts(t, [[4, 5], [5, 5], [11, 11], [12, 11]], hex("#9c9486"));
  // Grass fringe eating into the dirt with a jagged 1-3px edge and a dark lip.
  const depth = (i) => 1 + ((i * 5 + 3) % 7 < 3 ? 1 : 0) + (i % 5 === 0 ? 1 : 0);
  /** @type {[number, (i: number, k: number) => [number, number]][]} */
  const sides = [
    [EDGE.N, (i, k) => [i, k]],
    [EDGE.S, (i, k) => [i, 15 - k]],
    [EDGE.W, (i, k) => [k, i]],
    [EDGE.E, (i, k) => [15 - k, i]],
  ];
  for (const [bit, at] of sides) {
    if (!(mask & bit)) continue;
    for (let i = 0; i < 16; i++) {
      const d = depth(i);
      for (let k = 0; k < d; k++) t.set(...at(i, k), k === d - 1 && i % 3 === 0 ? G.light : G.base);
      t.set(...at(i, d), D.dark);
    }
  }
  return t;
}

// ---------------------------------------------------------------- expansion terrain

const SAND = { base: hex("#d6b27a"), dark: hex("#bf975c"), light: hex("#ead096"), tuft: hex("#a8834f") };
const ASH = { base: hex("#5c5452"), dark: hex("#48403f"), light: hex("#736a67"), tuft: hex("#3a3432") };
const SNOW = { base: hex("#e6edf5"), dark: hex("#c9d4e2"), light: hex("#ffffff"), tuft: hex("#b2c0d4") };

function cactusTile(bg) {
  const l = new Img(16, 16);
  const green = { base: hex("#4f8f4a"), light: hex("#7cc06a"), dark: hex("#2f5f30") };
  shade(l, or(box(6, 2, 9, 15), ell(7.5, 2.5, 2, 1.6), box(2, 6, 3, 10), box(2, 10, 6, 11), box(12, 4, 13, 9), box(9, 9, 13, 10)), green);
  pts(l, [[5, 4], [10, 6], [5, 9], [10, 12], [1, 7], [14, 5]], hex("#f2ecd0"));
  outline(l, hex("#173017"));
  return bg.clone().blit(l);
}

function lavaTile() {
  const t = new Img(16, 16).fill(hex("#c2410c"));
  const r = rng(707);
  for (let i = 0; i < 5; i++) {
    const cx = r() * 16;
    const cy = r() * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ell(cx, cy, 2.6, 1.8)(x, y)) t.set(x, y, hex("#ff8a1f"));
    t.set(cx, cy, hex("#ffd24a"));
  }
  for (let i = 0; i < 7; i++) t.set(r() * 16, r() * 16, hex("#5a1a08"));
  return t;
}

function obsidianTile(bg) {
  const l = new Img(16, 16);
  shade(l, or(tri(3, 14, 8, 2, 13, 14), tri(8, 14, 12, 5, 15, 14)), { base: hex("#2b2233"), light: hex("#5a4a70"), dark: hex("#16111c"), hi: hex("#9a86c0") });
  pts(l, [[8, 5], [7, 7], [12, 8]], hex("#9a86c0"));
  outline(l, hex("#0a070d"));
  return bg.clone().blit(l);
}

function pineTile(bg) {
  const l = new Img(16, 16);
  shade(l, box(7, 12, 8, 15), PAL.bark);
  const needles = { base: hex("#245a3e"), light: hex("#3c7d56"), dark: hex("#153826") };
  shade(l, or(tri(8, 0.5, 3, 7, 13, 7), tri(8, 3.5, 2, 10.5, 14, 10.5), tri(8, 6.5, 1, 13.5, 15, 13.5)), needles);
  for (const [x, y] of [[8, 1], [7, 2], [5, 6], [6, 6], [10, 6], [4, 10], [11, 10], [3, 13], [12, 13], [8, 4]]) l.set(x, y, hex("#ffffff"));
  outline(l, hex("#0c2016"));
  return bg.clone().blit(l);
}

function iceTile() {
  const t = new Img(16, 16).fill(hex("#a8d8f0"));
  for (const [x, y, len] of [[2, 3, 5], [9, 7, 4], [4, 12, 6]]) for (let i = 0; i < len; i++) t.set(x + i, y - Math.floor(i / 2), hex("#e6f7ff"));
  pts(t, [[11, 2], [12, 3], [12, 4], [13, 5], [6, 9], [7, 10]], hex("#7ab4d6"));
  return t;
}

function altarTile() {
  const t = floorTile(DARK_FLOOR, 31);
  const ring = and(ell(8, 8, 7.4, 7.4), not(ell(8, 8, 6.2, 6.2)));
  const inner = and(ell(8, 8, 3.6, 3.6), not(ell(8, 8, 2.6, 2.6)));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (ring(x, y)) t.set(x, y, hex("#e0b33c"));
      if (inner(x, y)) t.set(x, y, hex("#ff4d6d"));
    }
  pts(t, [[8, 1], [8, 14], [1, 8], [14, 8], [8, 7], [8, 8], [7, 8], [9, 8]], hex("#fff3b0"));
  return t;
}

function buildTiles() {
  const grass = groundTile(1, PAL.grass);
  const grass2 = groundTile(2, PAL.grass, { tufts: 5, specks: 18 });
  const dark = groundTile(3, PAL.dark);
  const dark2 = groundTile(4, PAL.dark, { tufts: 5, specks: 18 });
  const byName = {
    grass,
    grass2,
    flowers: flowerTile(grass, 11),
    tallgrass: grassClump(5, PAL.grass, grass),
    bush: bushTile(grass),
    tree: treeTile(grass),
    deadtree: deadTreeTile(dark),
    rock: rockTile(grass),
    darkgrass: dark,
    darkgrass2: dark2,
    darktall: grassClump(6, { ...PAL.dark, light: hex("#6a8f73") }, dark),
    wall: wallTile(),
    floor: floorTile(FLOOR, 7),
    darkfloor: floorTile(DARK_FLOOR, 8),
    rune: runeTile(),
    pillar: pillarTile(),
    shrine: shrineTile(),
    gate: gateTile(false),
    gateopen: gateTile(true),
    bridge: bridgeTile(),
    sand: groundTile(41, SAND, { tufts: 2, specks: 16 }),
    sand2: groundTile(42, SAND, { tufts: 4, specks: 20 }),
    ash: groundTile(43, ASH, { tufts: 2, specks: 18 }),
    cactus: cactusTile(groundTile(41, SAND, { tufts: 2, specks: 16 })),
    lava: lavaTile(),
    obsidian: obsidianTile(groundTile(43, ASH, { tufts: 2, specks: 18 })),
    snow: groundTile(44, SNOW, { tufts: 2, specks: 14 }),
    snow2: groundTile(45, SNOW, { tufts: 4, specks: 18 }),
    pine: pineTile(groundTile(44, SNOW, { tufts: 2, specks: 14 })),
    ice: iceTile(),
    altar: altarTile(),
  };
  const tiles = BASE_TILES.map((n) => byName[n]);
  for (let m = 0; m < 16; m++) tiles[WATER_BASE + m] = waterTile(m);
  for (let m = 0; m < 16; m++) tiles[PATH_BASE + m] = pathTile(m);

  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const sheet = new Img(TILESET_COLUMNS * 16, rows * 16);
  tiles.forEach((t, i) => sheet.blit(t, (i % TILESET_COLUMNS) * 16, Math.floor(i / TILESET_COLUMNS) * 16));
  return { sheet, tiles };
}

// ---------------------------------------------------------------- sprites

function slime(frame, pal) {
  const l = new Img(16, 16);
  const squash = frame === 1;
  const cy = squash ? 10.2 : 9.4;
  const body = and(ell(8, cy, squash ? 6.8 : 5.8, squash ? 4.6 : 5.6), box(0, 0, 15, 14));
  shade(l, body, { base: pal.base, light: pal.light, dark: pal.dark });
  const ey = Math.round(cy) - 1;
  pts(l, [[6, ey], [9, ey]], hex("#10200c"));
  pts(l, [[6, ey - 1], [9, ey - 1]], hex("#ffffff"));
  pts(l, [[4, ey - 2], [5, ey - 3]], hex("#ffffff", 200));
  outline(l, pal.line);
  return l;
}

function bat(frame) {
  const l = new Img(16, 16);
  const wing = { base: hex("#3d2a58"), light: hex("#5a3f7a"), dark: hex("#2a1c40") };
  const wings =
    frame === 0
      ? or(tri(6, 8, 1, 2.5, 2, 9), tri(6, 9, 2, 9, 3.5, 6), tri(10, 8, 15, 2.5, 14, 9), tri(10, 9, 14, 9, 12.5, 6))
      : or(tri(6, 7.5, 0.5, 12.5, 4, 12), tri(6, 9, 4, 12, 6, 11), tri(10, 7.5, 15.5, 12.5, 12, 12), tri(10, 9, 12, 12, 10, 11));
  shade(l, wings, wing);
  const body = or(ell(8, 9, 3, 3.2), tri(5.5, 7, 6.5, 3.5, 7.5, 7), tri(8.5, 7, 9.5, 3.5, 10.5, 7));
  shade(l, body, { base: hex("#5a3f7a"), light: hex("#8a6bb0"), dark: hex("#3a2854") });
  pts(l, [[7, 9], [9, 9]], hex("#ff3355"));
  pts(l, [[7, 11], [9, 11]], hex("#ffffff"));
  outline(l, hex("#140c1e"));
  return l;
}

function skeleton(frame) {
  const l = new Img(16, 16);
  const bone = { base: hex("#e3dfcf"), light: hex("#fbf8ec"), dark: hex("#aaa48f") };
  const step = frame === 1;
  const body = or(
    ell(8, 4.6, 3.6, 3.3),
    box(6, 7, 9, 7),
    box(7, 8, 8, 8),
    box(5, 9, 10, 11),
    box(6, 12, 9, 12),
    box(step ? 5 : 6, 13, step ? 6 : 6, 15),
    box(step ? 10 : 9, 13, step ? 10 : 9, 15),
    box(3, 9, 4, step ? 12 : 11),
    box(11, 9, 12, step ? 11 : 12),
  );
  shade(l, body, bone);
  for (const y of [9, 11]) for (let x = 6; x <= 9; x++) l.set(x, y, bone.dark);
  pts(l, [[6, 4], [9, 4], [6, 5], [9, 5]], hex("#1b1b22"));
  pts(l, [[6, 4], [9, 4]], hex("#ff5a3c"));
  pts(l, [[7, 7], [8, 7]], hex("#1b1b22"));
  // rusty blade in the right hand
  for (let y = 4; y <= 11; y++) l.set(13, y, hex("#9b8b7a"));
  pts(l, [[13, 3], [12, 11], [14, 11]], hex("#c7b9a6"));
  outline(l, hex("#1b1b22"));
  return l;
}

const GOLEM_PAL = {
  stone: { base: hex("#7d8471"), light: hex("#a4ab96"), dark: hex("#545a4b"), hi: hex("#c6ccb8") },
  moss: { base: hex("#4f8a3c"), light: hex("#7cc35a"), dark: hex("#356a2c") },
  eye: hex("#ffd23c"),
  eyeHi: hex("#fff3b0"),
  core: { base: hex("#ff8a2a"), light: hex("#ffd27a"), dark: hex("#c24a12") },
  line: hex("#1a1f14"),
};
// Pyre Colossus: basalt body with lava instead of moss.
const PYRE_PAL = {
  stone: { base: hex("#4a3f3c"), light: hex("#6e605a"), dark: hex("#2e2624"), hi: hex("#8c7b72") },
  moss: { base: hex("#ff6a1a"), light: hex("#ffc04a"), dark: hex("#c2350c") },
  eye: hex("#ffe14a"),
  eyeHi: hex("#ffffff"),
  core: { base: hex("#ffd24a"), light: hex("#fff3b0"), dark: hex("#ff6a1a") },
  line: hex("#160c08"),
};

function golem(frame, pal = GOLEM_PAL) {
  const l = new Img(32, 32);
  const { stone, moss } = pal;
  const lift = frame === 1 ? 2 : 0;
  const legs = or(box(8, 25, 13, 30), box(18, 25, 23, 30));
  shade(l, legs, stone);
  const torso = or(ell(16, 18, 10.5, 9), box(8, 12, 23, 24));
  shade(l, torso, stone);
  const arms = or(ell(4.2, 18 - lift, 3.8, 7), ell(27.8, 18 - lift, 3.8, 7));
  shade(l, arms, stone);
  shade(l, or(box(2, 23 - lift, 6, 27 - lift), box(25, 23 - lift, 29, 27 - lift)), { ...stone, base: stone.dark });
  const head = ell(16, 7.5, 6.5, 5.5);
  shade(l, head, stone);
  const mossMask = or(and(head, box(0, 0, 31, 4)), and(torso, ell(10, 11, 5, 2.5)), and(torso, ell(22, 12, 4, 2)), and(arms, ell(4, 12 - lift, 3, 2)), and(arms, ell(28, 12 - lift, 3, 2)));
  shade(l, mossMask, moss);
  pts(l, [[12, 8], [13, 8], [18, 8], [19, 8]], pal.eye);
  pts(l, [[12, 7], [19, 7]], pal.eyeHi);
  const core = or(tri(16, 14, 19.5, 18, 12.5, 18), tri(12.5, 18, 19.5, 18, 16, 22));
  shade(l, core, pal.core);
  pts(l, [[11, 20], [12, 21], [20, 15], [21, 16], [14, 25], [18, 13]], stone.dark);
  outline(l, pal.line);
  return l;
}

const WRAITH_PAL = {
  cloth: { base: hex("#2f2146"), light: hex("#4a3470"), dark: hex("#1a1026") },
  eye: hex("#6ff5ff"),
  eyeLow: hex("#2aa6c4"),
  crown: { base: hex("#d9a93a"), light: hex("#ffe08a"), dark: hex("#8f6a1c") },
  gem: hex("#ff4d6d"),
  hands: { base: hex("#c9c3d9"), light: hex("#eeeaf7"), dark: hex("#8d86a3") },
  aura: hex("#9b5cff", 40),
  line: hex("#0b0612"),
};
// Rime Witch: frost-blue robes with a silver crown.
const RIME_PAL = {
  cloth: { base: hex("#3a6fa8"), light: hex("#7fb5ee"), dark: hex("#1f3f6a") },
  eye: hex("#ffffff"),
  eyeLow: hex("#9fe8ff"),
  crown: { base: hex("#c9d6e6"), light: hex("#ffffff"), dark: hex("#7a8aa0") },
  gem: hex("#6ff5ff"),
  hands: { base: hex("#dff2ff"), light: hex("#ffffff"), dark: hex("#9fc3e0") },
  aura: hex("#bfe8ff", 45),
  line: hex("#0a1a2e"),
};

function wraith(frame, pal = WRAITH_PAL) {
  const l = new Img(32, 32);
  const sway = frame === 1 ? 1 : 0;
  const hem = (x, y) => {
    const zig = ((x + sway * 2) % 4) < 2 ? 0 : 2;
    return y <= 27 + zig;
  };
  const robe = or(ell(16, 12, 9, 9), and(tri(16, 6, 3, 30, 29, 30), hem));
  shade(l, robe, pal.cloth);
  const sleeves = or(tri(8, 12, 2, 22 + sway, 9, 20), tri(24, 12, 30, 22 + sway, 23, 20));
  shade(l, sleeves, pal.cloth);
  const hood = ell(16, 11.5, 5, 5);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (hood(x, y)) l.set(x, y, hex("#07040c"));
  pts(l, [[14, 11], [18, 11]], pal.eye);
  pts(l, [[14, 12], [18, 12]], pal.eyeLow);
  const crown = or(box(10, 4, 21, 5), tri(10, 4.5, 11.5, 0.5, 13, 4.5), tri(14, 4.5, 15.5, 0, 17, 4.5), tri(19, 4.5, 20.5, 0.5, 22, 4.5));
  shade(l, crown, pal.crown);
  pts(l, [[15, 3], [16, 3]], pal.gem);
  const hands = or(ell(3.5, 22.5 + sway, 2, 2), ell(28.5, 22.5 + sway, 2, 2));
  shade(l, hands, pal.hands);
  outline(l, pal.line);
  // Soft aura (drawn after the outline so it stays translucent).
  const aura = new Img(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) if (!l.alpha(x, y) && ell(16, 16, 15.5, 15.5)(x, y) && (x + y + sway) % 3 === 0) aura.set(x, y, pal.aura);
  return aura.blit(l);
}

// ---------------------------------------------------------------- new monsters

function scorpion(frame) {
  const l = new Img(16, 16);
  const shell = { base: hex("#b0612e"), light: hex("#e08a4a"), dark: hex("#7a3c18") };
  const step = frame === 1;
  // legs
  for (const [x, y] of step ? [[3, 11], [5, 13], [11, 13], [13, 11]] : [[3, 12], [5, 12], [11, 12], [13, 12]]) l.set(x, y, shell.dark);
  const body = or(ell(8, 10.5, 4, 2.8), ell(8, 8, 2.5, 2));
  const tail = or(ell(8, 6, 1.4, 1.6), ell(9, 3.8, 1.4, 1.4), ell(10.8, 2.4, 1.2, 1.2));
  const claws = or(ell(3, step ? 8 : 9, 1.8, 1.5), ell(13, step ? 9 : 8, 1.8, 1.5), box(4, 9, 5, 10), box(11, 9, 12, 10));
  shade(l, or(body, tail, claws), shell);
  pts(l, [[12, 1], [12, 2]], hex("#ffe08a"));
  pts(l, [[7, 9], [9, 9]], hex("#1a0c04"));
  outline(l, hex("#2a1006"));
  return l;
}

function imp(frame) {
  const l = new Img(16, 16);
  const skin = { base: hex("#c0392b"), light: hex("#ff6a4a"), dark: hex("#7a1c14") };
  const wing = { base: hex("#5a1a14"), light: hex("#8a2a1c"), dark: hex("#3a0e0a") };
  const wings = frame === 0 ? or(tri(6, 8, 1, 3, 3, 9), tri(10, 8, 15, 3, 13, 9)) : or(tri(6, 8, 1, 12, 4, 11), tri(10, 8, 15, 12, 12, 11));
  shade(l, wings, wing);
  shade(l, or(ell(8, 9, 3, 3.4), tri(6, 7, 5.5, 3.5, 7.5, 6.5), tri(10, 7, 10.5, 3.5, 8.5, 6.5), tri(8, 12, 9, 12, 11, 15)), skin);
  pts(l, [[7, 8], [9, 8]], hex("#ffe14a"));
  pts(l, [[7, 10], [8, 10], [9, 10]], hex("#3a0e0a"));
  outline(l, hex("#1e0604"));
  return l;
}

function wolf(frame) {
  const l = new Img(16, 16);
  const fur = { base: hex("#7d8aa0"), light: hex("#b8c4d6"), dark: hex("#4f5a6e"), hi: hex("#e6edf5") };
  const step = frame === 1;
  const legs = step ? or(box(4, 11, 5, 14), box(10, 12, 11, 14)) : or(box(5, 12, 6, 14), box(11, 11, 12, 14));
  shade(l, legs, fur);
  shade(l, or(ell(8, 10, 5.2, 2.8), ell(12.5, 7, 2.6, 2.4), tri(11, 5.5, 11.5, 2.5, 12.8, 5), tri(13, 5.5, 14, 2.5, 14.5, 5.5), ell(14.8, 8, 1.4, 1), tri(3.5, 9, 0.5, step ? 6 : 7, 3, 11)), fur);
  pts(l, [[13, 6]], hex("#ffe14a"));
  pts(l, [[15, 8]], hex("#1a1c22"));
  outline(l, hex("#161a24"));
  return l;
}

function wisp(frame) {
  const l = new Img(16, 16);
  const trail = frame === 0 ? [[6, 13], [8, 14], [10, 13]] : [[7, 14], [9, 13], [8, 15]];
  for (const [x, y] of trail) l.set(x, y, hex("#9fe8ff", 180));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (ell(8, 8, 3.2, 3.6)(x, y)) l.set(x, y, hex("#ffffff"));
      else if (ell(8, 8.5, 4.8, 5.4)(x, y)) l.set(x, y, hex("#7fd4ff", 220));
      else if (ell(8, 9, 6.2, 6.6)(x, y) && (x + y + frame) % 2 === 0) l.set(x, y, hex("#bfe8ff", 110));
    }
  pts(l, [[7, 8], [9, 8]], hex("#1f3f6a"));
  return l;
}

// ---------------------------------------------------------------- hidden world bosses (48x48)

function titan(frame) {
  const l = new Img(48, 48);
  const body = { base: hex("#2e1c33"), light: hex("#523459"), dark: hex("#170c1a"), hi: hex("#7a4c82") };
  const bone = { base: hex("#d8cfc0"), light: hex("#fffaf0"), dark: hex("#8f8574") };
  const lift = frame === 1 ? 3 : 0;
  // Blood-moon halo behind the head.
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 12);
      if (d > 9.5 && d < 11.5) l.set(x, y, hex("#ff3b4a", 150));
    }
  const shapes = new Img(48, 48);
  shade(shapes, or(box(14, 36, 20, 46), box(28, 36, 34, 46)), body); // legs
  shade(shapes, or(ell(24, 28, 14, 12), box(12, 20, 36, 38)), body); // torso
  shade(shapes, or(ell(6, 27 - lift, 5, 10), ell(42, 27 - lift, 5, 10)), body); // arms
  shade(shapes, or(box(2, 34 - lift, 10, 40 - lift), box(38, 34 - lift, 46, 40 - lift)), { ...body, base: body.dark }); // fists
  shade(shapes, ell(24, 13, 7.5, 7), body); // head
  shade(shapes, or(tri(18, 9, 12, 1, 20, 6), tri(30, 9, 36, 1, 28, 6)), bone); // horns
  const core = or(tri(24, 22, 29, 28, 19, 28), tri(19, 28, 29, 28, 24, 34));
  shade(shapes, core, { base: hex("#ff2a3a"), light: hex("#ff9aa4"), dark: hex("#a0101c") });
  pts(shapes, [[20, 13], [21, 13], [27, 13], [28, 13]], hex("#ff2a3a"));
  pts(shapes, [[20, 12], [28, 12]], hex("#ffd0d4"));
  for (const [x, y] of [[16, 24], [17, 25], [31, 24], [30, 25], [22, 36], [26, 36]]) shapes.set(x, y, hex("#ff3b4a"));
  outline(shapes, hex("#08040a"));
  return l.blit(shapes);
}

function colossus(frame) {
  const l = new Img(48, 48);
  const stone = { base: hex("#6d6a7a"), light: hex("#9a97aa"), dark: hex("#46434f"), hi: hex("#c2bfd0") };
  const rune = hex("#6ff5ff");
  const lift = frame === 1 ? 3 : 0;
  shade(l, or(box(13, 36, 20, 46), box(28, 36, 35, 46)), stone);
  shade(l, or(ell(24, 27, 15, 12), box(10, 18, 38, 38)), stone);
  shade(l, or(ell(5, 26 - lift, 5, 11), ell(43, 26 - lift, 5, 11)), stone);
  shade(l, or(box(1, 34 - lift, 9, 41 - lift), box(39, 34 - lift, 47, 41 - lift)), { ...stone, base: stone.dark });
  shade(l, ell(24, 11, 8, 7), stone);
  // Glowing runes and eyes.
  for (const [x, y] of [[24, 22], [24, 23], [23, 24], [25, 24], [24, 25], [24, 26], [16, 28], [17, 29], [31, 28], [30, 29], [20, 34], [28, 34]]) l.set(x, y, rune);
  pts(l, [[20, 11], [21, 11], [27, 11], [28, 11]], rune);
  // Chains across the chest and wrists.
  const chain = hex("#b8b2a4");
  for (let i = 0; i < 12; i++) {
    const x = 12 + i * 2;
    const y = 20 + Math.round(i * 1.1);
    l.set(x, y, chain);
    if (i % 2) l.set(x + 1, y, hex("#6e6a60"));
  }
  for (const cx of [5, 43]) for (let k = -2; k <= 2; k++) l.set(cx + k, 32 - lift + (k % 2), chain);
  outline(l, hex("#14121a"));
  return l;
}

function chest(frame) {
  const l = new Img(16, 16);
  const wood = { base: hex("#9a5d2c"), light: hex("#c07a3c"), dark: hex("#6a3c1a") };
  const gold = { base: hex("#e0b33c"), light: hex("#ffe08a"), dark: hex("#a0761c") };
  if (frame === 0) {
    shade(l, box(1, 5, 14, 14), wood);
    shade(l, box(1, 3, 14, 7), { ...wood, base: wood.light });
    for (let x = 1; x <= 14; x++) l.set(x, 8, gold.dark);
    shade(l, or(box(1, 3, 2, 14), box(13, 3, 14, 14)), gold);
    shade(l, box(6, 7, 9, 10), gold);
    l.set(7, 9, hex("#2a1a0c"));
  } else {
    shade(l, box(1, 7, 14, 14), wood);
    shade(l, box(2, 7, 13, 9), { base: hex("#2a1a0c"), light: hex("#3a2612"), dark: hex("#1a1006") });
    shade(l, box(1, 2, 14, 5), { ...wood, base: wood.dark });
    shade(l, or(box(1, 2, 2, 5), box(13, 2, 14, 5), box(1, 7, 2, 14), box(13, 7, 14, 14)), gold);
    pts(l, [[5, 8], [8, 8], [11, 8]], hex("#ffe08a"));
  }
  outline(l, hex("#24140a"));
  return l;
}

function slash() {
  const l = new Img(16, 16);
  const arc = and(ell(4, 8, 11, 7.8), not(ell(2.5, 8, 9.5, 6.3)), box(5, 0, 15, 15));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!arc(x, y)) continue;
      const inner = !ell(4, 8, 10, 6.9)(x, y);
      l.set(x, y, inner ? hex("#ffffff") : hex("#8fd0ff", 210));
    }
  return l;
}

const gemShape = or(tri(4, 0.5, 7.5, 3, 0.5, 3), box(1, 3, 6, 5), tri(0.5, 5, 7.5, 5, 4, 7.8));
function gem(base, light, dark) {
  const l = new Img(8, 8);
  shade(l, and(gemShape, box(1, 0, 6, 7)), { base, light, dark, hi: hex("#ffffff") });
  for (let y = 2; y < 6; y++) l.set(4, y, light);
  outline(l, hex("#0e0a14"));
  return l;
}

function heart() {
  const l = new Img(8, 8);
  shade(l, or(ell(2.5, 2.8, 2, 2), ell(5.5, 2.8, 2, 2), tri(0.5, 3, 7.5, 3, 4, 7.5)), { base: hex("#e8344a"), light: hex("#ff8a9a"), dark: hex("#a81e32"), hi: hex("#ffffff") });
  outline(l, hex("#3a0a12"));
  return l;
}

function bottle(liquid) {
  const l = new Img(8, 8);
  shade(l, box(3, 0, 4, 1), { base: hex("#b58a5a"), light: hex("#d6ad7a"), dark: hex("#7a5a36") });
  shade(l, ell(4, 5, 3, 2.8), liquid);
  l.set(2, 4, hex("#ffffff"));
  outline(l, hex("#140d12"));
  return l;
}

function shard() {
  const l = new Img(8, 8);
  shade(l, or(tri(4, 0, 6.5, 4, 1.5, 4), tri(1.5, 4, 6.5, 4, 4, 8)), { base: hex("#a86cff"), light: hex("#e1c8ff"), dark: hex("#5a2aa8"), hi: hex("#ffffff") });
  outline(l, hex("#1a0a30"));
  return l;
}

function orb() {
  const l = new Img(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      if (ell(4, 4, 2, 2)(x, y)) l.set(x, y, hex("#ffffff"));
      else if (ell(4, 4, 3.2, 3.2)(x, y)) l.set(x, y, hex("#dddddd", 200));
      else if (ell(4, 4, 4, 4)(x, y)) l.set(x, y, hex("#bbbbbb", 90));
    }
  return l;
}

function boulder() {
  const l = new Img(8, 8);
  shade(l, ell(4, 4, 3.2, 3), { ...PAL.stone, hi: hex("#dadce3") });
  l.set(5, 4, PAL.stone.dark);
  outline(l, PAL.stone.line);
  return l;
}

function boneProj() {
  const l = new Img(8, 8);
  shade(l, or(box(2, 3, 5, 4), ell(1.5, 3, 1.2, 1.2), ell(1.5, 5, 1.2, 1.2), ell(6.5, 3, 1.2, 1.2), ell(6.5, 5, 1.2, 1.2)), { base: hex("#e3dfcf"), light: hex("#fbf8ec"), dark: hex("#aaa48f") });
  outline(l, hex("#1b1b22"));
  return l;
}

function shadow() {
  const l = new Img(16, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) if (ell(8, 3, 7.5, 2.8)(x, y)) l.set(x, y, [0, 0, 0, ell(8, 3, 5, 1.8)(x, y) ? 90 : 55]);
  return l;
}

function spark() {
  const l = new Img(5, 5);
  pts(l, [[2, 0], [2, 1], [0, 2], [1, 2], [3, 2], [4, 2], [2, 3], [2, 4]], hex("#ffffff", 200));
  l.set(2, 2, hex("#ffffff"));
  return l;
}

const strip = (frames) => {
  const out = new Img(frames[0].w * frames.length, frames[0].h);
  frames.forEach((f, i) => out.blit(f, i * f.w, 0));
  return out;
};

function buildSprites() {
  const green = { base: hex("#5bbf3a"), light: hex("#9be36a"), dark: hex("#3c8a28"), line: hex("#173812") };
  const red = { base: hex("#d9483b"), light: hex("#ff8a6a"), dark: hex("#9a2a22"), line: hex("#3a0c08") };
  return {
    slime_green: strip([slime(0, green), slime(1, green)]),
    slime_red: strip([slime(0, red), slime(1, red)]),
    bat: strip([bat(0), bat(1)]),
    skeleton: strip([skeleton(0), skeleton(1)]),
    scorpion: strip([scorpion(0), scorpion(1)]),
    imp: strip([imp(0), imp(1)]),
    wolf: strip([wolf(0), wolf(1)]),
    wisp: strip([wisp(0), wisp(1)]),
    golem: strip([golem(0), golem(1)]),
    wraith: strip([wraith(0), wraith(1)]),
    pyre: strip([golem(0, PYRE_PAL), golem(1, PYRE_PAL)]),
    rime: strip([wraith(0, RIME_PAL), wraith(1, RIME_PAL)]),
    titan: strip([titan(0), titan(1)]),
    colossus: strip([colossus(0), colossus(1)]),
    chest: strip([chest(0), chest(1)]),
    slash: slash(),
    orb: orb(),
    boulder: boulder(),
    bone: boneProj(),
    heart: heart(),
    gem_green: gem(hex("#3ccf5a"), hex("#a6f5b0"), hex("#1e7a34")),
    gem_blue: gem(hex("#3c8cff"), hex("#a8d0ff"), hex("#1c4aa8")),
    gem_red: gem(hex("#ff3c5a"), hex("#ffb0bd"), hex("#a81c34")),
    shard: shard(),
    potion: bottle({ base: hex("#e8344a"), light: hex("#ff8a9a"), dark: hex("#a81e32") }),
    ether: bottle({ base: hex("#3c7cff"), light: hex("#9cc2ff"), dark: hex("#1c46b0") }),
    shadow: shadow(),
    spark: spark(),
    px: new Img(2, 2).fill(hex("#ffffff")),
  };
}

// ---------------------------------------------------------------- main

function save(path, img) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img.w, img.h, img.d));
}

const { sheet, tiles } = buildTiles();
save(join(OUT, "tiles.png"), sheet.scaled(ART_SCALE));

const sprites = buildSprites();
for (const [name, def] of Object.entries(SPRITE_DEFS)) {
  const img = sprites[name];
  if (!img || img.w !== def.w * def.frames || img.h !== def.h)
    throw new Error(`sprite ${name}: expected ${def.w * def.frames}x${def.h}, got ${img?.w}x${img?.h}`);
  save(join(OUT, `${name}.png`), img.scaled(ART_SCALE));
}
console.log(`wrote tileset (${TILE_COUNT} tiles) and ${Object.keys(SPRITE_DEFS).length} sprites to ${OUT}`);

// Optional: render the world map with the generated tiles for a quick look.
const previewIdx = process.argv.indexOf("--preview");
if (previewIdx !== -1) {
  const { buildWorld } = await import("../src/game/world/map.js");
  const world = buildWorld();
  const img = new Img(world.width * 16, world.height * 16);
  world.ids.forEach((row, y) => row.forEach((id, x) => img.blit(tiles[id], x * 16, y * 16)));
  const chestImg = chest(0);
  for (const c of world.chests) img.blit(chestImg, c.x * 16, c.y * 16);
  const dot = (x, y, c) => { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) img.set(x * 16 + 8 + i, y * 16 + 8 + j, c); };
  for (const s of world.spawns) dot(s.x, s.y, hex("#ff00ff"));
  for (const b of world.bosses) dot(b.x, b.y, hex("#ff0000"));
  dot(world.start.x, world.start.y, hex("#ffffff"));
  save(process.argv[previewIdx + 1], img);
  console.log("preview written");
}
