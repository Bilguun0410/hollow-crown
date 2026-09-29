import { CHARACTERS } from "../game/data/characters.js";
import { CONSUMABLES, CURRENCIES, gearFor, ITEMS } from "../game/data/items.js";
import { expToNext, getStats, MAX_LEVEL, useConsumable } from "../game/state/actions.js";

/** @param {{ kind: string, value: number, max: number, label?: string, showNumbers?: boolean }} props */
export function Bar({ kind, value, max, label = "", showNumbers = true }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {showNumbers && (
        <span className="bar-text">
          {label} {Math.ceil(value)} / {max}
        </span>
      )}
    </div>
  );
}

export function Currency({ id, value }) {
  return (
    <span className="currency" title={CURRENCIES[id].name}>
      <img src={CURRENCIES[id].icon} alt="" className="px-icon" />
      {value.toLocaleString()}
    </span>
  );
}

function heroEmote(s, st) {
  if (s.emote !== "neutral") return s.emote;
  if (s.hero.hp / st.maxHp < 0.3) return "critical";
  if (s.boss || s.worldBoss) return "angry";
  return "neutral";
}

function Cooldown({ cd }) {
  if (!cd) return null;
  const remaining = cd.readyAt - Date.now();
  if (remaining <= 0) return null;
  return <div key={cd.readyAt} className="cooldown" style={/** @type {import("react").CSSProperties} */ ({ animationDuration: `${remaining}ms`, "--from": remaining / cd.duration })} />;
}

/** @param {{ hotkey: string, icon: string, label: string, sub?: string, cd?: { readyAt: number, duration: number }, disabled?: boolean, onClick?: () => void, count?: number }} props */
function Slot({ hotkey, icon, label, sub, cd, disabled, onClick, count }) {
  return (
    <button className={`slot ${disabled ? "is-disabled" : ""}`} onClick={onClick} tabIndex={-1} title={label}>
      <img src={icon} alt="" className="px-icon" />
      <Cooldown cd={cd} />
      <span className="slot-key">{hotkey}</span>
      {count !== undefined && <span className="slot-count">×{count}</span>}
      {sub && <span className="slot-sub">{sub}</span>}
    </button>
  );
}

export function Hud({ s }) {
  const st = getStats(s);
  const ch = CHARACTERS[s.hero.characterId];
  const { hero } = s;
  const { special } = ch.skills;
  const maxed = hero.level >= MAX_LEVEL;

  return (
    <div className="hud">
      <div className="hero-card panel">
        <div className="avatar">
          <img src={ch.emotes[heroEmote(s, st)]} alt="" />
        </div>
        <div className="hero-info">
          <div className="hero-name">
            {hero.name} <span className="lv">Lv. {hero.level}</span>
          </div>
          <Bar kind="hp" label="HP" value={hero.hp} max={st.maxHp} />
          <Bar kind="mp" label="MP" value={hero.mp} max={st.maxMp} />
          <Bar kind="stamina" value={Math.min(s.stamina ?? st.stamina, st.stamina)} max={st.stamina} showNumbers={false} />
          <Bar kind="exp" value={maxed ? 1 : hero.exp} max={maxed ? 1 : expToNext(hero.level)} showNumbers={false} />
        </div>
      </div>

      <div className="wallet panel">
        <Currency id="gems" value={s.wallet.gems} />
        <Currency id="shards" value={s.wallet.shards} />
      </div>

      {s.boss && (
        <div className="boss-bar">
          <div className="boss-name">{s.boss.name}</div>
          <div className="boss-title">
            {s.boss.title}
            {s.boss.tier > 0 && <span className="boss-tier"> · Empowered ★{s.boss.tier}</span>}
          </div>
          <Bar kind="boss" value={s.boss.hp} max={s.boss.maxHp} showNumbers={false} />
        </div>
      )}

      {!s.boss && s.worldBoss && (
        <div className="boss-bar world-boss-bar">
          <div className="boss-name">{s.worldBoss.name}</div>
          <div className="boss-title">
            {s.worldBoss.title} · <span className={s.worldBoss.shield ? "shield-up" : "shield-down"}>{s.worldBoss.shield ? "Bond Shield: strike together!" : "Shield broken!"}</span>
          </div>
          <Bar kind={s.worldBoss.shield ? "shielded" : "boss"} value={s.worldBoss.hp} max={s.worldBoss.maxHp} showNumbers={false} />
        </div>
      )}

      {s.region && (
        <div key={s.region} className="region-banner">
          <span>{s.region}</span>
        </div>
      )}

      {s.prompt && <div className="prompt">{s.prompt}</div>}

      <div className="hotbar panel">
        <Slot hotkey="J" icon={ch.art.weapon} label="Slash" />
        <Slot hotkey="K" icon={special.icon} label={special.name} sub={`${special.mpCost}mp`} cd={s.cooldowns.special} disabled={hero.mp < special.mpCost} />
        <Slot hotkey="L" icon={ITEMS[gearFor(ch.id, "boots")]?.icon ?? ITEMS.boots.icon} label="Dash" cd={s.cooldowns.dash} />
        <span className="hotbar-sep" />
        {Object.entries(CONSUMABLES).map(([id, c]) => (
          <Slot key={id} hotkey={c.hotkey} icon={c.icon} label={c.name} count={s.bag[id] ?? 0} disabled={!s.bag[id]} onClick={() => useConsumable(id)} />
        ))}
      </div>

      <div className="hint">
        WASD move · Shift sprint · J slash · K {special.name.toLowerCase()} · L dash · E interact · Tab menu · M sound {s.settings.muted ? "off" : "on"}
      </div>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "achievement" && <span className="toast-trophy">★</span>}
          {t.icon && <img src={t.icon} alt="" className="px-icon toast-icon" />}
          <div>
            {t.kind === "achievement" && <div className="toast-kicker">Achievement unlocked</div>}
            <div className="toast-text">{t.text}</div>
            {t.sub && <div className="toast-sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
