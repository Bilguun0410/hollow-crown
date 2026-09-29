import { ACHIEVEMENTS } from "../game/data/achievements.js";
import { CHARACTERS } from "../game/data/characters.js";
import { CONSUMABLES, formatStat, gearSet, ITEMS, SLOT_LABELS, slotsFor, STAT_LABELS } from "../game/data/items.js";
import { BOSS_TYPES, MONSTERS } from "../game/data/monsters.js";
import { closeOverlay, equip, expToNext, getStats, MAX_LEVEL, unequip, useConsumable } from "../game/state/actions.js";
import { PASSIVES, RARITIES, RARITY_ORDER } from "../game/data/passives.js";
import { store } from "../game/state/store.js";
import { Bar, Currency } from "./Hud.jsx";
import { PassiveCard, rarityOdds } from "./Perks.jsx";

const TABS = [
  ["hero", "Hero"],
  ["passives", "Passives"],
  ["inventory", "Inventory"],
  ["achievements", "Achievements"],
];

const CORE_STATS = ["maxHp", "maxMp", "atk", "def", "speed", "stamina", "critRate", "critDmg"];
const BONUS_STATS = ["expBoost", "gemBoost", "dropBoost", "lifesteal", "hpRegen", "mpRegen", "mpOnKill", "dodge", "thorns", "reach", "dashCdr", "sprintMult", "luck"];

function coreValue(k, v) {
  if (k === "critRate") return `${Math.round(v * 100)}%`;
  if (k === "critDmg") return `×${v.toFixed(2)}`;
  return v;
}

export function Menu({ s }) {
  const setTab = (menuTab) => store.set({ menuTab });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className="window panel">
        <div className="window-head">
          <div className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={s.menuTab === id} className={`tab ${s.menuTab === id ? "is-active" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={closeOverlay} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="window-body">
          {s.menuTab === "hero" && <HeroTab s={s} />}
          {s.menuTab === "passives" && <PassivesTab s={s} />}
          {s.menuTab === "inventory" && <InventoryTab s={s} />}
          {s.menuTab === "achievements" && <AchievementsTab s={s} />}
        </div>
        <div className="window-foot">Esc / Tab to close · game is paused</div>
      </div>
    </div>
  );
}

function HeroTab({ s }) {
  const ch = CHARACTERS[s.hero.characterId];
  const st = getStats(s);
  const { hero, counters } = s;
  const maxed = hero.level >= MAX_LEVEL;
  const bonuses = BONUS_STATS.filter((k) => st[k] > 0);
  return (
    <div className="hero-tab">
      <div className="fullbody">
        <img src={ch.art.fullbody} alt={ch.className} />
      </div>
      <div className="hero-sheet">
        <h2>{hero.name}</h2>
        <div className="muted">
          {ch.className} · Level {hero.level}
        </div>
        <div className="exp-line">
          <Bar kind="exp" value={maxed ? 1 : hero.exp} max={maxed ? 1 : expToNext(hero.level)} showNumbers={false} />
          <span>{maxed ? "MAX" : `${hero.exp} / ${expToNext(hero.level)} EXP`}</span>
        </div>
        <table className="stats">
          <tbody>
            {CORE_STATS.map((k) => (
              <tr key={k}>
                <th>{STAT_LABELS[k]}</th>
                <td>{coreValue(k, st[k])}</td>
                <td className="muted">{s.blessings[k] ? `blessed ${formatStat(k, s.blessings[k])}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bonuses.length > 0 && (
          <div className="stat-chips bonus-chips">
            {bonuses.map((k) => (
              <span key={k} className="chip">
                {STAT_LABELS[k]} {formatStat(k, st[k])}
              </span>
            ))}
          </div>
        )}
        <h3>Journal</h3>
        <ul className="journal">
          <li>Monsters defeated: {counters.totalKills}</li>
          {Object.entries(counters.kills).map(([type, n]) => (
            <li key={type} className="muted">
              {MONSTERS[type]?.name ?? type}: {n}
            </li>
          ))}
          <li>Grass &amp; bushes cut: {counters.cut}</li>
          <li>Gems collected: {counters.gemsEarned}</li>
          <li>
            Bosses felled: {s.world.bossesDefeated.length} / {Object.keys(BOSS_TYPES).length}
          </li>
          <li>Hidden bosses felled: {Object.values(counters.worldBossKills ?? {}).reduce((a, b) => a + b, 0)}</li>
          <li>Times fallen: {counters.deaths}</li>
        </ul>
      </div>
      <div className="controls">
        <h3>Controls</h3>
        <dl>
          <dt>WASD / Arrows</dt>
          <dd>Move</dd>
          <dt>J / Space</dt>
          <dd>Sword slash (cuts grass)</dd>
          <dt>K</dt>
          <dd>
            {ch.skills.special.name} ({ch.skills.special.mpCost} MP)
          </dd>
          <dt>Shift (hold)</dt>
          <dd>Sprint (uses stamina)</dd>
          <dt>L</dt>
          <dd>Dash (brief invulnerability)</dd>
          <dt>E</dt>
          <dd>Open chests, pray at shrine</dd>
          <dt>1 / 2</dt>
          <dd>Red Tonic / Blue Ether</dd>
          <dt>Tab / I</dt>
          <dd>This menu</dd>
          <dt>M</dt>
          <dd>Toggle sound</dd>
        </dl>
      </div>
    </div>
  );
}

