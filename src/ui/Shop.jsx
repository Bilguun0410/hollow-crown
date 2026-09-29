import { CONSUMABLES, CURRENCIES, SHOP, shopPrice, STAT_LABELS } from "../game/data/items.js";
import { BOSS_TYPES, bossForTier, REMATCH_COST } from "../game/data/monsters.js";
import { bossPresent, bossTier, buy, closeOverlay, summonBoss } from "../game/state/actions.js";
import { Currency } from "./Hud.jsx";

function Price({ price }) {
  return Object.entries(price).map(([cur, n]) => (
    <span key={cur} className="price">
      <img src={CURRENCIES[cur].icon} alt={CURRENCIES[cur].name} className="px-icon" />
      {n}
    </span>
  ));
}

/** Defeated bosses can be called back early; each return is one tier stronger. */
function Rematches({ s }) {
  const defeated = s.world.bossesDefeated;
  if (!defeated.length) return null;
  const affordable = Object.entries(REMATCH_COST).every(([cur, n]) => s.wallet[cur] >= n);
  return (
    <>
      <h3>Rematch</h3>
      {defeated.map((id) => {
        const tier = bossTier(s, id);
        const present = bossPresent(s, id);
        const mins = Math.max(1, Math.ceil(((s.world.bossReturnsAt?.[id] ?? 0) - Date.now()) / 60000));
        const next = bossForTier(id, tier);
        return (
          <div key={id} className="shop-row">
            <span className="bless-icon rematch-icon">☠</span>
            <div className="shop-body">
              <div>
                {BOSS_TYPES[id].name} <span className="muted small">· Empowered ★{tier}</span>
              </div>
              <div className="muted small">
                {present ? "Awaits you in its lair." : `Returns on its own in ~${mins} min.`} {next.hp} HP · {next.exp} EXP
              </div>
            </div>
            {!present && <Price price={REMATCH_COST} />}
            <button className="btn small" disabled={present || !affordable} onClick={() => summonBoss(id)}>
              {present ? "Waiting" : "Summon"}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function Shop({ s }) {
  const row = (entry) => {
    const price = shopPrice(entry, s.purchases[entry.id] ?? 0);
    const affordable = Object.entries(price).every(([cur, n]) => s.wallet[cur] >= n);
    const isItem = entry.kind === "consumable";
    const c = isItem ? CONSUMABLES[entry.item] : null;
    return (
      <div key={entry.id} className="shop-row">
        {isItem ? <img src={c.icon} alt="" className="px-icon" /> : <span className="bless-icon">✦</span>}
        <div className="shop-body">
          <div>{isItem ? c.name : entry.name}</div>
          <div className="muted small">
            {isItem ? `${c.desc} You carry ${s.bag[entry.item] ?? 0}.` : `Permanently +${entry.amount} ${STAT_LABELS[entry.stat]}. Bought ${s.purchases[entry.id] ?? 0}×.`}
          </div>
        </div>
        <Price price={price} />
        <button className="btn small" disabled={!affordable} onClick={() => buy(entry.id)}>
          Buy
        </button>
      </div>
    );
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className="window panel shop">
        <div className="window-head">
          <h2>Shrine of Echoes</h2>
          <button className="icon-btn" onClick={closeOverlay} aria-label="Close shop">
            ✕
          </button>
        </div>
        <div className="window-body">
          <p className="shrine-note">Your wounds close and your journey is recorded. The shrine accepts offerings.</p>
          <div className="wallet-row">
            <Currency id="gems" value={s.wallet.gems} />
            <Currency id="shards" value={s.wallet.shards} />
          </div>
          <h3>Supplies</h3>
          {SHOP.filter((e) => e.kind === "consumable").map(row)}
          <h3>Blessings</h3>
          {SHOP.filter((e) => e.kind === "blessing").map(row)}
          <Rematches s={s} />
        </div>
        <div className="window-foot">Esc to leave · soul shards drop from Bonewalkers and bosses</div>
      </div>
    </div>
  );
}
