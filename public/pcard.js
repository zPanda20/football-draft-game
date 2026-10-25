// The full player card: open it from the little "i" on any player card or row (tactics, trades, transfers, squads).
import { st, $, esc, card, pl, flag, team, crest, coins, STATS, GKSTATS, tierOf } from "./core.js";

export const pcardHandlers = {
  pcard(a) { st.ui.pcId = +a.id; pcardSync(); },
  pcardClose() { st.ui.pcId = null; pcardSync(); },
};

const bar = (label, v) => `<div class="pcbar"><span>${label}</span><i><b class="${v >= 85 ? "hi" : v >= 70 ? "mid" : ""}" style="width:${Math.max(4, Math.min(100, ((v - 30) / 69) * 100))}%"></b></i><em>${v}</em></div>`;
function body(id) {
  const p = pl(id); if (!p) return `<div class="pc-in"><p class="mute">That player is not available.</p></div>`;
  const gk = p.pos === "GK", labels = gk ? GKSTATS : STATS, t = p.team != null ? team(p.team) : null;
  const x = p.x;
  const season = x ? `<div class="pcseason"><h4>This season</h4><div class="pcgrid">
      <span><b>${x[0]}</b>games</span><span><b>${x[1]}</b>goals</span><span><b>${x[2]}</b>assists</span><span><b>${x[3]}</b>key passes</span><span><b>${x[4]}</b>tackles</span><span><b>${x[5]}</b>intercepts</span>
      <span><b>${x[6]}</b>saves</span><span><b>${x[7].toFixed(2)}</b>avg rating</span><span><b>${x[8]}</b>shots</span><span><b>${x[9]}</b>xG</span><span><b>${x[11]}</b>PotM</span><span><b>${x[12]}</b>wins</span>
      ${gk ? `<span><b>${x[13]}</b>clean sheets</span><span><b>${x[10]}</b>conceded</span>` : ""}</div></div>` : `<div class="pcseason"><h4>This season</h4><p class="small mute">No games played yet.</p></div>`;
  const rows = [
    ["Age", `${p.age}`], ["Nation", `${flag(p.nat)} ${esc(p.nat || "")}`],
    ["Plays for", t ? `<span class="row" style="gap:6px;display:inline-flex">${crest(t, 18)} ${esc(t.name)}</span>` : p.team == null ? "Free agent" : "?"],
    p.user ? null : ["Real club", esc(p.club || "")],
    ["Contract", t ? `${p.contract} season${p.contract === 1 ? "" : "s"} left` : "None"],
    ["Market value", coins(p.mv || 0)], ["Stamina", `${Math.round(p.stam)}%`],
    p.pot ? ["Potential", { low: "Low", med: "Medium", high: "High" }[p.pot] || p.pot] : null,
    p.susp ? ["Suspended", `${p.susp} game${p.susp > 1 ? "s" : ""}`] : null,
  ].filter(Boolean).map(([k, v]) => `<div class="pcrow"><span>${k}</span><b>${v}</b></div>`).join("");
  return `<div class="pc-in"><button class="pc-x" data-act="pcardClose" aria-label="Close">✕</button>
    <div class="pc-left">${card(id, { size: "lg" })}</div>
    <div class="pc-right"><h3 style="margin:0">${esc(p.name)} <span class="mute small">${esc(p.pos)} · OVR ${p.ovr}</span></h3>
      <div class="pcrows mt">${rows}</div>
      <div class="pcbars mt">${labels.map((l, i) => bar(l, p.st[i])).join("")}</div>${season}</div></div>`;
}
export function pcardSync() {
  const app = $("#app"); if (!app) return;
  let el = $("#pcmodal");
  if (st.ui.pcId == null) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "pcmodal"; el.className = "pcmodal"; app.appendChild(el); el.addEventListener("click", (e) => { if (e.target === el) pcardHandlers.pcardClose(); }); }
  const html = body(st.ui.pcId); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.ui.pcId != null) pcardHandlers.pcardClose(); });
