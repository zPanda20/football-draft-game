// Lite mode, per person. Lite plays like a CPU club: whatever is switched off is done for you the CPU's way, with no bonus and
// no discount. Hidden screens stay one tap away under "More"; any switch can be flipped on, or you can graduate to Full, any time.
import { st, esc, send, pl, team, miniPlayer, tierOf } from "./core.js";

export const SWITCHES = [
  { k: "xi", name: "Pick my own XI", off: "The club picks your eleven at kick-off for the formation you choose.", on: "You pick every player in the XI.", screen: "team", ic: "📋" },
  { k: "subs", name: "Substitution plan", off: "The club makes half-time changes, like a CPU club.", on: "You write the half-time plan and make changes.", screen: "team", ic: "🔁" },
  { k: "finance", name: "Finance tabs and re-signing", off: "The club re-signs your expiring players at the end of the season, like a CPU club.", on: "You see the money outlook and decide every re-sign.", screen: "finance", ic: "💰" },
  { k: "trades", name: "Trades, drops and free agents", off: "You sit out trade windows. Offers from others can still reach you.", on: "You can trade, drop and sign in the window.", screen: "transfers", ic: "🔄" },
  { k: "stats", name: "Stats table and news", off: "The big stats table and the paper stay in More.", on: "Stats and the Daily Whistle sit on your menu.", screen: "stats", ic: "📊" },
];
const FULL = { xi: true, subs: true, finance: true, trades: true, stats: true };
export function lt(S) { const m = S && S.me && S.me.lite; return m ? { xi: m.xi !== false, subs: m.subs !== false, finance: m.finance !== false, trades: m.trades !== false, stats: m.stats !== false, plan: m.plan !== false } : { ...FULL, plan: true }; }
export const isLite = (S) => { const m = S && S.me && S.me.lite; if (m && m.on != null) return !!m.on; const l = lt(S); return SWITCHES.some((s) => !l[s.k]); };
// Lite is a path (see server/lite.js): which season each switch comes on by itself.
export const UNLOCK = { xi: 1, subs: 1, stats: 2, finance: 3, trades: 3 };
// The same, for a lobby entry (a player of the room).
export function ltOf(p) { const m = p && p.liteSet; return m ? { ...FULL, ...m } : FULL; }
export const liteLobby = (p) => !!(p && p.lite);

export const liteHandlers = {
  liteAll(a) { send({ t: "lite", all: a.on === "1" }); },
  liteSw(a) { const l = ltOf(st.S.players.find((p) => p.you)); const cur = st.S.me ? lt(st.S)[a.k] : l[a.k]; send({ t: "lite", set: { [a.k]: !cur } }); },
  liteOpen(a) { st.ui.hub = a.to; st.ui.mSel = null; st.render(); window.scrollTo(0, 0); },
  liteIntroOk(a) { const k = +a.k; st.ui.introSeen = { ...(st.ui.introSeen || {}), [k]: 1 }; try { const o = seenRead(); o[k] = 1; localStorage.setItem("fd_lite_intro", JSON.stringify(o)); } catch {} st.render(); },
  lcHide() { try { localStorage.setItem("fd_lc_off", "1"); } catch {} st.ui.lcOff = true; st.render(); },
};

// ---- first-season checklist (ticks itself as you look around) ----
const LC = [["team", "Open Team and choose a formation"], ["store", "Look in the Store"], ["table", "Check the table"], ["ready", "Press Ready"]];
const read = () => { try { return JSON.parse(localStorage.getItem("fd_lc") || "{}"); } catch { return {}; } };
export function lcMark(k) { const c = read(); if (c[k]) return; c[k] = 1; try { localStorage.setItem("fd_lc", JSON.stringify(c)); } catch { st.ui.lc = { ...(st.ui.lc || {}), [k]: 1 }; } }
export function lcCard(S) {
  if (!isLite(S) || S.seasonNo > 1) return "";
  let off = false; try { off = localStorage.getItem("fd_lc_off") === "1"; } catch {}
  if (off || st.ui.lcOff) return "";
  const c = { ...read(), ...(st.ui.lc || {}) }; const ready = S.me && S.teams[S.me.teamId].ready; if (ready) c.ready = 1;
  const done = LC.filter(([k]) => c[k]).length;
  return `<div class="card litechk"><div class="row wrap"><h3 style="margin:0">Your first matchday</h3><span class="pill ${done === LC.length ? "good" : ""}">${done}/${LC.length}</span><div class="grow"></div><button class="btn sm" data-act="lcHide">Hide</button></div>
    <ul class="chk">${LC.map(([k, t]) => `<li class="${c[k] ? "done" : ""}"><span class="tk">${c[k] ? "✓" : ""}</span>${esc(t)}</li>`).join("")}</ul>
    <p class="tiny mute" style="margin:6px 0 0">Everything else is handled for you the way a CPU club would, so you can learn the game first. <b>More</b> has the rest.</p></div>`;
}

