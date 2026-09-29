import { useEffect } from "react";
import { useGame, store } from "../game/state/store.js";
import { choosePerk, closeOverlay, openOverlay, rerollPerks, respawn, toggleMute, useConsumable } from "../game/state/actions.js";
import { PerkPicker } from "./Perks.jsx";
import { sfx } from "../game/sfx.js";
import { Hud, Toasts } from "./Hud.jsx";
import { Menu } from "./Menu.jsx";
import { Shop } from "./Shop.jsx";
import { GameOver, TitleScreen, Victory } from "./Screens.jsx";

function useHotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      sfx.unlock();
      const s = store.get();
      if (e.target instanceof HTMLInputElement) return;
      if (s.screen === "dead" && e.key === "Enter") return respawn();
      if (s.screen !== "playing") return;
      const key = e.key.toLowerCase();
      if (key === "tab" || key === "i") {
        e.preventDefault();
        return s.overlay === "menu" ? closeOverlay() : !s.overlay && openOverlay("menu");
      }
      if (key === "escape") return s.overlay ? closeOverlay() : openOverlay("menu");
      if (key === "m") return toggleMute();
      if (s.overlay) return;
      if (s.perkOffer?.length) {
        const pick = s.perkOffer[Number(key) - 1];
        if (pick) choosePerk(pick);
        if (key === "r") rerollPerks();
        return;
      }
      if (key === "1") useConsumable("potion");
      if (key === "2") useConsumable("ether");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const s = useGame();
  useHotkeys();
  useEffect(() => sfx.setMuted(s.settings.muted), [s.settings.muted]);

  return (
    <>
      {s.screen === "title" ? <TitleScreen s={s} /> : <Hud s={s} />}
      {s.overlay === "menu" && <Menu s={s} />}
      {s.overlay === "shop" && <Shop s={s} />}
      {s.overlay === "victory" && <Victory s={s} />}
      {s.screen === "playing" && !s.overlay && s.perkOffer?.length > 0 && <PerkPicker s={s} />}
      {s.screen === "dead" && <GameOver s={s} />}
      <Toasts toasts={s.toasts} />
    </>
  );
}
