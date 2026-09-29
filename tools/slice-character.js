// Slice a character sheet (portrait, emotes, walk sprites, poses) into game assets.
//
//   bun tools/slice-character.js revee
//
// Sheets are AI-painted on a near-black, slightly blue background, so sprites
// are cut out by flood-filling that background inward from each box's edge:
// dark-but-neutral pixels (black clothing) stay, bluish-dark pixels go.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// Boxes are [left, top, right, bottom] in sheet pixels.
const CONFIGS = {
  revee: {
    sheet: "assets-splicer/revee.JPG",
    out: "public/assets/characters/revee",
    isBackground: (r, g, b) => Math.max(r, g, b) < 40 && b - r >= 3,
    art: {
      portrait: [130, 40, 480, 520],
      fullbody: [470, 15, 770, 770],
      hud_avatar: [494, 810, 594, 910],
      weapon: [893, 826, 980, 1050],
    },
    emotes: {
      cols: [[36, 132], [146, 242], [256, 352], [366, 462]],
      rows: [[785, 895], [919, 1022]],
      names: ["neutral", "angry", "smile", "laugh", "shout", "hurt", "bloody", "sunglasses"],
    },
    // Walk rows; every row in this sheet faces left (there is no back view),
    // so "right" is built by mirroring "left".
    walk: {
      x: [840, 1226],
      rows: { down: [72, 172], left: [176, 272], up: [378, 472] },
      mirror: { right: "left" },
    },
    poses: {
      attack: { box: [845, 645, 933, 746] }, // second attack frame + slash
      die: { box: [1128, 690, 1224, 743] },
    },
    // Equipment icons, keyed against each panel's own background colour.
    items: {
      item_claymore: { box: [893, 826, 980, 1050] },
      item_coat: { box: [1006, 828, 1113, 979], tol: 9 },
      item_hood: { box: [1130, 828, 1218, 905], tol: 9 },
      item_belt: { box: [1130, 918, 1218, 980], tol: 9 },
      item_gloves: { box: [1002, 991, 1055, 1049], tol: 9 },
      item_boots: { box: [1069, 991, 1121, 1050], tol: 9 },
      item_bracer: { box: [1130, 991, 1173, 1050], tol: 9 },
      item_ring: { box: [1182, 991, 1220, 1050], tol: 9, holes: true },
    },
  },
};

const name = process.argv[2];
const cfg = CONFIGS[name];
if (!cfg) throw new Error(`usage: bun tools/slice-character.js <${Object.keys(CONFIGS).join("|")}>`);

const src = join(ROOT, cfg.sheet);
const out = join(ROOT, cfg.out);
mkdirSync(out, { recursive: true });
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const C = info.channels;
const rgb = (x, y) => {
  const i = (y * W + x) * C;
  return [data[i], data[i + 1], data[i + 2]];
};

const crop = ([l, t, r, b]) => sharp(src).extract({ left: l, top: t, width: r - l, height: b - t });

/** Median colour of a box's outer ring of pixels. */
function borderColor([l, t, r, b]) {
  const samples = [];
  for (let x = l; x < r; x++) samples.push(rgb(x, t), rgb(x, b - 1));
  for (let y = t; y < b; y++) samples.push(rgb(l, y), rgb(r - 1, y));
  const mid = (k) => samples.map((s) => s[k]).sort((a, z) => a - z)[samples.length >> 1];
  return [mid(0), mid(1), mid(2)];
}

/**
 * Cut a box out with the background keyed to transparency. Returns RGBA pixels.
 * With `tol`, "background" means within tol of the box's own border colour,
 * which keeps dark bluish cloth that the global rule would eat; `holes` also
 * clears enclosed background (the inside of a ring).
 */
/**
 * @param {number[]} box
 * @param {{ tol?: number, holes?: boolean }} [opts]
 */
function keyed([l, t, r, b], { tol, holes = false } = {}) {
  const w = r - l;
  const h = b - t;
  const px = new Uint8ClampedArray(w * h * 4);
  const bg = new Uint8Array(w * h);
  const ref = tol ? borderColor([l, t, r, b]) : null;
  const isBg = tol ? (R, G, B) => Math.max(Math.abs(R - ref[0]), Math.abs(G - ref[1]), Math.abs(B - ref[2])) <= tol : cfg.isBackground;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [R, G, B] = rgb(l + x, t + y);
      px.set([R, G, B, 255], (y * w + x) * 4);
      bg[y * w + x] = isBg(R, G, B) ? 1 : 0;
    }
  if (holes) for (let i = 0; i < w * h; i++) if (bg[i]) px[i * 4 + 3] = 0;
  // Flood the background from the box edges so enclosed dark pixels survive.
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !bg[i]) continue;
    seen[i] = 1;
    px[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return { w, h, px };
}