function PassivesTab({ s }) {
  const owned = Object.entries(s.passives)
    .filter(([id, rank]) => PASSIVES[id] && rank > 0)
    .sort(([a], [b]) => RARITY_ORDER.indexOf(PASSIVES[b].rarity) - RARITY_ORDER.indexOf(PASSIVES[a].rarity));
  const learned = owned.reduce((n, [, rank]) => n + rank, 0);
  return (
    <div>
      <div className="odds">
        <span className="muted">Offer odds per card:</span>
        {rarityOdds(s).map(([r, p]) => (
          <span key={r} className="odds-item" style={{ color: RARITIES[r].color }}>
            {RARITIES[r].label} {(p * 100).toFixed(p < 0.1 ? 1 : 0)}%
          </span>
        ))}
      </div>
      <h3>
        Learned · {learned} rank{learned === 1 ? "" : "s"}
      </h3>
      {owned.length === 0 && <p className="muted">Each level up lets you choose one of three passive skills. Rarer tiers hold stronger and stranger powers.</p>}
      <div className="perk-grid">
        {owned.map(([id, rank]) => (
          <PassiveCard key={id} id={id} rank={rank} />
        ))}
      </div>
    </div>
  );
}

function StatList({ stats }) {
  return (
    <div className="stat-chips">
      {Object.entries(stats).map(([k, v]) => (
        <span key={k} className="chip">
          {STAT_LABELS[k]} {formatStat(k, v)}
        </span>
      ))}
    </div>
  );
}

function InventoryTab({ s }) {
  const slots = slotsFor(s.hero.characterId);
  // Only this hero's gear counts; other heroes' pieces never drop for them.
  const set = Object.values(gearSet(s.hero.characterId));
  const owned = s.owned.filter((id) => set.includes(id));
  return (
    <div className="inventory-tab">
      <section>
        <h3>Equipment</h3>
        <div className="equip-grid" style={/** @type {import("react").CSSProperties} */ ({ "--cols": slots.length > 5 ? 4 : 5 })}>
          {slots.map((slot) => {
            const id = s.equipment[slot];
            return (
              <button key={slot} className={`equip-slot ${id ? "is-filled" : ""}`} onClick={() => id && unequip(slot)} title={id ? "Click to unequip" : "Empty"}>
                <span className="equip-label">{SLOT_LABELS[slot]}</span>
                {id ? <img src={ITEMS[id].icon} alt={ITEMS[id].name} /> : <span className="empty">—</span>}
              </button>
            );
          })}
        </div>
        <h3>Wallet</h3>
        <div className="wallet-row">
          <Currency id="gems" value={s.wallet.gems} />
          <Currency id="shards" value={s.wallet.shards} />
        </div>
        <h3>Satchel</h3>
        <div className="consumables">
          {Object.entries(CONSUMABLES).map(([id, c]) => (
            <div key={id} className="consumable">
              <img src={c.icon} alt="" className="px-icon" />
              <div>
                <div>
                  {c.name} <span className="muted">×{s.bag[id] ?? 0}</span>
                </div>
                <div className="muted small">{c.desc} Hotkey {c.hotkey}.</div>
              </div>
              <button className="btn small" disabled={!s.bag[id]} onClick={() => useConsumable(id)}>
                Use
              </button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Found gear</h3>
        {owned.length === 0 && <p className="muted">Nothing yet. Chests hide gear across the land, and bosses guard more.</p>}
        <div className="items">
          {owned.map((id) => {
            const item = ITEMS[id];
            const equipped = s.equipment[item.slot] === id;
            return (
              <div key={id} className={`item-card ${equipped ? "is-equipped" : ""}`}>
                <img src={item.icon} alt="" />
                <div className="item-body">
                  <div className="item-name">
                    {item.name} <span className="muted small">· {SLOT_LABELS[item.slot]}</span>
                  </div>
                  <StatList stats={item.stats} />
                  <div className="muted small">{item.desc}</div>
                </div>
                <button className="btn small" onClick={() => (equipped ? unequip(item.slot) : equip(id))}>
                  {equipped ? "Unequip" : "Equip"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="muted small">
          {set.length - owned.length} more pieces of gear to discover.
        </p>
      </section>
    </div>
  );
}

function AchievementsTab({ s }) {
  const done = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  return (
    <div>
      <div className="ach-summary">
        {done} / {ACHIEVEMENTS.length} unlocked
      </div>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = !!s.achievements[a.id];
          const [cur, goal] = a.progress(s);
          return (
            <div key={a.id} className={`ach ${unlocked ? "is-unlocked" : ""}`}>
              <div className="ach-icon">{unlocked ? "★" : "☆"}</div>
              <div className="ach-body">
                <div className="ach-name">{a.name}</div>
                <div className="muted small">{a.desc}</div>
                {!unlocked && goal > 1 && (
                  <div className="ach-progress">
                    <Bar kind="exp" value={Math.min(cur, goal)} max={goal} showNumbers={false} />
                    <span className="small">
                      {Math.min(cur, goal)}/{goal}
                    </span>
                  </div>
                )}
              </div>
              <div className="ach-reward small">+{a.reward}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
