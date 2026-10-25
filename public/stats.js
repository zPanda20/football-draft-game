// Season statistics and awards: the league-wide player stats table, and the awards shown when a season ends.
import { st, esc, team, crest, pl, posGroup, tierOf } from "./core.js";
import { ratingClass } from "./rating.js";

// A player's season line as the server sends it (pd[id].x): games, goals, assists, chances created, tackles,
// interceptions, saves, average rating, shots, xG, goals against, Player of the Match awards, wins, clean sheets.
const X = { gp: 0, g: 1, a: 2, kp: 3, tk: 4, ic: 5, sv: 6, rt: 7, sh: 8, xg: 9, ga: 10, mo: 11, w: 12, cs: 13 };
const COLS = [
  ["gp", "GP", "Games played"], ["g", "G", "Goals"], ["a", "A", "Assists"], ["kp", "KP", "Chances created"], ["sh", "SH", "Shots"], ["xg", "xG", "Expected goals from their shots"],
  ["tk", "TK", "Tackles"], ["ic", "INT", "Interceptions"], ["sv", "SV", "Keeper saves"], ["ga", "GA", "Goals conceded while in the team"], ["cs", "CS", "Clean sheets as the keeper"],
  ["mo", "⭐", "Player of the Match awards"], ["w", "W", "Matches won while playing"], ["rt", "AVG", "Average match rating"],
];
const ui = () => (st.ui.ps = st.ui.ps || { k: "rt", dir: -1, scope: "all", pos: "all", n: 25 });
const val = (p, k) => (p.x ? p.x[X[k]] || 0 : 0);

export const statsHandlers = {
  psort(a) { const u = ui(); if (u.k === a.k) u.dir = -u.dir; else { u.k = a.k; u.dir = -1; } st.render(); },
  psscope(a) { ui().scope = a.value; st.render(); },
  pspos(a) { ui().pos = a.value; st.render(); },
  psmore() { const u = ui(); u.n = u.n > 25 ? 25 : 500; st.render(); },
};

