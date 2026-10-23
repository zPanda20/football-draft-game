// Matchdays: line-up editor, half-time changes, live playback of the halves, results and the league table.
import { st, $, $$, esc, send, team, chip, crest, pl, tierOf, flag, miniPlayer, remaining, card } from "./core.js";

// ---------- pitch geometry and position fit (mirrors engine/roster.js) ----------
const ROW = { GK: 0, CB: 1, LB: 1, RB: 1, CDM: 2, CM: 3, LM: 3, RM: 3, CAM: 4, LW: 4, RW: 4, ST: 5 };
const WIDTH = { LB: -1, LM: -1, LW: -1, RB: 1, RM: 1, RW: 1 };
function layout(slots) {
  const byRow = {}; slots.forEach((s, i) => (byRow[ROW[s]] = byRow[ROW[s]] || []).push(i));
  const pos = [];
  for (const [r, list] of Object.entries(byRow)) {
    list.sort((a, b) => (WIDTH[slots[a]] || 0) - (WIDTH[slots[b]] || 0));
    list.forEach((i, k) => { pos[i] = { x: 16 + ((k + 1) / (list.length + 1)) * 68, y: 88 - r * 15.5 }; });
  }
  return pos;
}
function fit(pos, slot) {
  const F = st.cat.fit, xy = st.cat.xy;
  if (slot === "GK") return pos === "GK" ? 1 : F.outfieldInGoal;
  if (pos === slot) return 1;
  if (pos === "GK") return F.gkInOutfield;
  const [d1, w1] = xy[pos], [d2, w2] = xy[slot];
  return Math.max(F.floor, 1 - F.perUnit * Math.hypot(d1 - d2, (w1 - w2) * F.widthWeight));
}
const fitCls = (f) => (f >= 0.95 ? "ok" : f >= 0.8 ? "mid" : "bad");

// ---------- handlers ----------
const lineupOf = (S) => (S.step === "md.half" ? S.me.match.halftime.lineup : S.me.lineup);
function sendLineup(l) { send({ t: "lineup", lineup: l }); }
function place(l, slotIdx, pid) {
  const n = { formation: l.formation, gk: l.gk, out: l.out.slice() };
  const get = (i) => (i < 0 ? n.gk : n.out[i]), set = (i, v) => { if (i < 0) n.gk = v; else n.out[i] = v; };
  let from = null; if (n.gk === pid) from = -1; else { const j = n.out.indexOf(pid); if (j >= 0) from = j; }
  const old = get(slotIdx); set(slotIdx, pid);
  if (from !== null && from !== slotIdx) set(from, old);
  return n;
}
function choose(kind, val) {
  const S = st.S, sel = st.ui.mSel;
  if (!sel) { st.ui.mSel = { kind, val }; return st.render(); }
  if (sel.kind === kind) { st.ui.mSel = sel.val === val ? null : { kind, val }; return st.render(); }
  const slot = kind === "slot" ? val : sel.val, pid = kind === "slot" ? sel.val : val;
  st.ui.mSel = null; sendLineup(place(lineupOf(S), slot, pid));
}
export const matchHandlers = {
  cont() { send({ t: "continue" }); },
  mslot(a) { choose("slot", +a.i); },
  mplayer(a) { choose("p", +a.id); },
  mform(a) { st.ui.mSel = null; send({ t: "lineupAuto", formation: a.value || a.f }); },
  mbest() { st.ui.mSel = null; send({ t: "lineupAuto", formation: null }); },
  mready() { send({ t: "ready", on: !st.S.teams[st.S.me.teamId].ready }); },
  mitem(a) {
    const S = st.S, owned = Object.keys(S.me.items).filter((id) => S.me.items[id] > 0);
    let act = S.me.active ?? owned.map((id) => st.items[id]).sort((x, y) => y.price - x.price).slice(0, st.cat.rules.activeCap).map((i) => i.id);
    act = act.includes(a.id) ? act.filter((x) => x !== a.id) : [...act, a.id].slice(0, st.cat.rules.activeCap);
    send({ t: "items", ids: act });
  },
};

