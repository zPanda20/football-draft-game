// Season tables after the fact: the all-time table (every finished season added together) and any single past season's final table.
// Seasons that were saved before full tables were kept only know their top three, and are listed without a table.
import { st, esc, team, chip, userTags } from "./core.js";

export const histHandlers = {
  histSeason(a) { st.ui.histSeason = a.s === "all" ? "all" : +a.s; st.render(); },
  histToggle(a) { st.ui.histOpen = a.cur !== "1"; st.render(); },
};
const rows = (h) => (h.tab || []).map(([i, p, w, d, l, gf, ga, pts]) => ({ i, p, w, d, l, gf, ga, gd: gf - ga, pts }));
export function allTime(history) {
  const m = new Map();
  for (const h of history) for (const r of rows(h)) {
    const a = m.get(r.i) || { i: r.i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, seasons: 0, titles: 0, best: 99 };
    a.p += r.p; a.w += r.w; a.d += r.d; a.l += r.l; a.gf += r.gf; a.ga += r.ga; a.pts += r.pts; a.seasons++;
    m.set(r.i, a);
  }
  for (const h of history) { const a = m.get(h.champion); if (a) a.titles++; const sorted = rows(h); sorted.forEach((r, k) => { const x = m.get(r.i); if (x) x.best = Math.min(x.best, k + 1); }); }
  return [...m.values()].map((a) => ({ ...a, gd: a.gf - a.ga })).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.i - y.i);
}
export function historyCard(S, { collapsible = false, open: openDefault = false } = {}) {
  const h = (S.history || []).filter((x) => x.tab);
  if (!h.length) return "";
  const open = !collapsible || (st.ui.histOpen ?? openDefault), me = S.me ? S.me.teamId : S.pm && S.pm.team != null ? S.pm.team : -1;
  const sel = st.ui.histSeason === undefined || (st.ui.histSeason !== "all" && !h.some((x) => x.season === st.ui.histSeason)) ? "all" : st.ui.histSeason;
  const tabs = `<div class="row wrap" style="gap:6px"><button class="btn sm ${sel === "all" ? "pri" : ""}" data-act="histSeason" data-s="all">All seasons</button>${h.map((x) => `<button class="btn sm ${sel === x.season ? "pri" : ""}" data-act="histSeason" data-s="${x.season}">Season ${x.season}</button>`).join("")}</div>`;
  let body;
  if (sel === "all") {
    const t = allTime(h);
    body = `<table class="tb mt"><tr><th>#</th><th>Team</th><th class="n" title="Seasons played">S</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th><th class="n" title="Points per match">PPM</th><th class="n" title="League titles">🏆</th><th class="n" title="Best finish">Best</th></tr>
      ${t.map((r, k) => `<tr class="${r.i === me ? "me" : ""}"><td>${k + 1}</td><td>${chip(team(r.i), 18)}${userTags(team(r.i))}</td><td class="n">${r.seasons}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n"><b>${r.pts}</b></td><td class="n">${r.p ? (r.pts / r.p).toFixed(2) : "–"}</td><td class="n">${r.titles || ""}</td><td class="n">${r.best < 99 ? r.best : "–"}</td></tr>`).join("")}</table>
      <p class="tiny mute mt">Every finished season added together. Ties are split on goal difference, then goals scored.</p>`;
  } else {
    const x = h.find((y) => y.season === sel), t = rows(x);
    body = `<div class="row wrap mt" style="gap:10px"><span class="small mute">Champions</span>${chip(team(x.champion), 22, true)}${x.boot ? `<span class="small mute">· Golden Boot <b>${esc(x.boot.name)}</b> (${x.boot.g})</span>` : ""}</div>
      <table class="tb mt"><tr><th>#</th><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr>
      ${t.map((r, k) => `<tr class="${r.i === me ? "me" : ""} ${k === 0 ? "leader" : ""}"><td>${k + 1}</td><td>${chip(team(r.i), 18)}${userTags(team(r.i))}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n"><b>${r.pts}</b></td></tr>`).join("")}</table>`;
  }
  return `<div class="card histcard"><div class="row wrap"><h3 style="margin:0">History</h3><span class="small mute">${h.length} season${h.length === 1 ? "" : "s"} played</span><div class="grow"></div>${collapsible ? `<button class="btn sm" data-act="histToggle" data-cur="${open ? 1 : 0}">${open ? "Hide" : "Show"}</button>` : ""}</div>${open ? `<div class="mt">${tabs}</div>${body}` : ""}</div>`;
}