export function playerStats(S) {
  const u = ui(), me = S.me ? S.me.teamId : -1;
  const rows = [];
  for (const t of S.teams) {
    if (u.scope === "mine" && t.id !== me) continue;
    if (u.scope.startsWith("t") && u.scope !== "all" && u.scope !== "mine" && t.id !== +u.scope.slice(1)) continue;
    for (const id of t.players) { const p = pl(id); if (p && p.x && p.x[0] > 0 && (u.pos === "all" || posGroup(p.pos) === u.pos)) rows.push({ p, t }); }
  }
  const most = Math.max(0, ...rows.map((r) => r.p.x[0]));
  const needGp = u.k === "rt" ? Math.min(3, most) : 0;                       // an average over one game is not a ranking
  const list = rows.filter((r) => r.p.x[0] >= needGp).sort((a, b) => -u.dir * (val(b.p, u.k) - val(a.p, u.k)) || val(b.p, "g") - val(a.p, "g") || a.p.id - b.p.id);
  const shown = list.slice(0, u.n);
  const fmt = (k, v) => (k === "rt" ? v.toFixed(2) : k === "xg" ? v.toFixed(1) : v);
  const scopes = [["all", "Whole league"], ...(me >= 0 ? [["mine", "My squad"]] : []), ...S.teams.map((t) => ["t" + t.id, t.name])];
  const head = COLS.map(([k, l, tip]) => `<th class="n sortable ${u.k === k ? "on" : ""}" data-act="psort" data-k="${k}" title="${tip}">${l}${u.k === k ? (u.dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("");
  const body = shown.map((r, i) => { const x = r.p.x, gk = r.p.pos === "GK";
    return `<tr class="${r.t.id === me ? "me" : ""}"><td class="mute">${i + 1}</td><td><div class="bootn">${crest(r.t, 14)}<b>${esc(r.p.name)}</b><span class="pg pg-${posGroup(r.p.pos)}">${esc(r.p.pos)}</span></div></td>${COLS.map(([k]) => {
      const v = val(r.p, k); if (k === "rt") return `<td class="n"><span class="rt ${ratingClass(v)}">${v.toFixed(1)}</span></td>`;
      const dim = (gk && ["g", "a", "sh", "xg", "kp"].includes(k) && !v) || (!gk && ["sv", "cs", "ga"].includes(k)); return `<td class="n ${dim || !v ? "mute" : ""} ${u.k === k ? "on" : ""}">${dim ? "–" : fmt(k, v)}</td>`; }).join("")}</tr>`; }).join("");
  return `<div class="card"><div class="row wrap" style="gap:8px"><h3 style="margin:0">Player stats, this season</h3><div class="grow"></div>
      <select data-change="psscope" title="Whose players">${scopes.map(([v, l]) => `<option value="${v}" ${u.scope === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <select data-change="pspos" title="Position group">${[["all", "All positions"], ["gk", "Keepers"], ["def", "Defenders"], ["mid", "Midfielders"], ["att", "Attackers"]].map(([v, l]) => `<option value="${v}" ${u.pos === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${shown.length ? `<div class="tbwrap mt"><table class="tb stats"><tr><th>#</th><th>Player</th>${head}</tr>${body}</table></div>
      ${list.length > 25 ? `<div class="row mt"><button class="btn sm" data-act="psmore">${u.n > 25 ? "Show top 25" : `Show all ${list.length}`}</button><span class="tiny mute grow">Tap a column to sort.${u.k === "rt" ? ` Average rating needs ${needGp} games.` : ""}</span></div>` : `<p class="tiny mute mt">Tap a column to sort.</p>`}` : `<p class="mute small mt">Nothing to show yet: stats fill in as matches are played.</p>`}
    <p class="tiny mute mt">Tracked every match: goals, assists, chances created (KP), shots, expected goals, tackles, interceptions, saves, goals conceded, clean sheets, Player of the Match awards (⭐, the best rating of a game), wins and the average Sofascore-style rating.</p></div>`;
}

// ---------- season awards ----------
const nm = (r) => esc(r.name || (pl(r.id) ? pl(r.id).name : "?"));
const tm = (r) => { const t = team(r.team); return t ? `${crest(t, 16)}<span class="mute small">${esc(t.name)}</span>` : ""; };
const pos = (r) => { const p = pl(r.id); return p ? `<span class="pg pg-${posGroup(p.pos)}">${esc(p.pos)}</span>` : ""; };
const BAL = [["rating", "Sofascore rating"], ["contrib", "Goals + assists"], ["potm", "Player of the Match"], ["wins", "Wins"], ["star", "Star power"]];
// One award: the winner big, the runners-up underneath. `line` is the numbers shown for each name.
function award(i, icon, title, sub, list, line, hero = false) {
  const w = list[0]; if (!w) return `<div class="award" style="--i:${i}"><div class="ahead"><span class="aico">${icon}</span><div><b>${title}</b><div class="tiny mute">${sub}</div></div></div><p class="mute small">Nobody qualified this season.</p></div>`;
  const me = st.S && st.S.me ? st.S.me.teamId : -1, p = pl(w.id);
  const face = p ? `<span class="aface ${tierOf(p.ovr)}">${p.ovr}</span>` : "";
  return `<div class="award ${hero ? "hero" : ""} ${w.team === me ? "mine" : ""}" style="--i:${i}"><div class="ahead"><span class="aico">${icon}</span><div><b>${title}</b><div class="tiny mute">${sub}</div></div></div>
    <div class="awin">${face}<div class="grow"><div class="aname">${nm(w)}</div><div class="row" style="gap:6px">${pos(w)}${tm(w)}</div></div><div class="anum">${line(w, true)}</div></div>
    ${hero && w.parts ? `<div class="abars">${BAL.map(([k, l]) => `<div class="abar" title="${l}: ${Math.round((w.parts[k] || 0) * 100)}% of the best in the league"><span>${l}</span><i style="--w:${Math.round((w.parts[k] || 0) * 100)}%"></i></div>`).join("")}</div>` : ""}
    ${list.length > 1 ? `<div class="aruns">${list.slice(1, hero ? 5 : 3).map((r, k) => `<div class="arun ${r.team === me ? "me" : ""}"><span class="mute">${k + 2}</span><span class="grow">${nm(r)} ${tm(r)}</span><span>${line(r, false)}</span></div>`).join("")}</div>` : ""}</div>`;
}
export function awardsCard(S) {
  const A = S.reveal && S.reveal.awards; if (!A) return "";
  const rt = (r) => `<span class="rt ${ratingClass(r.rt)}">${r.rt.toFixed(1)}</span>`;
  return `<div class="card awards"><h3>Season awards</h3><div class="awgrid">
    ${award(3, "🏆", "Ballon d'Or", "Best player of the season: rating, goals + assists, Player of the Match awards, wins and star power", A.ballon, (r, big) => `<b>${r.score.toFixed(1)}</b>${big ? `<small>score · ${rt(r)} avg · ${r.g}G ${r.a}A · ⭐${r.mo}</small>` : `<small>${rt(r)} · ${r.g}G ${r.a}A · ⭐${r.mo}</small>`}`, true)}
    ${award(0, "⚽", "Golden Boot", "Most goals", A.boot, (r, big) => `<b>${r.g}</b><small>${big ? `goals in ${r.gp} games · ${r.a} assists` : `goals`}</small>`)}
    ${award(1, "🎯", "Playmaker Award", "Most assists", A.playmaker, (r, big) => `<b>${r.a}</b><small>${big ? `assists · ${r.kp} chances created` : `assists`}</small>`)}
    ${award(2, "🧤", "Golden Glove", "Most clean sheets by a keeper", A.glove, (r, big) => `<b>${r.cs}</b><small>${big ? `clean sheets · ${Math.round(r.sp * 100)}% saved · ${r.ga} conceded` : `clean sheets`}</small>`)}
  </div></div>`;
}