// ---- the lobby chooser ----
export function liteChooser(S) {
  const you = S.players.find((p) => p.you); if (!you || you.mode === "player") return "";
  const lite = liteLobby(you);
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Full or Lite?</h3><div class="grow"></div>
      <button class="btn sm ${lite ? "" : "pri"}" data-act="liteAll" data-on="1">Full</button><button class="btn sm ${lite ? "pri" : ""}" data-act="liteAll" data-on="0">Lite</button></div>
    <p class="small mute" style="margin:8px 0 0">${lite ? "Lite is a gentle path. <b>Season 1</b>: draft, market, your line-up and half-time changes, with hints. <b>Season 2</b>: auto subs and stats. <b>Season 3</b>: re-signs and trades. No bonus, no easier money." : "<b>Full</b> gives you every screen and every decision from the start."}</p></div>`;
}

// ---- hints and intro cards for the Lite path ----
const POSG = (pos) => (pos === "GK" ? "GK" : ["CB", "LB", "RB"].includes(pos) ? "D" : ["ST", "LW", "RW"].includes(pos) ? "A" : "M");
export const pathOf = (S) => { const m = S && S.me && S.me.lite; return m && m.path ? m : null; };
export const guided = (S) => { const m = pathOf(S); return !!(m && m.stage === 1); };
// Season 1 hints on the line-up and half-time screens: tired starters and a one-tap swap for each.
export function liteGuide(S, l, stamOf, half) {
  if (!guided(S)) return "";
  const t = team(S.me.teamId), onP = new Set([l.gk, ...l.out]);
  const starters = [l.gk, ...l.out].map((id) => pl(id)).filter(Boolean);
  const bench = t.players.map((id) => pl(id)).filter((p) => p && !onP.has(p.id) && !(p.susp > 0));
  const used = new Set(), swaps = [];
  for (const p of starters.slice().sort((a, b) => stamOf(a.id) - stamOf(b.id))) {
    const s = stamOf(p.id); if (s >= (half ? 50 : 55)) continue;
    const c = bench.filter((b) => !used.has(b.id) && POSG(b.pos) === POSG(p.pos) && stamOf(b.id) > s + 15).sort((a, b) => b.ovr - a.ovr)[0];
    if (c) { used.add(c.id); swaps.push({ out: p, inn: c, s }); }
  }
  const rows = swaps.map((x) => `<div class="row wrap" style="gap:8px;padding:4px 0"><span class="grow small"><b>${esc(x.out.name)}</b> is at ${Math.round(x.s)}%. <b>${esc(x.inn.name)}</b> is fresher.</span><button class="btn sm pri" data-act="liteSwap" data-out="${x.out.id}" data-in="${x.inn.id}">Swap</button></div>`).join("");
  const tip = half ? "Half-time: tired players play below their rating. Swap them for fresher ones, then press Ready." : "Best XI picks your strongest eleven for this shape. Tired players play below their rating.";
  return `<div class="card guide mt"><div class="row wrap"><h3 style="margin:0">Hints</h3><span class="pill">Season 1 guide</span></div>${rows || `<p class="small" style="margin:6px 0 0">${half ? "Nobody is tired. No changes needed: press Ready." : "Your eleven looks fine. Press Ready when you are happy."}</p>`}<p class="tiny mute" style="margin:6px 0 0">${tip}</p></div>`;
}
// What you still need, for the guided first draft.
export function stepHint(S) {
  const m = pathOf(S); if (!m || !S.me) return "";
  const t = team(S.me.teamId), c = { GK: 0, D: 0, M: 0, A: 0 }; for (const id of t.players) { const p = pl(id); if (p) c[POSG(p.pos)]++; }
  let txt = "";
  if (S.step === "draft.pick" && m.stage === 1) {
    const need = [c.GK ? "" : "a goalkeeper", c.D < 2 ? "defenders" : "", c.M < 1 ? "a midfielder" : "", c.A < 1 ? "an attacker" : ""].filter(Boolean);
    txt = need.length ? `Pick the best card you can. You still need ${need.join(", ")}.` : "Pick the best card you can. Your squad has every line covered.";
  } else if (S.step === "market.bid" && m.stage === 1) txt = "Bid for the players you need. More coins on a bid raises your chance, but you only pay if you win.";
  else if (S.step === "off.rookie.turn" && m.stage <= 2) txt = "Rookies are young and improve every year. High potential is worth more than a higher rating today.";
  return txt ? `<div class="card guide" style="padding:10px 14px"><span class="pill">Guide</span> <span class="small">${esc(txt)}</span></div>` : "";
}
const INTRO = {
  1: ["Your guided start", "Season 1 is yours to learn: pick your players, bid in the market, set your line-up and make half-time changes, with hints along the way. The club looks after re-signs and trades until Season 3."],
  2: ["New: auto subs and stats", "Write a substitution plan once on the Team page and the club applies it at half-time. The stats table and the Daily Whistle are on your menu too."],
  3: ["New: re-signs and trades", "Re-signing expiring players and trading are yours now. Finance shows who is out of contract and what it costs. You can hand any of it back in More."],
};
const seenRead = () => { try { return JSON.parse(localStorage.getItem("fd_lite_intro") || "{}"); } catch { return {}; } };
export function liteIntro(S) {
  const m = pathOf(S); if (!m || st.watch || S.step === "lobby") return "";
  if (/^(draft\.reveal|market\.reveal|md\.half1?|md\.result|off\.(resign|rookie)\.reveal)/.test(S.step)) return "";
  const k = m.stage; if (!INTRO[k] || seenRead()[k] || (st.ui.introSeen && st.ui.introSeen[k])) return "";
  return `<div class="card guide"><div class="row wrap"><h3 style="margin:0">${esc(INTRO[k][0])}</h3><span class="pill">Lite</span><div class="grow"></div><button class="btn sm pri" data-act="liteIntroOk" data-k="${k}">Got it</button></div><p class="small" style="margin:6px 0 0">${esc(INTRO[k][1])}</p></div>`;
}

// ---- Team page for someone who lets the club pick the XI ----
export function liteTeam(S, itemsTray) {
  const me = S.me, l = me.lineup, t = team(me.teamId), L = lt(S);
  const forms = Object.keys(S.formations).map((f) => `<button class="btn sm ${l.formation === f ? "on" : ""}" data-act="mform" data-f="${f}">${f}</button>`).join("");
  const xi = [l.gk, ...l.out].map((id) => pl(id)).filter(Boolean);
  const squad = t.players.map((id) => pl(id)).filter(Boolean);
  const susp = squad.filter((p) => p.susp > 0).length, tired = xi.filter((p) => p.stam < 55).length, ends = squad.filter((p) => p.contract <= 1).length;
  const hints = [
    susp ? `${susp} ${susp === 1 ? "player is" : "players are"} suspended.` : "", tired ? `${tired} in the likely XI ${tired === 1 ? "is" : "are"} below 55% stamina.` : "",
    ends && S.seasonNo ? `${ends} contract${ends === 1 ? "" : "s"} end${ends === 1 ? "s" : ""} this season.` : "", me.rosterRoom != null && me.rosterRoom <= 0 ? "The squad is full." : "",
  ].filter(Boolean);
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Team</h3><span class="pill">Lite</span><div class="grow"></div><button class="btn sm" data-act="liteSw" data-k="xi">Pick my own XI</button></div>
    <p class="small mute" style="margin:6px 0 8px">Choose a shape. The club picks the best eleven for it at kick-off, like a CPU club, and looks after injuries and suspensions.</p>
    <div class="forms">${forms}</div>
    ${hints.length ? `<div class="hintbox mt"><b>Worth knowing</b><ul>${hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}
    <h4 class="mt" style="margin-bottom:6px">Likely XI</h4><div class="col" style="gap:3px">${xi.map((p) => miniPlayer(p.id, `<span class="tiny mute">${Math.round(p.stam)}%</span>`)).join("")}</div>
    <div class="mt">${itemsTray(S, l)}</div></div>`;
}
export function liteHalf(S) {
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Half-time</h3><span class="pill">Lite</span><div class="grow"></div><button class="btn sm" data-act="liteSw" data-k="subs">Make my own changes</button></div>
    <p class="small mute" style="margin:6px 0 0">The club is making its half-time changes, the way a CPU club does. Press Ready when you want the second half to start.</p></div>`;
}

