import { createRoot } from "react-dom/client";
import { App } from "./ui/App.jsx";
import { createGame } from "./game/game.js";
import { detectSave } from "./game/state/actions.js";
import * as actions from "./game/state/actions.js";
import { events, store } from "./game/state/store.js";

detectSave();
createRoot(document.getElementById("ui")).render(<App />);
const game = createGame("game");

// Dev-only console handle: __rpg.store.get(), __rpg.actions.gainExp(100), …
if (process.env.NODE_ENV !== "production") {
  // __rpg.summon("eclipse" | "bound") calls a hidden boss without its condition.
  window.__rpg = { game, store, actions, summon: (id) => events.emit("debug:summon", id) };
}
