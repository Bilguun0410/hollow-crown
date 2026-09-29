import { useState } from "react";
import { ACHIEVEMENTS } from "../game/data/achievements.js";
import { CHARACTERS, DEFAULT_CHARACTER } from "../game/data/characters.js";
import { closeOverlay, continueGame, newGame, respawn } from "../game/state/actions.js";
import { sfx } from "../game/sfx.js";

const LOCKED_SLOTS = ["Coming soon"];

// Quick comparison bars on the title screen: [stat, label, value that fills the bar].
/** @type {[string, string, number][]} */
const STAT_BARS = [
  ["maxHp", "HP", 200],
  ["atk", "ATK", 20],
  ["def", "DEF", 5],
  ["speed", "SPD", 180],
];

export function TitleScreen({ s }) {
  const [characterId, setCharacterId] = useState(DEFAULT_CHARACTER);
  const ch = CHARACTERS[characterId];
  const [name, setName] = useState(ch.defaultName);
  const ready = s.assetsReady;

  const pick = (id) => {
    // Swap in the new hero's default name unless the player typed their own.
    if (name === ch.defaultName) setName(CHARACTERS[id].defaultName);
    setCharacterId(id);
  };

  const start = () => {
    sfx.unlock();
    if (s.hasSave && !window.confirm(`Start over? This replaces ${s.savedName}'s saved journey.`)) return;
    newGame(name, characterId);
  };

  return (
    <div className="title-screen">
      <div className="title-inner">
        <h1 className="logo">Hollow Crown</h1>
        <p className="tagline">A tale of moss, bone and shadow</p>

        <div className="title-cols">
          <div className="panel hero-select">
            <h3>Choose your hero</h3>
            <div className="hero-slots">
              {Object.values(CHARACTERS).map((c) => (
                <button key={c.id} className={`hero-slot ${c.id === characterId ? "is-selected" : ""}`} aria-pressed={c.id === characterId} onClick={() => pick(c.id)}>
                  <img src={c.art.avatar} alt="" />
                  <span>{c.className}</span>
                </button>
              ))}
              {LOCKED_SLOTS.map((label, i) => (
                <div key={i} className="hero-slot is-locked" aria-disabled="true">
                  <span className="lock">?</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="muted">{ch.description}</p>
            <div className="hero-compare">
              <div className="stat-bars">
                {STAT_BARS.map(([k, label, full]) => (
                  <div key={k} className="stat-bar">
                    <span>{label}</span>
                    <div>
                      <i style={{ width: `${Math.min(100, (Math.min(Number(ch.baseStats[k]), full) / full) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <ul className="traits">
                {ch.traits.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <label className="name-field">
              <span>Name</span>
              <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ready && start()} />
            </label>
          </div>

          <div className="title-menu">
            {s.hasSave && (
              <button
                className="btn primary"
                disabled={!ready}
                onClick={() => {
                  sfx.unlock();
                  continueGame();
                }}
              >
                Continue · {s.savedName}
                {CHARACTERS[s.savedCharacter] && ` (${CHARACTERS[s.savedCharacter].className})`}
              </button>
            )}
            <button className={`btn ${s.hasSave ? "" : "primary"}`} disabled={!ready} onClick={start}>
              New game
            </button>
            <div className="panel title-help">
              <div>
                <b>WASD</b> move · <b>Shift</b> sprint · <b>J</b> slash
              </div>
              <div>
                <b>K</b> {ch.skills.special.name.toLowerCase()} · <b>L</b> dash · <b>E</b> interact · <b>Tab</b> menu
              </div>
              <div className="muted">Slay monsters, loot chests, fell the two bosses.</div>
            </div>
            {!ready && (
              <div className="loading" aria-label="Loading">
                <div style={{ width: `${Math.round(s.assetsLoaded * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ s }) {
  const ch = CHARACTERS[s.hero.characterId];
  const penalty = Math.floor(s.wallet.gems * 0.1);
  return (
    <div className="overlay gameover">
      <div className="gameover-inner">
        <img src={ch.poses.die.url} alt="" className="px-icon die-pose" />
        <h1>You have fallen</h1>
        <p className="muted">The shrine's light calls you back{penalty ? ` — it asks ${penalty} gems in return` : ""}.</p>
        <button className="btn primary" onClick={respawn} autoFocus>
          Rise again
        </button>
      </div>
    </div>
  );
}

export function Victory({ s }) {
  const done = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  return (
    <div className="overlay">
      <div className="window panel victory">
        <h1>The Hollow Crown shatters</h1>
        <p>The sanctum falls silent. {s.hero.name}, the land is yours to wander.</p>
        <ul className="journal">
          <li>Level {s.hero.level}</li>
          <li>{s.counters.totalKills} monsters defeated</li>
          <li>{s.counters.gemsEarned} gems collected</li>
          <li>
            {done} / {ACHIEVEMENTS.length} achievements
          </li>
        </ul>
        <p className="muted small">This is the end of the prototype. Keep exploring to finish your achievements.</p>
        <button className="btn primary" onClick={closeOverlay}>
          Keep exploring
        </button>
      </div>
    </div>
  );
}