// ---- More: every hidden screen, plus the switches ----
export function moreView(S, bar) {
  const l = lt(S), lite = isLite(S);
  const rows = SWITCHES.map((s) => `<div class="morerow"><span class="ic">${s.ic}</span><div class="grow"><b>${esc(s.name)}</b><div class="small mute">${esc(l[s.k] ? s.on : s.off)}${!l[s.k] && pathOf(S) && UNLOCK[s.k] > pathOf(S).stage ? ` <b>Unlocks in Season ${UNLOCK[s.k]}.</b>` : ""}</div></div>
      ${s.k === "xi" || s.k === "subs" ? "" : `<button class="btn sm" data-act="liteOpen" data-to="${s.screen}">Open</button>`}
      <label class="switch"><input type="checkbox" data-act="liteSw" data-k="${s.k}" ${l[s.k] ? "checked" : ""}><span>${l[s.k] ? "On" : "Off"}</span></label></div>`).join("");
  return `${bar("More")}<div class="card"><div class="row wrap"><h3 style="margin:0">${lite ? "Lite mode" : "Full mode"}</h3><div class="grow"></div>${lite ? `<button class="btn pri" data-act="liteAll" data-on="1">Graduate to Full</button>` : `<button class="btn" data-act="liteAll" data-on="0">Go back to Lite</button>`}</div>
    <p class="small mute" style="margin:6px 0 0">${lite ? "Lite plays like a CPU club: no bonus, no softer economy. Flip any switch to take that job over yourself, or open a screen just to look." : "You have every screen and every decision."}</p>
    <div class="col mt" style="gap:8px">${rows}</div>
    <div class="morerow"><span class="ic">📰</span><div class="grow"><b>The Daily Whistle</b><div class="small mute">Headlines, front page and the style press.</div></div><button class="btn sm" data-act="liteOpen" data-to="news">Open</button></div></div>`;
}