// ---------- league table ----------
export function tablePanel(S, limit = 99) {
  const rows = (S.table || []).slice(0, limit);
  if (!rows.length) return "";
  const me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>League table</h3><table class="tb"><tr><th>#</th><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr>
    ${rows.map((r, k) => `<tr class="${r.i === me ? "me" : ""} ${k === 0 && r.p ? "leader" : ""}"><td>${k + 1}</td><td>${chip(team(r.i), 18)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n"><b>${r.pts}</b></td></tr>`).join("")}</table></div>`;
}

// ---------- line-up editor ----------
function pitch(S, l, stamOf) {
  const slots = S.formations[l.formation], pos = layout(slots);
  const sel = st.ui.mSel;
  const one = (slotName, pid, i, at) => {
    const p = pid != null ? pl(pid) : null, f = p ? fit(p.pos, slotName) : 1, s = p ? Math.round(stamOf(pid)) : 0;
    const isSel = sel && sel.kind === "slot" && sel.val === i;
    return `<div class="slot" style="left:${at.x}%;top:${at.y}%" data-act="mslot" data-i="${i}">
      <div class="tok ${p ? tierOf(p.ovr) : "empty"} ${isSel ? "sel" : ""}">${p ? p.ovr : "?"}</div>
      <div class="nm">${p ? esc(p.name.split(" ").slice(-1)[0]) : "empty"}</div>
      <div class="sl">${slotName}${p && p.pos !== slotName ? ` <span class="fit ${fitCls(f)}">(${p.pos} ${Math.round(f * 100)}%)</span>` : ""}</div>
      ${p ? `<div class="stam"><i class="${s < 35 ? "low" : s < 60 ? "mid" : ""}" style="width:${s}%"></i></div>` : ""}</div>`;
  };
  return `<div class="pitch">${slots.map((sn, i) => one(sn, l.out[i], i, pos[i])).join("")}${one("GK", l.gk, -1, { x: 50, y: 90 })}</div>`;
}
function lineupEditor(S, half) {
  const me = S.me, t = team(me.teamId);
  const l = half ? me.match.halftime.lineup : me.lineup;
  const stamOf = half ? (id) => me.match.halftime.stamina[id] ?? 100 : (id) => pl(id).stam;
  const onPitch = new Set([l.gk, ...l.out]);
  const sel = st.ui.mSel;
  const roster = t.players.map((id) => pl(id)).sort((a, b) => b.ovr - a.ovr);
  const row = (p) => `<div class="benchrow ${sel && sel.kind === "p" && sel.val === p.id ? "sel" : ""}" data-act="mplayer" data-id="${p.id}">
    <span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="mute small">${p.pos}</span></span>
    <span class="tiny mute">${Math.round(stamOf(p.id))}%</span>${onPitch.has(p.id) ? `<span class="pill tiny">on</span>` : `<span class="pill tiny acc">bench</span>`}</div>`;
  const isReady = t.ready;
  const forms = Object.keys(S.formations).map((f) => `<button class="btn sm ${l.formation === f ? "on" : ""}" data-act="mform" data-f="${f}">${f}</button>`).join("");
  const owned = Object.keys(me.items || {}).filter((id) => me.items[id] > 0);
  const auto = me.active ?? owned.map((id) => st.items[id]).sort((x, y) => y.price - x.price).slice(0, st.cat.rules.activeCap).map((i) => i.id);
  const items = !half && owned.length ? `<div class="card"><h3>Items for this match (max ${st.cat.rules.activeCap})</h3><div class="col" style="gap:6px">${owned.map((id) => `<label class="row small" style="cursor:pointer"><input type="checkbox" ${auto.includes(id) ? "checked" : ""} data-change="mitem" data-id="${id}"> <b>${esc(st.items[id].name)}</b><span class="mute">${me.items[id]} left · ${esc(st.items[id].text)}</span></label>`).join("")}</div></div>` : "";
  const head = half ? `<div class="bigmatch"><div class="tm">${chip(team(me.match.side ? me.match.opponent : me.teamId), 26)}</div><div class="sc">${me.match.halftime.score[0]} – ${me.match.halftime.score[1]}</div><div class="tm">${chip(team(me.match.side ? me.teamId : me.match.opponent), 26)}</div></div><p class="c mute small">Half-time. Tired players play worse in the second half; subs recover while they rest.</p>` : "";
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">${half ? "Half-time changes" : "Line-up"}</h3><div class="grow"></div>
      <button class="btn sm" data-act="mbest">Best XI</button><button class="btn sm ${me.auto ? "on" : ""}" data-act="auto">Auto ${me.auto ? "on" : "off"}</button>
      <button class="btn ${isReady ? "" : "pri"}" data-act="mready">${isReady ? "Not ready" : "Ready"}</button></div>
    ${head}<div class="forms mt">${forms}</div>
    <div class="pitchwrap mt"><div>${pitch(S, l, stamOf)}</div><div class="col" style="gap:4px"><div class="small mute">Tap a player and then a spot (or the other way round) to swap.</div><div data-keep="bench" style="max-height:470px;overflow:auto">${roster.map(row).join("")}</div></div></div></div>${items}`;
}