/** Connected opaque blobs (8-neighbour), dropping specks below minArea. */
function blobs({ w, h, px }, minArea = 60) {
  const label = new Int32Array(w * h).fill(-1);
  const found = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] !== -1 || !px[s * 4 + 3]) continue;
    const box = { l: w, t: h, r: 0, b: 0, area: 0 };
    const stack = [s];
    label[s] = found.length;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i / w) | 0;
      box.l = Math.min(box.l, x);
      box.r = Math.max(box.r, x);
      box.t = Math.min(box.t, y);
      box.b = Math.max(box.b, y);
      box.area++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (label[j] === -1 && px[j * 4 + 3]) {
            label[j] = found.length;
            stack.push(j);
          }
        }
    }
    found.push(box);
  }
  return found.filter((b) => b.area >= minArea);
}

/** Group blobs whose x-ranges overlap (a sword tip detached from its body, etc.). */
function mergeColumns(list, gap = 4) {
  const sorted = [...list].sort((a, b) => a.l - b.l);
  const merged = [];
  for (const b of sorted) {
    const last = merged.at(-1);
    if (last && b.l <= last.r + gap) {
      last.l = Math.min(last.l, b.l);
      last.r = Math.max(last.r, b.r);
      last.t = Math.min(last.t, b.t);
      last.b = Math.max(last.b, b.b);
      last.area += b.area;
    } else merged.push({ ...b });
  }
  return merged;
}

function sub(img, { l, t, r, b }) {
  const w = r - l + 1;
  const h = b - t + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) px.set(img.px.subarray(((t + y) * img.w + l) * 4, ((t + y) * img.w + r + 1) * 4), y * w * 4);
  return { w, h, px };
}

function mirror(img) {
  const px = new Uint8ClampedArray(img.px.length);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) px.set(img.px.subarray((y * img.w + x) * 4, (y * img.w + x + 1) * 4), (y * img.w + (img.w - 1 - x)) * 4);
  return { ...img, px };
}

const savePng = (img, file) => sharp(Buffer.from(img.px), { raw: { width: img.w, height: img.h, channels: 4 } }).png().toFile(join(out, file));

// ---- opaque art
for (const [file, box] of Object.entries(cfg.art)) {
  if (file === "weapon") await savePng(sub(keyed(box), { l: 0, t: 0, r: box[2] - box[0] - 1, b: box[3] - box[1] - 1 }), `${file}.png`);
  else await crop(box).png().toFile(join(out, `${file}.png`));
}
const { cols, rows, names } = cfg.emotes;
let e = 0;
for (const [t, b] of rows) for (const [l, r] of cols) await crop([l, t, r, b]).png().toFile(join(out, `emote_${names[e++]}.png`));

// ---- walk sheet: one row per direction, frames bottom-aligned in equal cells
const walkRows = {};
for (const [dir, [t, b]] of Object.entries(cfg.walk.rows)) {
  const img = keyed([cfg.walk.x[0], t, cfg.walk.x[1], b]);
  const frames = mergeColumns(blobs(img)).filter((f) => f.b - f.t > 30);
  if (frames.length !== 5) throw new Error(`${dir}: expected 5 frames, found ${frames.length}`);
  walkRows[dir] = frames.map((f) => sub(img, f));
}
for (const [dir, from] of Object.entries(cfg.walk.mirror)) walkRows[dir] = walkRows[from].map(mirror);

const order = ["down", "left", "right", "up"];
const all = order.flatMap((d) => walkRows[d]);
const cellW = Math.max(...all.map((f) => f.w)) + 4;
const cellH = Math.max(...all.map((f) => f.h)) + 2;
const sheet = { w: cellW * 5, h: cellH * order.length, px: new Uint8ClampedArray(cellW * 5 * cellH * order.length * 4) };
order.forEach((dir, row) =>
  walkRows[dir].forEach((f, col) => {
    const ox = col * cellW + ((cellW - f.w) >> 1);
    const oy = row * cellH + (cellH - f.h - 1);
    for (let y = 0; y < f.h; y++) sheet.px.set(f.px.subarray(y * f.w * 4, (y + 1) * f.w * 4), ((oy + y) * sheet.w + ox) * 4);
  }),
);
await savePng(sheet, "walk.png");

// ---- single-frame poses and item icons, trimmed to their content
const cutouts = { ...cfg.poses, ...cfg.items };
for (const [file, { box, ...opts }] of Object.entries(cutouts)) {
  const img = keyed(box, opts);
  // Skip thin strokes: panel frame lines that sneak into the box.
  const parts = blobs(img, 20).filter((p) => p.b - p.t > 4 && p.r - p.l > 4);
  const bound = parts.reduce((a, p) => ({ l: Math.min(a.l, p.l), t: Math.min(a.t, p.t), r: Math.max(a.r, p.r), b: Math.max(a.b, p.b) }), { l: img.w, t: img.h, r: 0, b: 0 });
  const trimmed = sub(img, bound);
  await savePng(trimmed, `${file}.png`);
  console.log(`${file}: ${trimmed.w}x${trimmed.h}`);
}

console.log(`walk: ${cellW}x${cellH} cells, rows ${order.join("/")} -> ${cfg.out}`);
