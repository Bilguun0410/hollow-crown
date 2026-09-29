// Procedurally generated sprites (see tools/gen-assets.js). Each entry is a
// horizontal strip of `frames` cells, `w`x`h` art pixels each, upscaled x3.
import { ART_SCALE } from "../world/tiles.js";

export const GENERATED_DIR = "assets/generated";

export const SPRITE_DEFS = Object.freeze({
  slime_green: { w: 16, h: 16, frames: 2 },
  slime_red: { w: 16, h: 16, frames: 2 },
  bat: { w: 16, h: 16, frames: 2 },
  skeleton: { w: 16, h: 16, frames: 2 },
  scorpion: { w: 16, h: 16, frames: 2 },
  imp: { w: 16, h: 16, frames: 2 },
  wolf: { w: 16, h: 16, frames: 2 },
  wisp: { w: 16, h: 16, frames: 2 },
  golem: { w: 32, h: 32, frames: 2 },
  wraith: { w: 32, h: 32, frames: 2 },
  pyre: { w: 32, h: 32, frames: 2 },
  rime: { w: 32, h: 32, frames: 2 },
  titan: { w: 48, h: 48, frames: 2 },
  colossus: { w: 48, h: 48, frames: 2 },
  chest: { w: 16, h: 16, frames: 2 },
  slash: { w: 16, h: 16, frames: 1 },
  orb: { w: 8, h: 8, frames: 1 },
  boulder: { w: 8, h: 8, frames: 1 },
  bone: { w: 8, h: 8, frames: 1 },
  heart: { w: 8, h: 8, frames: 1 },
  gem_green: { w: 8, h: 8, frames: 1 },
  gem_blue: { w: 8, h: 8, frames: 1 },
  gem_red: { w: 8, h: 8, frames: 1 },
  shard: { w: 8, h: 8, frames: 1 },
  potion: { w: 8, h: 8, frames: 1 },
  ether: { w: 8, h: 8, frames: 1 },
  shadow: { w: 16, h: 6, frames: 1 },
  spark: { w: 5, h: 5, frames: 1 },
  px: { w: 2, h: 2, frames: 1 },
});

export const spriteKey = (name) => `GEN_${name.toUpperCase()}`;
export const spriteUrl = (name) => `${GENERATED_DIR}/${name}.png`;
export const frameSize = (name) => ({
  frameWidth: SPRITE_DEFS[name].w * ART_SCALE,
  frameHeight: SPRITE_DEFS[name].h * ART_SCALE,
});

export const TILESET_KEY = "GEN_TILESET";
export const TILESET_URL = `${GENERATED_DIR}/tiles.png`;