// ---------- playback ----------
function pbInfo(S) {
  const R = S.reveal; if (!R || (R.kind !== "half1" && R.kind !== "half2")) return null;
  let t = 1;
  if (S.step === "md.half1" || S.step === "md.half2") {
    const r = remaining();
    t = r == null ? (st.ui.pbLast ?? 0) : S.dur > 0 ? 1 - r / S.dur : 1;
    t = Math.max(0, Math.min(1, t)); st.ui.pbLast = t;
  }
  return { R, half: R.kind === "half2" ? 1 : 0, t };
}
function matchState(m, half, t) {
  const frac = (e) => (e.minute - 45 * e.half) / 45;
  const own = m.events.filter((e) => frac(e) <= t + 1e-9);
  if (half === 0) {
    const sc = [0, 0]; for (const e of own) if (e.type === "goal") sc[e.team]++;
    return { sc, events: own };
  }
  const g2 = [0, 0]; for (const e of m.events) if (e.type === "goal") g2[e.team]++;
  const base = [m.score[0] - g2[0], m.score[1] - g2[1]], sc = base.slice();
  for (const e of own) if (e.type === "goal") sc[e.team]++;
  return { sc, events: own, base };
}
const nm = (id) => (id != null && st.idx[id] ? st.idx[id].name : "?");
function evLine(m, e) {
  const tm = team(e.team ? m.b : m.a);
  const clock = `${e.minute}'`;
  if (e.type === "goal") return `<div class="ev goal"><span class="min">${clock}</span>⚽ <b>${esc(nm(e.player))}</b> scores for ${esc(tm.name)}</div>`;
  if (e.type === "save") return `<div class="ev"><span class="min">${clock}</span>🧤 ${esc(nm(e.player))} shoots, ${esc(nm(e.keeper))} saves</div>`;
  return "";
}
export function playbackTick() {
  const S = st.S; if (!S) return;
  const els = $$("[data-pb]"); if (!els.length) return;
  const info = pbInfo(S); if (!info) return;
  const { R, half, t } = info, ms = R.matches;
  const clockTxt = S.step === "md.half" ? "HT" : S.step === "md.result" || (S.step === "md.half2" && t >= 1) ? "FT" : `${Math.round(half * 45 + t * 45)}'`;
  for (const n of els) {
    const k = +n.dataset.k; const m = ms[k]; if (!m && n.dataset.pb !== "clock") continue;
    if (n.dataset.pb === "clock") { n.textContent = clockTxt; continue; }
    const s = matchState(m, half, t);
    if (n.dataset.pb === "score") {
      const txt = `${s.sc[0]} – ${s.sc[1]}`;
      if (n.textContent !== txt) { if (n.textContent) { n.classList.remove("goalflash"); void n.offsetWidth; n.classList.add("goalflash"); } n.textContent = txt; }
    } else if (n.dataset.pb === "ticker") {
      const html = s.events.slice().reverse().map((e) => evLine(m, e)).join("") || `<span class="mute small">${half ? "Second half under way." : "Kick-off."}</span>`;
      if (n.dataset.last !== html) { n.innerHTML = html; n.dataset.last = html; }
    }
  }
}
function fixtureRows(S, ms) {
  const me = S.me ? S.me.teamId : -1;
  return ms.map((m, k) => `<div class="fixture ${m.a === me || m.b === me ? "mine" : ""}"><div class="l">${chip(team(m.a), 18)}</div><div class="score" data-pb="score" data-k="${k}"></div><div>${chip(team(m.b), 18)}</div></div>`).join("");
}
function playbackView(S) {
  const R = S.reveal, me = S.me;
  const mine = me && me.match ? me.match.index : -1;
  const m = mine >= 0 ? R.matches[mine] : null;
  const big = m ? `<div class="card"><div class="row"><h3 style="margin:0">${S.step === "md.half1" || S.step === "md.half" ? "First half" : "Second half"}</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="${mine}"></span></div>
    <div class="bigmatch"><div class="tm">${crest(team(m.a), 44)}${esc(team(m.a).name)}</div><div class="sc" data-pb="score" data-k="${mine}"></div><div class="tm">${crest(team(m.b), 44)}${esc(team(m.b).name)}</div></div>
    <div class="ticker" data-pb="ticker" data-k="${mine}"></div></div>` : `<div class="card"><div class="row"><h3 style="margin:0">Matchday ${R.day + 1}</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="0"></span></div></div>`;
  return `${big}<div class="card"><h3>${m ? "Around the league" : "All matches"}</h3>${fixtureRows(S, R.matches)}</div>`;
}

