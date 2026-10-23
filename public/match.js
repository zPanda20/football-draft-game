// Matchdays: line-up editor, half-time changes, live playback of the halves, results and the league table.
import { st, $, $$, esc, send, team, chip, crest, club, kitImg, shirt, matchColors, pl, tierOf, flag, miniPlayer, remaining, card } from "./core.js";
import { storeCard } from "./store.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// A team with its kit right next to the crest (side 0 = home kit, 1 = away kit).
const tchipK = (ti, side, size = 18) => { const t = team(ti); return `<span class="tchip">${crest(t, size)}${shirt(club(t), side, size + 6)}<span class="n">${esc(t.name)}</span></span>`; };

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
// How much a tired player is held back (about, in rating points). Mirrors engine fatigue().
const tiredLoss = (ovr, stam) => Math.round(ovr * st.cat.rules.fatigueK * (1 - clamp(stam, 0, 100) / 100));
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
// Swapping: tap (or drag) any player or spot, then tap (or drop on) any other player or spot. Whatever the two are
// (pitch spot, pitch player, bench player) they trade places.
function slotOf(l, pid) { if (l.gk === pid) return -1; const j = l.out.indexOf(pid); return j >= 0 ? j : null; }
function ent(l, kind, val) { return kind === "slot" ? { slot: val, pid: val < 0 ? l.gk : l.out[val] } : { slot: slotOf(l, val), pid: val }; }
function swapLineup(l, A, B) {
  if (A.slot == null && B.slot == null) return null;                        // two bench players: nothing to swap
  if (A.slot != null && B.slot != null) return A.slot === B.slot ? null : A.pid == null ? place(l, A.slot, B.pid) : place(l, B.slot, A.pid);
  const bench = A.slot == null ? A : B, spot = A.slot == null ? B : A;
  return place(l, spot.slot, bench.pid);
}
function choose(kind, val) {
  const S = st.S, sel = st.ui.mSel;
  if (!sel) { st.ui.mSel = { kind, val }; return st.render(); }
  if (sel.kind === kind && sel.val === val) { st.ui.mSel = null; return st.render(); }
  const l = lineupOf(S), A = ent(l, sel.kind, sel.val), B = ent(l, kind, val), out = swapLineup(l, A, B);
  if (!out) { st.ui.mSel = { kind, val }; return st.render(); }              // both on the bench: just move the selection
  st.ui.mSel = null; sendLineup(out); st.render();
}
let dragFrom = null;
const dndTarget = (e) => e.target.closest && e.target.closest('[data-act="mslot"],[data-act="mplayer"]');
document.addEventListener("dragstart", (e) => {
  const n = dndTarget(e); if (!n) return;
  dragFrom = n.dataset.act === "mslot" ? { kind: "slot", val: +n.dataset.i } : { kind: "p", val: +n.dataset.id };
  try { e.dataTransfer.setData("text/plain", "swap"); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* ignore */ }
  n.classList.add("dragging");
});
document.addEventListener("dragend", () => { dragFrom = null; $$(".dragging,.dropover").forEach((n) => n.classList.remove("dragging", "dropover")); });
document.addEventListener("dragover", (e) => { const n = dndTarget(e); if (n && dragFrom) { e.preventDefault(); n.classList.add("dropover"); } });
document.addEventListener("dragleave", (e) => { const n = dndTarget(e); if (n) n.classList.remove("dropover"); });
document.addEventListener("drop", (e) => {
  const n = dndTarget(e); if (!n || !dragFrom) return; e.preventDefault();
  const to = n.dataset.act === "mslot" ? { kind: "slot", val: +n.dataset.i } : { kind: "p", val: +n.dataset.id }, from = dragFrom; dragFrom = null;
  const l = lineupOf(st.S), out = swapLineup(l, ent(l, from.kind, from.val), ent(l, to.kind, to.val));
  st.ui.mSel = null; if (out) sendLineup(out);
  st.render();
});
// The items a manager has switched on (the CPU rule's pick until he changes it). Banned items are never in the default.
function activeNow(S) {
  const owned = Object.keys(S.me.items).filter((id) => S.me.items[id] > 0);
  return S.me.active ?? owned.map((id) => st.items[id]).filter((i) => !i.banned).sort((x, y) => y.price - x.price).slice(0, st.cat.rules.activeCap).map((i) => i.id);
}
export const matchHandlers = {
  cont() { send({ t: "continue" }); },
  mslot(a) { choose("slot", +a.i); },
  mcancel() { st.ui.mSel = null; st.render(); },
  hubgo(a) { st.ui.hub = a.to; st.ui.mSel = null; st.render(); window.scrollTo(0, 0); },
  hubback() { st.ui.hub = null; st.ui.viewTeam = null; st.ui.mSel = null; st.render(); },
  viewteam(a) { st.ui.viewTeam = +a.i; st.render(); window.scrollTo(0, 0); },
  closeteam() { st.ui.viewTeam = null; st.render(); },
  mfocus(a) { st.ui.focus = +a.k; st.render(); },
  mplayer(a) { choose("p", +a.id); },
  mform(a) { st.ui.mSel = null; send({ t: "lineupAuto", formation: a.value || a.f }); },
  mbest() { st.ui.mSel = null; send({ t: "lineupAuto", formation: null }); },
  mready() { send({ t: "ready", on: !st.S.teams[st.S.me.teamId].ready }); },
  mitem(a) {
    let act = activeNow(st.S);
    act = act.includes(a.id) ? act.filter((x) => x !== a.id) : [...act, a.id].slice(0, st.cat.rules.activeCap);
    send({ t: "items", ids: act, equip: st.S.me.equip || {} });
  },
  mwear(a) {
    const eq = { ...(st.S.me.equip || {}) };
    if (a.value === "") delete eq[a.id]; else eq[a.id] = +a.value;
    send({ t: "items", ids: activeNow(st.S), equip: eq });
  },
  mgift(a) { send({ t: "gift", id: a.id, pid: +a.pid }); },
};

