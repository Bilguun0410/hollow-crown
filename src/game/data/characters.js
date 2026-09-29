// Playable characters. The game only reads heroes through this registry: add
// an entry (plus art, see tools/slice-character.js) and the title screen,
// textures, animations, hitbox, stats and skills all pick it up.

export const CHARACTERS = {
  shadowblade: {
    id: "shadowblade",
    className: "Shadowblade",
    defaultName: "Wanderer",
    description:
      "A silver-haired drifter in a tattered coat. Quick blade, shadow magic.",
    sprite: {
      url: "assets/sprites/character.png",
      frameWidth: 56,
      frameHeight: 106,
      scale: 0.75,
      framesPerDir: 5,
      rows: { down: 0, left: 5, right: 10, up: 15 },
      // Feet hitbox, in unscaled frame pixels.
      body: { width: 28, height: 16, offsetX: 14, offsetY: 88 },
    },
    // Single-frame poses used for attacks and death (side view, faces right).
    poses: {
      attack: { url: "assets/anims/attack.png", originX: 0.3, originY: 0.97 },
      die: { url: "assets/anims/die.png", originX: 0.5, originY: 0.9 },
    },
    art: {
      avatar: "assets/art/hud_avatar.png",
      portrait: "assets/art/portrait.png",
      fullbody: "assets/art/fullbody.png",
      weapon: "assets/equipment/sword.png",
    },
    // Keys the game asks for; `critical` shows at low HP.
    emotes: {
      neutral: "assets/emotes/0_neutral.png",
      happy: "assets/emotes/1_happy.png",
      calm: "assets/emotes/2_calm.png",
      angry: "assets/emotes/3_angry.png",
      serious: "assets/emotes/4_serious.png",
      laugh: "assets/emotes/5_laugh.png",
      hurt: "assets/emotes/6_hurt.png",
      critical: "assets/emotes/6_hurt.png",
      cool: "assets/emotes/7_cool.png",
    },
    traits: ["Shadow Bolt: ranged magic", "Fast sword and light feet"],
    // critRate is a 0..1 chance; critDmg is the damage multiplier on a crit.
    baseStats: {
      maxHp: 100,
      maxMp: 50,
      atk: 28,
      def: 2,
      speed: 170,
      critRate: 0.5,
      critDmg: 1.8,
      magic: 1,
      stamina: 100,
    },
    growth: { maxHp: 12, maxMp: 6, atk: 4, def: 2 },
    skills: {
      // reach: swing length; halfWidth: half the swing's width; power: × Attack.
      slash: {
        key: "J / Space",
        cooldown: 320,
        reach: 66,
        halfWidth: 30,
        power: 1,
        knock: 240,
      },
      // The K skill. type "bolt" fires a shadow bolt, "whirlwind" spins in place.
      special: {
        type: "bolt",
        name: "Shadow Bolt",
        key: "K",
        icon: "assets/generated/orb.png",
        cooldown: 450,
        mpCost: 8,
        power: 1.4,
      },
      dash: { key: "L", cooldown: 750, duration: 170, speed: 560 },
      // Hold to run faster; drains stamina per second, refills after a short pause.
      sprint: {
        key: "Shift",
        mult: 1.75,
        drain: 30,
        regen: 24,
        regenDelay: 600,
      },
    },
  },

  berserker: {
    id: "berserker",
    className: "Berserker",
    defaultName: "Revee",
    description:
      "A silent sellsword with a notched claymore. Slow, crushing swings that cleave whole packs apart.",
    sprite: {
      url: "assets/characters/revee/walk.png",
      frameWidth: 55,
      frameHeight: 91,
      scale: 0.92,
      framesPerDir: 5,
      // The source sheet has no back view: "up" reuses a side-walk row.
      rows: { down: 0, left: 5, right: 10, up: 15 },
      body: { width: 26, height: 14, offsetX: 14, offsetY: 76 },
    },
    poses: {
      attack: {
        url: "assets/characters/revee/attack.png",
        originX: 0.32,
        originY: 0.98,
      },
      die: {
        url: "assets/characters/revee/die.png",
        originX: 0.5,
        originY: 0.9,
      },
    },
    art: {
      avatar: "assets/characters/revee/hud_avatar.png",
      portrait: "assets/characters/revee/portrait.png",
      fullbody: "assets/characters/revee/fullbody.png",
      weapon: "assets/characters/revee/weapon.png",
    },
    emotes: {
      neutral: "assets/characters/revee/emote_neutral.png",
      happy: "assets/characters/revee/emote_smile.png",
      calm: "assets/characters/revee/emote_neutral.png",
      angry: "assets/characters/revee/emote_angry.png",
      serious: "assets/characters/revee/emote_shout.png",
      laugh: "assets/characters/revee/emote_laugh.png",
      hurt: "assets/characters/revee/emote_hurt.png",
      critical: "assets/characters/revee/emote_bloody.png",
      cool: "assets/characters/revee/emote_sunglasses.png",
    },
    traits: [
      "Bloodlust: heals 4% of damage dealt",
      "Whirlwind: claymore spin hits all around",
    ],
    baseStats: {
      maxHp: 200,
      maxMp: 50,
      atk: 16,
      def: 4,
      speed: 150,
      critRate: 0.05,
      critDmg: 2.2,
      magic: 0.8,
      stamina: 130,
      lifesteal: 0.04,
    },
    growth: { maxHp: 20, maxMp: 3, atk: 3, def: 1 },
    skills: {
      slash: {
        key: "J / Space",
        cooldown: 560,
        reach: 88,
        halfWidth: 42,
        power: 1.35,
        knock: 340,
      },
      special: {
        type: "whirlwind",
        name: "Whirlwind",
        key: "K",
        icon: "assets/characters/revee/weapon.png",
        cooldown: 1300,
        mpCost: 12,
        power: 1.2,
        radius: 115,
      },
      dash: { key: "L", cooldown: 900, duration: 170, speed: 520 },
      sprint: {
        key: "Shift",
        mult: 1.45,
        drain: 26,
        regen: 22,
        regenDelay: 700,
      },
    },
  },
};

export const DEFAULT_CHARACTER = "shadowblade";

export const characterKeys = (id) => ({
  sheet: `CHAR_${id}_SHEET`,
  attack: `CHAR_${id}_ATTACK`,
  die: `CHAR_${id}_DIE`,
  walk: (dir) => `CHAR_${id}_WALK_${dir}`,
});
