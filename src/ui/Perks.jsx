import { PASSIVES, RARITIES, RARITY_ORDER, REROLL_COST } from "../game/data/passives.js";
import { CURRENCIES } from "../game/data/items.js";
import { choosePerk, getStats, rerollPerks } from "../game/state/actions.js";

/** @param {{ id: string, rank: number, hotkey?: number, onPick?: () => void }} props */
export function PassiveCard({ id, rank, hotkey, onPick }) {
  const p = PASSIVES[id];
  const r = RARITIES[p.rarity];
  const Tag = onPick ? "button" : "div";
  return (
    <Tag className={`perk-card rarity-${p.rarity}`} style={/** @type {import("react").CSSProperties} */ ({ "--rarity": r.color })} onClick={onPick}>
      {hotkey && <span className="perk-hotkey">{hotkey}</span>}
      <span className="perk-rarity">{r.label}</span>
      <span className="perk-icon" aria-hidden="true">
        {p.icon}
      </span>
      <span className="perk-name">{p.name}</span>
      <span className="perk-desc">{p.desc}</span>
      <span className="perk-pips" aria-label={`Rank ${rank} of ${p.max}`}>
        {Array.from({ length: p.max }, (_, i) => (
          <i key={i} className={i < rank ? "is-on" : ""} />
        ))}
      </span>
    </Tag>
  );
}

/**
 * Chance of each rarity per card, mirroring rollOffer's weighting.
 * @returns {[string, number][]}
 */
export function rarityOdds(s) {
  const luck = getStats(s).luck + s.hero.level * 0.02;
  const w = RARITY_ORDER.map((r, i) => RARITIES[r].weight * (1 + luck * i));
  const total = w.reduce((a, b) => a + b, 0);
  return RARITY_ORDER.map((r, i) => [r, w[i] / total]);
}

export function PerkPicker({ s }) {
  const [[cur, cost]] = Object.entries(REROLL_COST);
  return (
    <div className="overlay perk-overlay">
      <div className="perk-wrap">
        <div className="perk-kicker">Level {s.hero.level}</div>
        <h1>Choose a passive skill</h1>
        <p className="muted">{s.pendingPerks > 1 ? `${s.pendingPerks} picks waiting · ` : ""}press 1 – 3 or click a card</p>
        <div className="perk-cards">
          {s.perkOffer.map((id, i) => (
            <PassiveCard key={id} id={id} rank={s.passives[id] ?? 0} hotkey={i + 1} onPick={() => choosePerk(id)} />
          ))}
        </div>
        <button className="btn small reroll" onClick={rerollPerks} disabled={s.wallet[cur] < cost}>
          Reroll (R) · {cost}
          <img src={CURRENCIES[cur].icon} alt={CURRENCIES[cur].name} className="px-icon" />
        </button>
      </div>
    </div>
  );
}