// ---------- league table ----------
export function tablePanel(S, limit = 99, click = false) {
  const rows = (S.table || []).slice(0, limit);
  if (!rows.length) return "";
  const me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>League table</h3><table class="tb"><tr><th>#</th><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr>
    ${rows.map((r, k) => `<tr class="${r.i === me ? "me" : ""} ${k === 0 && r.p ? "leader" : ""} ${click ? "clickable" : ""}" ${click ? `data-act="viewteam" data-i="${r.i}" title="See this team"` : ""}><td>${k + 1}</td><td>${chip(team(r.i), 18)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n"><b>${r.pts}</b></td></tr>`).join("")}</table></div>`;
}

// ---------- line-up editor ----------
function pitch(S, l, stamOf) {
  const slots = S.formations[l.formation], pos = layout(slots);
  const sel = st.ui.mSel;
  const one = (slotName, pid, i, at) => {
    const p = pid != null ? pl(pid) : null, f = p ? fit(p.pos, slotName) : 1, s = p ? Math.round(stamOf(pid)) : 0;
    const isSel = sel && ((sel.kind === "slot" && sel.val === i) || (sel.kind === "p" && p && sel.val === pid));
    const loss = p ? tiredLoss(p.ovr, s) : 0;
    return `<div class="slot ${sel && !isSel ? "swappable" : ""}" style="left:${at.x}%;top:${at.y}%" data-act="mslot" data-i="${i}" draggable="true">
      <div class="tok ${p ? tierOf(p.ovr) : "empty"} ${isSel ? "sel" : ""}">${p ? p.ovr : "?"}${loss >= 2 ? `<span class="dn" title="Tired: plays about ${loss} points below his rating">−${loss}</span>` : ""}</div>
      <div class="nm">${p ? esc(p.name.split(" ").slice(-1)[0]) : "empty"}</div>
      <div class="sl">${slotName}${p && p.pos !== slotName ? ` <span class="fit ${fitCls(f)}">(${p.pos} ${Math.round(f * 100)}%)</span>` : ""}</div>
      ${p ? `<div class="stam"><i class="${s < 35 ? "low" : s < 60 ? "mid" : ""}" style="width:${s}%"></i></div>` : ""}</div>`;
  };
  return `<div class="pitch">${slots.map((sn, i) => one(sn, l.out[i], i, pos[i])).join("")}${one("GK", l.gk, -1, { x: 50, y: 90 })}</div>`;
}
function swapHint(sel) {
  if (!sel) return `<div class="swaphint">Swap players: <b>click</b> one, then click who to swap with. Or <b>drag and drop</b> a player onto another player or spot.</div>`;
  const l = lineupOf(st.S), e = ent(l, sel.kind, sel.val), p = e.pid != null ? pl(e.pid) : null;
  return `<div class="swaphint on">Swapping <b>${p ? esc(p.name) : "an empty spot"}</b>${e.slot == null ? " (bench)" : ""}. Now click who to swap with. <button class="btn sm" data-act="mcancel">Cancel</button></div>`;
}
function lineupEditor(S, half) {
  const me = S.me, t = team(me.teamId);
  const l = half ? me.match.halftime.lineup : me.lineup;
  const stamOf = half ? (id) => me.match.halftime.stamina[id] ?? 100 : (id) => pl(id).stam;
  const onPitch = new Set([l.gk, ...l.out]);
  const sel = st.ui.mSel;
  const roster = t.players.map((id) => pl(id)).sort((a, b) => (a.susp ? 1 : 0) - (b.susp ? 1 : 0) || b.ovr - a.ovr);
  const row = (p) => p.susp ? `<div class="benchrow dim"><span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="mute small">${p.pos}</span></span><span class="pill bad tiny">SUSP ${p.susp}</span></div>` : `<div class="benchrow ${sel && sel.kind === "p" && sel.val === p.id ? "sel" : sel ? "swappable" : ""}" data-act="mplayer" data-id="${p.id}" draggable="true">
    <span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="mute small">${p.pos}</span></span>
    <span class="tiny mute" title="Stamina. Tired players play below their rating.">${Math.round(stamOf(p.id))}%${tiredLoss(p.ovr, stamOf(p.id)) >= 2 ? ` <span class="neg">−${tiredLoss(p.ovr, stamOf(p.id))}</span>` : ""}</span>${onPitch.has(p.id) ? `<span class="pill tiny">on</span>` : `<span class="pill tiny acc">bench</span>`}</div>`;
  const isReady = t.ready;
  const forms = Object.keys(S.formations).map((f) => `<button class="btn sm ${l.formation === f ? "on" : ""}" data-act="mform" data-f="${f}">${f}</button>`).join("");
  const owned = Object.keys(me.items || {}).filter((id) => me.items[id] > 0);
  const auto = activeNow(S), equip = me.equip || {};
  const fit = roster.filter((p) => !p.susp), users = roster.filter((p) => p.user);
  const itemRow = (id) => {
    const it = st.items[id], on = auto.includes(id), wear = it.scope === "player" && on;
    const sel = wear ? `<select data-change="mwear" data-id="${id}" style="max-width:190px"><option value="">${it.banned ? "Choose who takes it…" : "Auto (best attacker)"}</option>${fit.map((p) => `<option value="${p.id}" ${equip[id] === p.id ? "selected" : ""}>${esc(p.name)} (${p.pos})</option>`).join("")}</select>` : "";
    const gift = it.scope === "player" ? users.map((u) => `<button class="btn sm" data-act="mgift" data-id="${id}" data-pid="${u.id}">Give 1 to ${esc(u.name)}</button>`).join("") : "";
    return `<div class="row wrap small" style="gap:8px"><label class="row" style="cursor:pointer;gap:6px"><input type="checkbox" ${on ? "checked" : ""} data-change="mitem" data-id="${id}"> <b>${esc(it.name)}</b>${it.banned ? ` <span class="pill bad tiny">banned</span>` : ""}</label><span class="mute">${me.items[id]} left · ${esc(it.text)}</span>${sel}${gift}</div>`;
  };
  const items = !half && owned.length ? `<div class="card"><h3>Items for this match (max ${st.cat.rules.activeCap})</h3><div class="col" style="gap:8px">${owned.map(itemRow).join("")}</div></div>` : "";
  const head = half ? `<div class="bigmatch"><div class="tm">${chip(team(me.match.side ? me.match.opponent : me.teamId), 26)}</div><div class="sc">${me.match.halftime.score[0]} – ${me.match.halftime.score[1]}</div><div class="tm">${chip(team(me.match.side ? me.teamId : me.match.opponent), 26)}</div></div><p class="c mute small">Half-time. Tired players play worse in the second half (the red number is how many rating points). Players on the bench keep their stamina.</p>` : "";
  return `<div class="card"><div class="row wrap">${half ? "" : kitImg(club(t), "kitHome", 40)}<h3 style="margin:0">${half ? "Half-time changes" : "Line-up"}</h3><div class="grow"></div>
      <button class="btn sm" data-act="mbest">Best XI</button><button class="btn sm ${me.auto ? "on" : ""}" data-act="auto">Auto ${me.auto ? "on" : "off"}</button>
      <button class="btn ${isReady ? "" : "pri"}" data-act="mready">${isReady ? "Not ready" : "Ready"}</button></div>
    ${head}<div class="forms mt">${forms}</div>
    <div class="pitchwrap mt"><div>${pitch(S, l, stamOf)}</div><div class="col" style="gap:4px">${swapHint(sel)}<div data-keep="bench" style="max-height:470px;overflow:auto">${roster.map(row).join("")}</div></div></div></div>${items}`;
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
const nm = (id) => { const p = id != null ? pl(id) : null; return p ? p.name : "?"; };
function evLine(m, e) {
  const tm = team(e.team ? m.b : m.a);
  const clock = `${e.minute}'`;
  if (e.type === "goal") return `<div class="ev goal"><span class="min">${clock}</span>⚽ <b>${esc(nm(e.player))}</b> scores for ${esc(tm.name)}</div>`;
  if (e.type === "save") return `<div class="ev"><span class="min">${clock}</span>🧤 ${esc(nm(e.player))} shoots, ${esc(nm(e.keeper))} saves</div>`;
  return "";
}
// ---------- momentum and possession ----------
// The engine gives one reading per moment (ten a match): the share of the ball and who is pressing. Between readings
// the display interpolates, and shots and goals add a spike, so the bars read like a minute-by-minute momentum graph.
function interp(flow, key, min, dflt) {
  if (!flow.length) return dflt;
  if (min <= flow[0].minute) return flow[0][key];
  for (let i = 1; i < flow.length; i++) if (min <= flow[i].minute) { const a = flow[i - 1], b = flow[i]; return a[key] + ((b[key] - a[key]) * (min - a.minute)) / (b.minute - a.minute || 1); }
  return flow[flow.length - 1][key];
}
function known(m, now) {                      // only what has happened by `now` (no peeking at later moments)
  return { flow: (m.flow || []).filter((f) => f.minute - 4 <= now), ev: (m.all || m.events || []).filter((e) => e.minute <= now) };
}
function momentumAt(k, min) {
  let v = interp(k.flow, "mom", min, 0) * 0.75;
  for (const e of k.ev) if (e.type === "goal" || e.type === "save") v += (e.team ? -1 : 1) * (e.type === "goal" ? 0.95 : 0.5) * Math.exp(-(((min - e.minute) / 2.2) ** 2));
  return clamp(v, -1, 1);
}
function possAt(k, now) {                     // running share of the ball for the home side, 0..1
  if (now <= 0) return 0.5;
  let sum = 0, n = 0;
  for (let x = 0.5; x < now; x += 1) { sum += interp(k.flow, "ph", x, 0.5); n++; }
  return n ? sum / n : 0.5;
}
function statsPanel(m, now) {
  const [HOME_C, AWAY_C] = matchColors(club(team(m.a)), club(team(m.b)));
  const k = known(m, now), W = 540, H = 110, mid = H / 2, bw = W / 90;
  let bars = "";
  for (let x = 1; x <= 90; x++) {
    if (x > now + 0.5) { bars += `<rect x="${((x - 1) * bw + 0.7).toFixed(1)}" y="${mid - 1}" width="${(bw - 1.4).toFixed(1)}" height="2" fill="currentColor" opacity=".12"/>`; continue; }
    const v = momentumAt(k, x), h = Math.max(1.5, Math.abs(v) * (mid - 4));
    bars += `<rect x="${((x - 1) * bw + 0.7).toFixed(1)}" y="${(v >= 0 ? mid - h : mid).toFixed(1)}" width="${(bw - 1.4).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${v >= 0 ? HOME_C : AWAY_C}"/>`;
  }
  const goals = k.ev.filter((e) => e.type === "goal").map((e) => `<circle cx="${(e.minute * bw).toFixed(1)}" cy="${e.team ? H - 6 : 6}" r="4.5" fill="${e.team ? AWAY_C : HOME_C}" stroke="#fff" stroke-width="1.2"><title>${e.minute}' goal</title></circle>`).join("");
  const mom = `<svg viewBox="0 0 ${W} ${H}" class="mchart" role="img" aria-label="Match momentum"><line x1="${45 * bw}" y1="0" x2="${45 * bw}" y2="${H}" stroke="currentColor" opacity=".25" stroke-dasharray="3 3"/><line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="currentColor" opacity=".3"/>${bars}${goals}</svg>`;
  // possession over time: running home share, every 3 minutes
  const PH = 70; let pts = [];
  for (let x = 3; x <= Math.min(90, Math.floor(now)); x += 3) pts.push([x * bw, PH - clamp((possAt(known(m, x), x) - 0.2) / 0.6, 0, 1) * PH]);
  const poll = pts.length ? `<polyline points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${HOME_C}" stroke-width="2.4" stroke-linejoin="round"/>` : "";
  const area = pts.length ? `<polygon points="${pts[0][0].toFixed(1)},${PH / 2} ${pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")} ${pts[pts.length - 1][0].toFixed(1)},${PH / 2}" fill="${HOME_C}" opacity=".14"/>` : "";
  const poss = `<svg viewBox="0 0 ${W} ${PH}" class="mchart short" role="img" aria-label="Possession over time (home share, 20 to 80 percent)"><line x1="${45 * bw}" y1="0" x2="${45 * bw}" y2="${PH}" stroke="currentColor" opacity=".25" stroke-dasharray="3 3"/><line x1="0" y1="${PH / 2}" x2="${W}" y2="${PH / 2}" stroke="currentColor" opacity=".3"/>${area}${poll}</svg>`;
  const ph = Math.round(possAt(k, now) * 100), shots = [0, 0]; for (const e of k.ev) if (e.type === "goal" || e.type === "save") shots[e.team]++;
  return `<div class="mstat"><div class="mrow"><span class="lg"><i style="background:${HOME_C}"></i>${esc(team(m.a).name)}</span><b class="mtitle">Momentum</b><span class="lg"><i style="background:${AWAY_C}"></i>${esc(team(m.b).name)}</span></div>${mom}
    <div class="axis"><span>0'</span><span>HT</span><span>90'</span></div>
    <div class="mrow mt"><b class="num">${ph}%</b><b class="mtitle">Possession</b><b class="num">${100 - ph}%</b></div>
    <div class="pbar"><i style="width:${ph}%;background:${HOME_C}"></i><i style="width:${100 - ph}%;background:${AWAY_C}"></i></div>${poss}
    <div class="mrow mt"><b class="num">${shots[0]}</b><b class="mtitle">Shots</b><b class="num">${shots[1]}</b></div></div>`;
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
    if (n.dataset.pb === "mstats") {
      const now = clamp(half * 45 + t * 45, 0, 90), key = `${S.step}|${S.reveal.seq}|${k}|${Math.floor(now * 2)}`;
      if (n.dataset.last !== key) { n.dataset.last = key; n.innerHTML = statsPanel(m, now); }
      continue;
    }
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
  return ms.map((m, k) => `<div class="fixture ${m.a === me || m.b === me ? "mine" : ""} ${k === focusK(S) ? "focus" : ""}" data-act="mfocus" data-k="${k}" title="Show this match"><div class="l">${tchipK(m.a, 0)}</div><div class="score" data-pb="score" data-k="${k}"></div><div>${tchipK(m.b, 1)}</div></div>`).join("");
}
function focusK(S) {
  const R = S.reveal, mine = S.me && S.me.match ? S.me.match.index : -1;
  if (st.ui.focusDay !== R.day) { st.ui.focusDay = R.day; st.ui.focus = null; }
  return st.ui.focus != null && R.matches[st.ui.focus] ? st.ui.focus : mine >= 0 ? mine : 0;
}
function playbackView(S) {
  const R = S.reveal, me = S.me;
  const mine = focusK(S);
  const m = R.matches[mine] || null;
  const big = m ? `<div class="card"><div class="row"><h3 style="margin:0">${S.step === "md.half1" || S.step === "md.half" ? "First half" : "Second half"}</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="${mine}"></span></div>
    <div class="bigmatch"><div class="tm"><div class="tmhead">${crest(team(m.a), 44)}${shirt(club(team(m.a)), 0, 52)}</div>${esc(team(m.a).name)}</div><div class="sc" data-pb="score" data-k="${mine}"></div><div class="tm"><div class="tmhead">${crest(team(m.b), 44)}${shirt(club(team(m.b)), 1, 52)}</div>${esc(team(m.b).name)}</div></div>
    <div class="ticker" data-pb="ticker" data-k="${mine}"></div><div data-pb="mstats" data-k="${mine}"></div></div>` : `<div class="card"><div class="row"><h3 style="margin:0">Matchday ${R.day + 1}</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="0"></span></div></div>`;
  return `${big}<div class="card"><h3>${m ? "Around the league" : "All matches"}</h3>${fixtureRows(S, R.matches)}<p class="tiny mute mt">Click a match to follow it.</p></div>`;
}