// ---------- the whole view ----------
export function matchView(S, ctx) {
  const me = S.me; let main = "";
  const side = tablePanel(S) + ctx.teamsList(S) + ctx.chatCard(S);
  switch (S.step) {
    case "season.intro":
      main = `<div class="card c"><h3>Season ${S.seasonNo}</h3><p style="font-size:24px;font-weight:800">${S.season.total} matchdays</p><p class="mute mt">Three points for a win, one for a draw. Goal difference, then goals scored, break ties. Top of the table wins the league.</p></div>`;
      break;
    case "md.lineup":
      main = me ? lineupEditor(S, false) + fixturesPreview(S) : fixturesPreview(S);
      break;
    case "md.half1": case "md.half2":
      main = playbackView(S); break;
    case "md.half":
      main = (me && me.match ? lineupEditor(S, true) : "") + playbackView(S); break;
    case "md.result": main = playbackView(S); break;
    case "season.end": {
      const R = S.reveal, champ = team(R.champion);
      main = `<div class="card champ"><h3>Champions</h3><div class="t">${esc(champ.name)}</div><div class="mt">${crest(champ, 64)}</div><p class="mute mt">${champ.owner ? "Managed by " + esc(champ.owner) : "CPU manager"} · ${R.table[0].pts} points</p>${S.host && !R.final ? `<button class="btn pri big mt2" data-act="cont">Continue to the off-season</button>` : ""}</div>${R.final ? finalCard(S) : ""}`;
      break;
    }
    default: main = `<div class="card">…</div>`;
  }
  return { main, side };
}
function finalCard(S) {
  const h = S.history || [], wins = new Map();
  for (const x of h) wins.set(x.champion, (wins.get(x.champion) || 0) + 1);
  return `<div class="card"><h3>Hall of champions</h3><table class="tb"><tr><th>Season</th><th>Champion</th><th class="n">Points</th></tr>${h.map((x) => `<tr><td>${x.season}</td><td>${chip(team(x.champion), 18, true)}</td><td class="n">${x.pts}</td></tr>`).join("")}</table><p class="mute small mt">That was the last season of this game.</p></div>`;
}
function fixturesPreview(S) {
  const fx = S.season.fixtures || [], me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>Matchday ${S.season.day + 1} fixtures</h3>${fx.map(([a, b]) => `<div class="fixture ${a === me || b === me ? "mine" : ""}"><div class="l">${chip(team(a), 18)}</div><div class="score mute">v</div><div>${chip(team(b), 18)}</div></div>`).join("")}</div>`;
}
