// The look of the game: "Synth" (neon panels, glitch used only as motion) and "Glass" (frosted panels, soft dreamcore motion).
// Each person picks Auto, Synth or Glass. Auto follows the mode: Full plays in Synth, Lite plays in Glass. Saved in this browser only.
import { st } from "./core.js";
import { isLite } from "./lite.js";

const KEY = "fd_look";
export const LOOKS = [["auto", "Auto"], ["synth", "Synth"], ["glass", "Glass"]];
export function pref() {
  let v = st.ui && st.ui.look; if (!v) { try { v = localStorage.getItem(KEY); } catch {} }
  return v === "synth" || v === "glass" ? v : "auto";
}
function liteNow(S) {
  if (!S) return false;
  if (S.step === "lobby") { const y = S.players && S.players.find((p) => p.you); if (!y || y.mode === "player") return false; return !!y.lite; }
  return isLite(S);
}
export const lookOf = (S) => { const p = pref(); return p !== "auto" ? p : liteNow(S) ? "glass" : "synth"; };

const DECOR = `<div class="lk-decor" aria-hidden="true"><i class="lk-scan"></i><i class="lk-b1"></i><i class="lk-b2"></i><i class="lk-haze"></i>${[8, 24, 41, 57, 73, 90].map((x, i) => `<i class="lk-mote" style="left:${x}%;animation-delay:-${i * 2.7}s"></i>`).join("")}</div>`;

// Called on every render (and on the landing page, with S = null).
export function applyLook(S) {
  const b = document.body, v = lookOf(S);
  if (b.dataset.look !== v) b.dataset.look = v;
  b.dataset.lookPref = pref();
  const bg = document.getElementById("bg"); if (bg && !bg.firstChild) bg.innerHTML = DECOR;
  // the logo splits for a blink in Synth: it needs its own text to copy
  for (const n of document.querySelectorAll(".logo:not([data-t])")) n.dataset.t = "Football Draft";
}

export function lookPicker() {
  const p = pref();
  return `<div class="lookpick row wrap"><span class="small mute">Look</span>${LOOKS.map(([k, n]) => `<button class="btn sm ${p === k ? "on" : ""}" data-act="look" data-v="${k}">${n}</button>`).join("")}
    <span class="tiny mute">Auto uses Synth for Full and Glass for Lite. Only changes this browser.</span></div>`;
}

export const lookHandlers = {
  look(a) { const v = a.v === "synth" || a.v === "glass" ? a.v : "auto"; st.ui.look = v; try { v === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch {} st.S && st.render ? st.render() : applyLook(st.S); },
  lookNext() { const o = ["auto", "synth", "glass"], n = o[(o.indexOf(pref()) + 1) % 3]; lookHandlers.look({ v: n }); },
};