// ---------- golden boot and results ----------
export function bootPanel(S, limit = 5, title = "Golden Boot") {
  const b = (S.boot || []).slice(0, limit); if (!b.length) return "";
  const me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>${title}</h3><table class="tb"><tr><th>#</th><th>Player</th><th class="n">Goals</th></tr>${b.map((x, k) => { const p = pl(x.id), t = team(x.team);
    return `<tr class="${x.team === me ? "me" : ""} ${k === 0 ? "leader" : ""}"><td>${k + 1}</td><td><div class="bootn">${t ? crest(t, 14) : ""}<b>${p ? esc(p.name) : "?"}</b></div></td><td class="n"><b>${x.g}</b></td></tr>`; }).join("")}</table></div>`;
}
function scorerLines(m, side) {
  const by = new Map();
  for (const g of m.goals || []) if (g.team === side) (by.get(g.player) || by.set(g.player, []).get(g.player)).push(g.minute);
  return [...by.entries()].map(([pid, mins]) => `<div class="sc1"><b>${esc(nm(pid))}</b> <span class="mute">${mins.map((x) => x + "'").join(" ")}</span></div>`).join("") || `<div class="sc1 mute">–</div>`;
}
function resRows(ms, me, focus = null) {
  return ms.map((m, i) => `<div class="resrow ${m.a === me || m.b === me ? "mine" : ""} ${i === focus ? "focus" : ""}" ${focus != null ? `data-act="mfocus" data-k="${i}"` : ""}>
    <div class="side l">${tchipK(m.a, 0, 20)}<div class="scs">${scorerLines(m, 0)}</div></div>
    <div class="fscore">${m.score[0]} – ${m.score[1]}</div>
    <div class="side r">${tchipK(m.b, 1, 20)}<div class="scs">${scorerLines(m, 1)}</div></div></div>`).join("");
}
function resultsView(S) {
  const R = S.reveal, me = S.me ? S.me.teamId : -1, k = focusK(S), m = R.matches[k];
  return `<div class="card"><div class="row"><h3 style="margin:0">Matchday ${R.day + 1} results</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="${k}">FT</span></div><div class="mt">${resRows(R.matches, me, k)}</div></div>
    <div class="card"><h3>${tchipK(m.a, 0, 20)} <span class="mute">v</span> ${tchipK(m.b, 1, 20)} · full time</h3><div data-pb="mstats" data-k="${k}"></div></div>`;
}

// ---------- the menu between matches ----------
const HUB_TITLES = { team: "Team", standings: "Standings", store: "Store" };
function hubBar(S, title, back = "hubback", backText = "← Menu") {
  const me = S.me, ready = me && S.teams[me.teamId].ready;
  return `<div class="card hubbar"><button class="btn sm" data-act="${back}">${backText}</button><h3 style="margin:0">${esc(title)}</h3><div class="grow"></div>${me ? `<button class="btn ${ready ? "" : "pri"}" data-act="mready">${ready ? "Ready ✓ (undo)" : "Ready"}</button>` : ""}</div>`;
}
function hubHome(S) {
  const me = S.me, d = S.season.day, fx = (S.season.fixtures || []).find(([a, b]) => me && (a === me.teamId || b === me.teamId));
  const t = me ? S.teams[me.teamId] : null, ready = t && t.ready;
  const rank = t ? (S.table || []).findIndex((r) => r.i === t.id) : -1, row = rank >= 0 ? S.table[rank] : null;
  const have = me ? me.coins : S.pm ? S.pm.coins : 0, rare = S.store && S.store.open && Object.values(S.store.stock || {}).some((n) => n > 0);
  const tile = (to, ic, name, sub, cls = "") => `<button class="hubtile ${cls}" data-act="hubgo" data-to="${to}"><span class="ic">${ic}</span><b>${name}</b><span class="sub">${sub}</span></button>`;
  const next = fx ? `<div class="hubnext">${tchipK(fx[0], 0, 26)}<span class="mute">v</span>${tchipK(fx[1], 1, 26)}</div>` : "";
  const tiles = [
    me ? tile("team", "📋", "Team", `${esc(me.lineup ? me.lineup.formation : "")} · tactics &amp; items${Object.values(me.items || {}).some((n) => n > 0) ? "" : ""}`) : "",
    tile("standings", "🏆", "Standings", row ? `${rank + 1}${["st", "nd", "rd"][rank] || "th"} · ${row.pts} pts · table, results, Golden Boot` : "Table, results, Golden Boot, other teams"),
    tile("store", "🛒", "Store", `${Math.round(have)} coins${rare ? " · <span class=\"rarepip\">rare item in stock</span>" : ""}`),
    me ? `<button class="hubtile ready ${ready ? "on" : ""}" data-act="mready"><span class="ic">${ready ? "✔" : "▶"}</span><b>${me.auto ? "Auto on" : ready ? "Ready" : "Ready"}</b><span class="sub">${ready ? "Locked in. Tap to undo." : "Lock in for the next match"}</span></button>` : "",
  ].join("");
  return `<div class="card hubhead"><div class="row wrap"><h3 style="margin:0">Matchday ${d + 1} of ${S.season.total}</h3><div class="grow"></div><span class="mute small">Next match</span></div>${next}</div>
    <div class="hubgrid">${tiles}</div>${fixturesPreview(S)}`;
}
function teamViewer(S, i) {
  const t = team(i), c = club(t), row = (S.table || []).findIndex((r) => r.i === i), tr = row >= 0 ? S.table[row] : null;
  const ps = t.players.map((id) => pl(id)).filter(Boolean);
  const fit = ps.filter((p) => !p.susp), gk = fit.filter((p) => p.pos === "GK").sort((a, b) => b.ovr - a.ovr)[0];
  const out = fit.filter((p) => p !== gk).sort((a, b) => b.ovr - a.ovr).slice(0, 5), start = new Set([gk, ...out].filter(Boolean).map((p) => p.id));
  const lines = (list) => list.map((p) => `<div class="benchrow tv ${p.susp ? "dim" : ""}"><span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="mute small">${p.pos}${p.user ? " · created player" : ""}</span></span>
    <span class="tiny mute" title="Stamina">${Math.round(p.stam)}%</span>${p.susp ? `<span class="pill bad tiny">SUSP ${p.susp}</span>` : ""}<span class="pill tiny ${p.contract <= 1 ? "warn" : ""}" title="Contract">${p.contract} season${p.contract === 1 ? "" : "s"} left</span></div>`).join("");
  const byOvr = (a, b) => b.ovr - a.ovr, starters = ps.filter((p) => start.has(p.id)).sort((a, b) => (a.pos === "GK" ? -1 : b.pos === "GK" ? 1 : byOvr(a, b))), bench = ps.filter((p) => !start.has(p.id)).sort(byOvr);
  return `${hubBar(S, t.name, "closeteam", "← Standings")}<div class="card"><div class="row wrap" style="gap:14px">${crest(t, 48)}${shirt(c, 0, 56)}<div class="grow"><b style="font-size:20px">${esc(t.name)}</b><div class="mute small">${t.owner ? "Managed by " + esc(t.owner) : "CPU manager"}${tr ? ` · ${row + 1}${["st", "nd", "rd"][row] || "th"} · ${tr.pts} pts (${tr.w}-${tr.d}-${tr.l})` : ""} · ${ps.length}/${t.cap} players</div></div></div>
    <h3 class="mt">Likely line-up</h3><div class="col" style="gap:3px">${lines(starters)}</div>
    ${bench.length ? `<h3 class="mt">Bench</h3><div class="col" style="gap:3px">${lines(bench)}</div>` : ""}
    <p class="tiny mute mt">Line-ups are set at kick-off. This shows the strongest available players. Contract = seasons left, counting this one.</p></div>`;
}
function standingsView(S) {
  if (st.ui.viewTeam != null && team(st.ui.viewTeam)) return teamViewer(S, st.ui.viewTeam);
  const me = S.me ? S.me.teamId : -1, L = S.lastDay;
  const last = L ? `<div class="card"><h3>Matchday ${L.day + 1} results</h3><div class="mt">${resRows(L.matches, me)}</div></div>` : `<div class="card"><h3>Latest results</h3><p class="mute small">No matches played yet.</p></div>`;
  return `${hubBar(S, "Standings")}${tablePanel(S, 99, true)}${last}${bootPanel(S, 10, "Golden Boot race") || `<div class="card"><h3>Golden Boot race</h3><p class="mute small">No goals yet.</p></div>`}`;
}
function hubView(S) {
  if (st.ui.hubDay !== S.season.day || st.ui.hubSeason !== S.seasonNo) { st.ui.hubDay = S.season.day; st.ui.hubSeason = S.seasonNo; st.ui.hub = null; st.ui.viewTeam = null; st.ui.mSel = null; }
  const hub = st.ui.hub;
  if (!hub || (hub === "team" && !S.me)) return hubHome(S);
  if (hub === "team") return hubBar(S, "Team: tactics and items") + lineupEditor(S, false);
  if (hub === "store") return hubBar(S, "Store") + (storeCard(S) || `<div class="card"><p class="mute">The store is closed right now.</p></div>`);
  return standingsView(S);
}

// ---------- the whole view ----------
export function matchView(S, ctx) {
  const me = S.me; let main = "";
  const side = tablePanel(S) + bootPanel(S) + ctx.teamsList(S) + ctx.chatCard(S);
  switch (S.step) {
    case "season.intro":
      main = `<div class="card c"><h3>Season ${S.seasonNo}</h3><p style="font-size:24px;font-weight:800">${S.season.total} matchdays</p><p class="mute mt">Three points for a win, one for a draw. Goal difference, then goals scored, break ties. Top of the table wins the league.</p></div>`;
      break;
    case "md.lineup":
      main = me || S.pm ? hubView(S) : fixturesPreview(S);
      break;
    case "md.half1": case "md.half2":
      main = playbackView(S); break;
    case "md.half":
      main = (me && me.match ? lineupEditor(S, true) : "") + playbackView(S); break;
    case "md.result": main = resultsView(S); break;
    case "season.end": {
      const R = S.reveal, champ = team(R.champion);
      main = `<div class="card champ"><h3>Champions</h3><div class="t">${esc(champ.name)}</div><div class="mt">${crest(champ, 64)}</div><p class="mute mt">${champ.owner ? "Managed by " + esc(champ.owner) : "CPU manager"} · ${R.table[0].pts} points</p>${bootWinner(S)}${S.host && !R.final ? `<button class="btn pri big mt2" data-act="cont">Continue to the off-season</button>` : ""}</div>${bootPanel(S, 10, "Golden Boot, final table")}${R.final ? finalCard(S) : ""}`;
      break;
    }
    default: main = `<div class="card">…</div>`;
  }
  return { main, side };
}
function bootWinner(S) {
  const h = (S.history || []).slice(-1)[0], b = h && h.boot; if (!b) return "";
  return `<p class="mt" style="font-weight:800">⚽ Golden Boot: ${esc(b.name)} (${esc(team(b.team) ? team(b.team).name : "")}) · ${b.g} goals</p>`;
}
function finalCard(S) {
  const h = S.history || [], wins = new Map();
  for (const x of h) wins.set(x.champion, (wins.get(x.champion) || 0) + 1);
  return `<div class="card"><h3>Hall of champions</h3><table class="tb"><tr><th>Season</th><th>Champion</th><th class="n">Points</th><th>Golden Boot</th></tr>${h.map((x) => `<tr><td>${x.season}</td><td>${chip(team(x.champion), 18, true)}</td><td class="n">${x.pts}</td><td>${x.boot ? esc(x.boot.name) + " <span class=\"mute\">(" + x.boot.g + ")</span>" : "–"}</td></tr>`).join("")}</table><p class="mute small mt">That was the last season of this game.</p></div>`;
}
function fixturesPreview(S) {
  const fx = S.season.fixtures || [], me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>Matchday ${S.season.day + 1} fixtures</h3>${fx.map(([a, b]) => `<div class="fixture ${a === me || b === me ? "mine" : ""}"><div class="l">${tchipK(a, 0)}</div><div class="score mute">v</div><div>${tchipK(b, 1)}</div></div>`).join("")}</div>`;
}
