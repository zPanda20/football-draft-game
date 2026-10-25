// Matchdays: line-up editor, half-time changes, live playback of the halves, results and the league table.
import { st, $, $$, esc, send, team, chip, crest, club, kitImg, shirt, matchColors, kitsFor, pl, tierOf, posGroup, flag, miniPlayer, remaining, card, longName, userTags, lum } from "./core.js";
import { transfersView, winOpen, winCountdown, incomingOffers } from "./transfers.js";
import { ratings, ratingClass } from "./rating.js";
import { storeCard } from "./store.js";
import { statsHandlers, playerStats, awardsCard } from "./stats.js";
import { frontPage } from "./life.js";
import { goalCall } from "./skin.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// A team with its kit right next to the crest (side 0 = home kit, 1 = away kit).
// opp = the other team of the match: with it the kit is the one the side really wears (a colour clash sends one side to its third kit).
const kitOf = (ti, opp, side) => { if (opp == null || !team(opp)) return side; const k = side ? kitsFor(club(team(opp)), club(team(ti))) : kitsFor(club(team(ti)), club(team(opp))); return side ? k.a : k.h; };
// "Away side in its third kit": shown under your next fixture when the colours would have clashed.
const KITNAME = { kitHome: "home", kitAway: "away", kitThird: "third" };
function kitNote(fx) {
  const a = team(fx[0]), b = team(fx[1]); if (!a || !b) return "";
  const k = kitsFor(club(a), club(b)); if (!k.swap && !k.clash) return "";
  const who = k.swap === "home" ? a : b, kit = k.swap === "home" ? k.h : k.a;
  return `<div class="tiny mute c mt">${k.swap ? `${esc(who.name)} change to their ${KITNAME[kit]} kit: the colours are too close.` : "The colours are close, but there is no kit that fixes it."}</div>`;
}
const tchipK = (ti, side, size = 18, opp = null) => { const t = team(ti); return `<span class="tchip">${crest(t, size)}${shirt(club(t), kitOf(ti, opp, side), size + 6)}<span class="n">${esc(t.name)}</span></span>`; };

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
// Which side of the pitch a slot is on (mirrors slotSides in engine/roster.js): a pair of the same slot is left then right.
const sidesOf = (slots) => slots.map((s, i) => (WIDTH[s] ? WIDTH[s] : slots.filter((x) => x === s).length === 2 ? (slots.indexOf(s) === i ? -1 : 1) : 0));
const LINE = { GK: "gk", CB: "back", LB: "back", RB: "back", CDM: "mid", CM: "mid", LM: "mid", RM: "mid", CAM: "mid", LW: "fwd", RW: "fwd", ST: "fwd" };
function fit(pos, slot, side = 0) {
  const F = st.cat.fit, xy = st.cat.xy;
  if (slot === "GK") return pos === "GK" ? 1 : F.outfieldInGoal;
  if (pos === slot) return 1;
  if (pos === "GK") return F.gkInOutfield;
  const [d1, w1] = xy[pos], [d2, w2] = xy[slot], dd = Math.abs(d1 - d2), sw = w2 || side;
  const miss = w1 === 0 ? (w2 !== 0 ? 1 : 0) : sw === w1 ? 0 : sw === 0 ? 1 : 2;
  if (LINE[pos] === LINE[slot]) return Math.max(F.floor, 1 - F.lineUnit * Math.max(0, dd - 0.5) - F.sideUnit * miss);
  return Math.max(F.floor, 1 - F.perUnit * Math.hypot(dd, miss * F.widthWeight));
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
const clearHints = () => $$(".slot[data-hint]").forEach((n) => { if (!st.ui.itemSel) { n.removeAttribute("data-hint"); n.classList.remove("itemtarget"); } });
document.addEventListener("dragstart", (e) => {
  const c = e.target.closest && e.target.closest('[data-act="itemchip"]');
  if (c) {
    const it = st.items[c.dataset.id]; if (!it || it.scope !== "player") return e.preventDefault();
    dragFrom = { kind: "item", val: c.dataset.id };
    try { e.dataTransfer.setData("text/plain", "item"); e.dataTransfer.effectAllowed = "copy"; } catch (x) { /* ignore */ }
    $$('.slot').forEach((n) => { if (!n.querySelector(".tok.empty")) { n.dataset.hint = fxBadge(it); n.classList.add("itemtarget"); } });
    c.classList.add("dragging"); return;
  }
  const n = dndTarget(e); if (!n) return;
  dragFrom = n.dataset.act === "mslot" ? { kind: "slot", val: +n.dataset.i } : { kind: "p", val: +n.dataset.id };
  try { e.dataTransfer.setData("text/plain", "swap"); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* ignore */ }
  n.classList.add("dragging");
});
document.addEventListener("dragend", () => { dragFrom = null; $$(".dragging,.dropover").forEach((n) => n.classList.remove("dragging", "dropover")); clearHints(); });
const okTarget = (n) => n && dragFrom && (dragFrom.kind !== "item" || n.dataset.act === "mslot");
document.addEventListener("dragover", (e) => { const n = dndTarget(e); if (okTarget(n)) { e.preventDefault(); n.classList.add("dropover"); } });
document.addEventListener("dragleave", (e) => { const n = dndTarget(e); if (n) n.classList.remove("dropover"); });
document.addEventListener("drop", (e) => {
  const n = dndTarget(e); if (!okTarget(n)) return; e.preventDefault();
  const from = dragFrom; dragFrom = null;
  if (from.kind === "item") { const l = lineupOf(st.S), pid = +n.dataset.i < 0 ? l.gk : l.out[+n.dataset.i]; clearHints(); if (pid != null) attachItem(from.val, pid); return; }
  const to = n.dataset.act === "mslot" ? { kind: "slot", val: +n.dataset.i } : { kind: "p", val: +n.dataset.id };
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
  ...statsHandlers,
  cont() { send({ t: "continue" }); },
  mslot(a) {
    if (st.ui.itemSel) { const l = lineupOf(st.S), pid = +a.i < 0 ? l.gk : l.out[+a.i]; if (pid != null) return attachItem(st.ui.itemSel, pid); }
    choose("slot", +a.i);
  },
  itemchip(a) {
    const it = st.items[a.id]; if (!it) return;
    if (it.scope === "team") { const act = activeNow(st.S), on = act.includes(a.id); return send({ t: "items", ids: on ? act.filter((x) => x !== a.id) : [...act, a.id].slice(-st.cat.rules.activeCap), equip: st.S.me.equip || {} }); }
    st.ui.itemSel = st.ui.itemSel === a.id ? null : a.id; st.ui.mSel = null; st.render();
  },
  itemoff(a) { detachItem(a.id); },
  mcancel() { st.ui.mSel = null; st.render(); },
  lead(a) { st.ui.lead = a.k; st.render(); },
  hubgo(a) { st.ui.hub = a.to; st.ui.mSel = null; st.render(); window.scrollTo(0, 0); },
  finTab(a) { st.ui.finTab = +a.k; st.render(); },
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
  planskip() { send({ t: "planSkip" }); },
  plantoggle() { const p = curPlan(); sendPlan({ ...p, on: !p.on }); },
  plantired(a, el) { const p = curPlan(); sendPlan({ ...p, tired: { ...p.tired, on: !!el.checked } }); },
  plantiredbelow(a) { const p = curPlan(); sendPlan({ ...p, tired: { ...p.tired, below: +a.value } }); },
  planadd() { const p = curPlan(); if (p.subs.length < 4) sendPlan({ ...p, subs: [...p.subs, { out: null, in: null, when: "always" }] }); },
  plandel(a) { const p = curPlan(); sendPlan({ ...p, subs: p.subs.filter((x, i) => i !== +a.i) }); },
  plansub(a) { const p = curPlan(); sendPlan({ ...p, subs: p.subs.map((x, i) => (i === +a.i ? { ...x, [a.f]: a.f === "when" ? a.value : a.value === "" ? null : +a.value } : x)) }); },
};
// ---------- substitution plan ----------
const curPlan = () => { const p = st.S.me.plan; return p ? { on: p.on !== false, tired: { on: !!p.tired.on, below: p.tired.below }, subs: p.subs.map((x) => ({ ...x })) } : { on: true, tired: { on: false, below: 45 }, subs: [] }; };
const sendPlan = (plan) => send({ t: "plan", plan });
const WHEN_L = { always: "always", tired: "if he is tired", losing: "if we are losing", drawing: "if it is level", winning: "if we are winning" };

// ---------- league table ----------
export function tablePanel(S, limit = 99, click = false) {
  const rows = (S.table || []).slice(0, limit);
  if (!rows.length) return "";
  const me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>League table</h3><table class="tb"><tr><th>#</th><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th></tr>
    ${rows.map((r, k) => `<tr class="${r.i === me ? "me" : ""} ${k === 0 && r.p ? "leader" : ""} ${click ? "clickable" : ""}" ${click ? `data-act="viewteam" data-i="${r.i}" title="See this team"` : ""}><td>${k + 1}</td><td>${chip(team(r.i), 18)}${userTags(team(r.i))}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="n"><b>${r.pts}</b></td></tr>`).join("")}</table></div>`;
}

// ---------- line-up editor ----------
// ---------- items: drag them onto a player ----------
const ICON = (id) => (id.startsWith("boots") ? "👟" : id === "steroids" ? "💉" : id === "ice-bath" ? "🧊" : "🧰");
const FXL = { off: "ATT", all: "ALL", rec: "STA", atk: "ATT", def: "DEF", ctl: "CTL", gk: "GK", recover: "STA" };
function fxBadge(it) {
  const parts = Object.entries(it.fx).filter(([k]) => FXL[k]).map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(v)} ${FXL[k]}`);
  if (it.fx.drain) parts.push(`${Math.round(it.fx.drain * 100)}% drain`);
  return parts.join(" ") || "";
}
const wornBy = (S, pid, act) => Object.entries(S.me.equip || {}).filter(([id, p]) => p === pid && act.includes(id)).map(([id]) => id);
function attachItem(id, pid) {
  const S = st.S, it = st.items[id]; if (!it || it.scope !== "player" || !((S.me.items || {})[id] > 0)) return;
  let act = activeNow(S); if (!act.includes(id)) act = [...act, id].slice(-st.cat.rules.activeCap);
  send({ t: "items", ids: act, equip: { ...(S.me.equip || {}), [id]: pid } }); st.ui.itemSel = null; st.render();
}
function detachItem(id) {
  const S = st.S, eq = { ...(S.me.equip || {}) }; delete eq[id];
  send({ t: "items", ids: activeNow(S).filter((x) => x !== id), equip: eq }); st.render();
}
const t_users = (S) => S.teams[S.me.teamId].players.map((id) => pl(id)).filter((p) => p && p.user);
function itemsTray(S, l) {
  const me = S.me, owned = Object.keys(me.items || {}).filter((id) => me.items[id] > 0 && st.items[id]); if (!owned.length) return "";
  const act = activeNow(S), cap = st.cat.rules.activeCap, inLine = new Set([l.gk, ...l.out]);
  const users = t_users(S);
  const chip = (id) => {
    const it = st.items[id], on = act.includes(id), sel = st.ui.itemSel === id, who = (me.equip || {})[id], wp = who != null ? pl(who) : null;
    const state = it.scope === "team" ? (on ? "On for this match" : "Off") : wp && on ? `Worn by <b>${esc(wp.name)}</b>${inLine.has(who) ? "" : " (benched, not used)"}` : on ? "Auto: best attacker" : sel ? "Now click a player on the pitch" : "Drag onto a player";
    return `<div class="ichip ${it.scope} ${on ? "on" : ""} ${sel ? "sel" : ""} ${it.banned ? "rare" : ""}" data-act="itemchip" data-id="${id}" draggable="${it.scope === "player"}" title="${esc(it.text || "")}">
      <span class="ico">${it.banned ? `<img class="wadamark" src="/assets/wada-mark.png" alt="WADA" width="22" height="22">` : ICON(id)}</span><span class="grow"><b>${esc(it.name)}</b> <span class="fxb">${esc(fxBadge(it))}</span><span class="ist">${state}${it.banned ? " · <span class=\"neg\">51% caught: banned for the season</span>" : ""}</span></span>
      ${it.scope === "player" ? users.map((u) => `<button class="btn sm" data-act="mgift" data-id="${id}" data-pid="${u.id}" title="Hand it to the created player: it goes in his own kit">Give to ${esc(u.name.split(" ")[0])}</button>`).join("") : ""}
      <span class="tiny mute">×${me.items[id]}</span>${on && it.scope === "player" && who != null ? `<button class="x" data-act="itemoff" data-id="${id}" title="Take it off">✕</button>` : ""}</div>`;
  };
  return `<div class="card itray"><div class="row wrap"><h3 style="margin:0">Items</h3><span class="mute small">${act.length}/${cap} in use this match</span><div class="grow"></div></div>
    <p class="tiny mute" style="margin:4px 0 8px">Team items switch on with a click. For boots and the rest, <b>drag the item onto a player</b> on the pitch (or click it, then click the player). The stat it lifts is shown on every player while you hold it.</p>
    <div class="ichips">${owned.map(chip).join("")}</div></div>`;
}
function pitch(S, l, stamOf) {
  const slots = S.formations[l.formation], pos = layout(slots), sides = sidesOf(slots);
  const sel = st.ui.mSel;
  const one = (slotName, pid, i, at) => {
    const p = pid != null ? pl(pid) : null, f = p ? fit(p.pos, slotName, sides[i]) : 1, s = p ? Math.round(stamOf(pid)) : 0;
    const isSel = sel && ((sel.kind === "slot" && sel.val === i) || (sel.kind === "p" && p && sel.val === pid));
    const loss = p ? tiredLoss(p.ovr, s) : 0;
    const pic = p && !p.img && p.slug && st.cat && st.cat.pics ? st.cat.pics[p.slug] : null;   // real-player portrait, when one exists
    const isel = st.ui.itemSel && st.items[st.ui.itemSel], worn = p && S.me ? wornBy(S, pid, activeNow(S)) : [];
    return `<div class="slot pgb-${posGroup(slotName)} ${sel && !isSel ? "swappable" : ""} ${isel && p ? "itemtarget" : ""}" ${isel && p ? `data-hint="${esc(fxBadge(isel))}"` : ""} style="left:${at.x}%;top:${at.y}%" data-act="mslot" data-i="${i}" draggable="true">
      ${p ? `<button class="pinfo" data-act="pcard" data-id="${pid}" title="Full player card" aria-label="Open full card">i</button>` : ""}${worn.length ? `<div class="ib">${worn.map((id) => `<span title="${esc(st.items[id].name)}">${ICON(id)}</span>`).join("")}</div>` : ""}
      <div class="tok ${p ? tierOf(p.ovr) : "empty"} ${pic ? "haspic" : ""} ${isSel ? "sel" : ""}">${pic ? `<img class="tpic" src="${esc(pic)}" alt="" draggable="false"><span class="tovr">${p.ovr}</span>` : p ? p.ovr : "?"}${loss >= 2 ? `<span class="dn" title="Tired: plays about ${loss} points below his rating">−${loss}</span>` : ""}</div>
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
const FORM_INFO = {
  "2-1-2": ["The Direct Strike", "One playmaker feeds two forwards: more shots, less of the ball. The lone midfielder tires fast. Needs a high-PASS playmaker."],
  "2-2-1": ["The Possession Core", "Two midfielders keep the ball and the opponent gets fewer shots. Needs PASS and DRIBBLE in midfield and a physical, clinical striker."],
  "3-1-1": ["The Defensive Block", "Three deep defenders cut the chances you concede; you attack on the counter. Needs strong DEFENCE and PHYSICAL at the back and a pacey striker."],
  "1-3-1": ["The High Press", "A three-man midfield wins the ball back and controls the game, but tires. A lost tackle exposes the lone defender, so he needs PACE."],
  "1-2-2": ["The All-Out Attack", "Two strikers, runners behind them: lots of shots at both ends. Needs PACE and DRIBBLE up front and a quick centre-back."],
  "2-2-1 wide": ["Wide Play", "Fullbacks and wingers stretch the pitch for more shots, but leave gaps to counter. Beats a central overload; the block pulls apart."],
};
function subPlanCard(S, l) {
  const me = S.me, plan = curPlan(), t = team(me.teamId), xi = new Set([l.gk, ...l.out]);
  const roster = t.players.map((id) => pl(id)).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const opt = (sel, first, second, lf, ls) => `<option value="">Choose a player</option><optgroup label="${lf}">${first.map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""} ${p.susp ? "disabled" : ""}>${esc(p.name)} · ${p.pos} ${p.ovr}${p.susp ? " (suspended)" : ""}</option>`).join("")}</optgroup><optgroup label="${ls}">${second.map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""} ${p.susp ? "disabled" : ""}>${esc(p.name)} · ${p.pos} ${p.ovr}${p.susp ? " (suspended)" : ""}</option>`).join("")}</optgroup>`;
  const starters = roster.filter((p) => xi.has(p.id)), bench = roster.filter((p) => !xi.has(p.id));
  const issue = (s) => {
    if (s.out == null || s.in == null) return "Pick both players";
    const o = pl(s.out), n = pl(s.in); if (!o || !n) return "That player has left";
    if (!xi.has(s.out)) return `${o.name.split(" ").slice(-1)[0]} is not in the starting XI, so this is skipped`;
    if (xi.has(s.in)) return `${n.name.split(" ").slice(-1)[0]} is already starting`;
    if ((s.out === l.gk) !== (n.pos === "GK")) return "Only a keeper can replace the keeper";
    return "";
  };
  const rows = plan.subs.map((s, i) => { const w = issue(s);
    return `<div class="subrow ${w ? "warn" : ""}"><div class="subsel"><label><span class="tiny mute">Off</span><select data-change="plansub" data-i="${i}" data-f="out">${opt(s.out, starters, bench, "Starting XI", "Bench")}</select></label>
      <label><span class="tiny mute">On</span><select data-change="plansub" data-i="${i}" data-f="in">${opt(s.in, bench, starters, "Bench", "Starting XI")}</select></label>
      <label><span class="tiny mute">When</span><select data-change="plansub" data-i="${i}" data-f="when">${Object.entries(WHEN_L).map(([k, v]) => `<option value="${k}" ${s.when === k ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select></label>
      <button class="x" data-act="plandel" data-i="${i}" title="Remove this substitution">✕</button></div>${w ? `<div class="tiny subwarn">${esc(w)}</div>` : ""}</div>`; }).join("");
  const n = plan.subs.length + (plan.tired.on ? 1 : 0);
  return `<div class="card plancard mt"><div class="row wrap"><h3 style="margin:0">Substitution plan</h3><span class="pill ${plan.on && n ? "good" : ""} tiny">${!plan.on ? "off" : n ? `${n} rule${n === 1 ? "" : "s"} set` : "nothing planned"}</span><div class="grow"></div><button class="btn sm ${plan.on ? "on" : ""}" data-act="plantoggle">${plan.on ? "Plan on" : "Plan off"}</button></div>
    <p class="tiny mute" style="margin:6px 0 8px">Changes made at half-time for you. At the break you see them already applied and can change anything, or undo the plan, before you press Ready. It stays set for every match until you change it.</p>
    <div class="${plan.on ? "" : "dim"}">
    <label class="tiredrule"><input type="checkbox" data-change="plantired" ${plan.tired.on ? "checked" : ""}> <span>Swap tired players for the best fresh player on the bench, below</span>
      <select data-change="plantiredbelow">${[...new Set([30, 40, 45, 50, 60, 70, plan.tired.below])].sort((a, b) => a - b).map((v) => `<option value="${v}" ${plan.tired.below === v ? "selected" : ""}>${v}% stamina</option>`).join("")}</select></label>
    ${rows}
    <div class="row mt" style="gap:8px"><button class="btn sm" data-act="planadd" ${plan.subs.length >= 4 ? "disabled" : ""}>+ Add a substitution</button><span class="tiny mute">${plan.subs.length}/4 · the plan only uses players who are fit and on the right side of the line-up when the match starts</span></div></div></div>`;
}
// At half-time: what the plan did, and the way to take it back.
function planBanner(S) {
  const h = S.me.match && S.me.match.halftime, p = S.me.plan; if (!h) return "";
  const pt = h.plan, anyRule = p && p.on !== false && (p.subs.length || p.tired.on);
  if (!pt) return anyRule ? `<div class="plannote mt"><b>Substitution plan:</b> no change was needed this half.</div>` : "";
  const list = pt.changes.map((c) => { const o = pl(c.out), n = pl(c.in); return `<span class="chg"><span class="neg">▼ ${esc(o ? o.name : "?")}</span> <span class="pos">▲ ${esc(n ? n.name : "?")}</span> <span class="tiny mute">${c.why === "tired" ? "tired" : c.why === "always" ? "planned" : WHEN_L[c.why]}</span></span>`; }).join("");
  const state = pt.skipped ? `<span class="tiny mute">Plan skipped for this match.</span>` : pt.over ? `<span class="tiny mute">You changed the line-up after the plan.</span>` : `<span class="tiny mute">Will happen at the restart unless you change it.</span>`;
  return `<div class="plannote mt ${pt.over ? "over" : ""}"><div class="row wrap" style="gap:8px"><b>Substitution plan</b>${state}<div class="grow"></div>${pt.over ? "" : `<button class="btn sm" data-act="planskip">Undo plan</button>`}</div><div class="chgs">${list}</div></div>`;
}
function lineupEditor(S, half) {
  const me = S.me, t = team(me.teamId);
  const l = half ? me.match.halftime.lineup : me.lineup;
  const stamOf = half ? (id) => me.match.halftime.stamina[id] ?? 100 : (id) => pl(id).stam;
  const onPitch = new Set([l.gk, ...l.out]);
  const sel = st.ui.mSel;
  // The bench: everyone not in the XI, grouped by position (GK, defenders, midfielders, attackers), best first inside a position, suspended last.
  const POS_ORDER = ["GK", "CB", "LB", "RB", "CDM", "CM", "LM", "RM", "CAM", "LW", "RW", "ST"], posRank = (p) => { const i = POS_ORDER.indexOf(p.pos); return i < 0 ? 99 : i; };
  const roster = t.players.map((id) => pl(id)).filter((p) => !onPitch.has(p.id)).sort((a, b) => (a.susp ? 1 : 0) - (b.susp ? 1 : 0) || posRank(a) - posRank(b) || b.ovr - a.ovr);
  const row = (p) => p.susp ? `<div class="benchrow g-${posGroup(p.pos)} dim"><span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="pg pg-${posGroup(p.pos)}">${esc(p.pos)}</span></span><span class="pill bad tiny">SUSP ${p.susp}</span><button class="pinfo" data-act="pcard" data-id="${p.id}" title="Full player card" aria-label="Open full card">i</button></div>` : `<div class="benchrow g-${posGroup(p.pos)} ${sel && sel.kind === "p" && sel.val === p.id ? "sel" : sel ? "swappable" : ""}" data-act="mplayer" data-id="${p.id}" draggable="true">
    <span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="pg pg-${posGroup(p.pos)}">${esc(p.pos)}</span></span>
    <span class="tiny mute" title="Stamina. Tired players play below their rating.">${Math.round(stamOf(p.id))}%${tiredLoss(p.ovr, stamOf(p.id)) >= 2 ? ` <span class="neg">−${tiredLoss(p.ovr, stamOf(p.id))}</span>` : ""}</span><button class="pinfo" data-act="pcard" data-id="${p.id}" title="Full player card" aria-label="Open full card">i</button></div>`;
  const tile = (p) => {
    const sv = Math.round(stamOf(p.id)), loss = tiredLoss(p.ovr, sv), cls = p.susp ? "dim" : sel && sel.kind === "p" && sel.val === p.id ? "sel" : sel ? "swappable" : "";
    return `<div class="tcard ${cls}" ${p.susp ? "" : `data-act="mplayer" data-id="${p.id}" draggable="true"`}>${card(p.id, { size: "sm", info: true, tag: p.susp ? `Susp. ${p.susp}` : " " })}
      <div class="tstam"><i class="${sv < 35 ? "low" : sv < 60 ? "mid" : ""}" style="width:${sv}%"></i></div><div class="tmeta" style="padding:0 6px 4px;color:var(--mute)"><span>${sv}%</span>${loss >= 2 ? `<span class="tdn">−${loss}</span>` : ""}</div></div>`;
  };
  const isReady = t.ready;
  const forms = Object.keys(S.formations).map((f) => `<button class="btn sm ${l.formation === f ? "on" : ""}" data-act="mform" data-f="${f}">${f}</button>`).join("");
  const head = half ? `<div class="bigmatch"><div class="tm">${chip(team(me.match.side ? me.match.opponent : me.teamId), 26)}</div><div class="sc">${me.match.halftime.score[0]} – ${me.match.halftime.score[1]}</div><div class="tm">${chip(team(me.match.side ? me.teamId : me.match.opponent), 26)}</div></div><p class="c mute small">Half-time. Tired players play worse in the second half (the red number is how many rating points). Players on the bench keep their stamina.</p>` : "";
  return `<div class="card"><div class="row wrap">${half ? "" : kitImg(club(t), "kitHome", 40)}<h3 style="margin:0">${half ? "Half-time changes" : "Line-up"}</h3><div class="grow"></div>
      <button class="btn sm" data-act="mbest">Best XI</button><button class="btn sm ${me.auto ? "on" : ""}" data-act="auto">Auto ${me.auto ? "on" : "off"}</button>
      ${half ? `<button class="btn ${isReady ? "" : "pri"}" data-act="mready">${isReady ? "Not ready" : "Ready"}</button>` : ""}</div>
    ${head}<div class="forms mt">${forms}</div>${FORM_INFO[l.formation] ? `<div class="formnote"><b>${FORM_INFO[l.formation][0]}.</b> ${FORM_INFO[l.formation][1]}</div>` : ""}
    ${half ? planBanner(S) : subPlanCard(S, l)}
    ${half ? "" : `<div class="mt">${itemsTray(S, l)}</div>`}
    <div class="pitchfirst mt">${swapHint(sel)}${pitch(S, l, stamOf)}<div class="tray"><div class="th"><b>Bench</b><span>${roster.length} player${roster.length === 1 ? "" : "s"} · drag a card onto the pitch to swap, or tap two players</span></div><div class="tl" data-keep="bench">${roster.map(tile).join("") || `<div class="tiny mute" style="padding:8px">Nobody on the bench.</div>`}</div></div></div></div>`;
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
  if (e.type === "goal") return `<div class="ev goal"><span class="min">${clock}</span>⚽ <b>${esc(nm(e.player))}</b> scores for ${esc(tm.name)}${e.fast ? " on the break" : ""}${e.assist != null ? ` <span class="mute">(assist ${esc(nm(e.assist))})</span>` : ""}${e.xg != null ? ` <span class="xg" title="Chance of scoring for an average keeper">xG ${e.xg.toFixed(2)}</span>` : ""}</div>`;
  if (e.type === "tackle" || e.type === "intercept") return `<div class="ev def"><span class="min">${clock}</span>🛡 ${esc(nm(e.player))} ${e.type === "tackle" ? "wins a tackle" : "cuts out the pass"}</div>`;
  if (e.type === "save") return `<div class="ev"><span class="min">${clock}</span>🧤 ${e.fast ? "Breakaway! " : ""}${esc(nm(e.player))} shoots, ${esc(nm(e.keeper))} saves${e.xg != null ? ` <span class="xg" title="Chance of scoring for an average keeper">xG ${e.xg.toFixed(2)}</span>` : ""}</div>`;
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
  const ph = Math.round(possAt(k, now) * 100), shots = [0, 0], xg = [0, 0]; for (const e of k.ev) if (e.type === "goal" || e.type === "save") { shots[e.team]++; xg[e.team] += e.xg || 0; }
  return `<div class="mstat"><div class="mrow"><span class="lg"><i style="background:${HOME_C}"></i>${esc(team(m.a).name)}</span><b class="mtitle">Momentum</b><span class="lg"><i style="background:${AWAY_C}"></i>${esc(team(m.b).name)}</span></div>${mom}
    <div class="axis"><span>0'</span><span>HT</span><span>90'</span></div>
    <div class="mrow mt"><b class="num">${ph}%</b><b class="mtitle">Possession</b><b class="num">${100 - ph}%</b></div>
    <div class="pbar"><i style="width:${ph}%;background:${HOME_C}"></i><i style="width:${100 - ph}%;background:${AWAY_C}"></i></div>${poss}
    <div class="mrow mt"><b class="num">${shots[0]}</b><b class="mtitle">Shots</b><b class="num">${shots[1]}</b></div>
    <div class="xgbar"><div class="mrow"><b class="num">${xg[0].toFixed(2)}</b><b class="mtitle">Expected goals</b><b class="num">${xg[1].toFixed(2)}</b></div><div class="xb"><i style="width:${xg[0] + xg[1] > 0 ? (xg[0] / (xg[0] + xg[1])) * 100 : 50}%;background:${HOME_C}"></i><i style="width:${xg[0] + xg[1] > 0 ? (xg[1] / (xg[0] + xg[1])) * 100 : 50}%;background:${AWAY_C}"></i></div></div></div>`;
}

// ---------- line-ups with live ratings ----------
function ratedSides(m, half) {
  const first = half ? m.first : m.lineups, second = half ? m.lineups : null;
  return [0, 1].map((i) => ({ first: first[i], second: second ? second[i] : null, group: { ...(first[i] && first[i].grp), ...(second && second[i] && second[i].grp) } }));
}
function lineupsPanel(m, half, now, final) {
  const evs = (m.all || m.events || []).filter((e) => e.minute <= now), R = ratings(evs, ratedSides(m, half), { final, half2: !!half });
  const best = final ? (m.potm != null ? String(m.potm) : Object.keys(R).sort((a, b) => R[b].r - R[a].r)[0]) : null;
  const col = (i) => {
    const first = (half ? m.first : m.lineups)[i], second = half ? m.lineups[i] : null;
    const order = [first.gk, ...first.out, ...(second ? [second.gk, ...second.out] : [])].filter((x, k, a) => x != null && a.indexOf(x) === k);
    const t = team(i === 0 ? m.a : m.b), rows = order.filter((id) => R[id]).map((id) => {
      const o = R[id], p = pl(id), on = !second || [second.gk, ...second.out].includes(id), g = [];
      if (o.g) g.push(`⚽${o.g > 1 ? "×" + o.g : ""}`); if (o.a) g.push(`🅰${o.a > 1 ? "×" + o.a : ""}`);
      const small = [o.kp ? `${o.kp} KP` : "", o.tk ? `${o.tk} TK` : "", o.ic ? `${o.ic} INT` : "", o.sv ? `${o.sv} SV` : "", o.sh ? `${o.sh} SH` : ""].filter(Boolean).join(" · ");
      return `<div class="lrow ${on ? "" : "off"}"><span class="rt ${ratingClass(o.r)}">${o.r.toFixed(1)}</span><span class="pg pg-${posGroup(p ? p.pos : "CM")}">${esc(p ? p.pos : "")}</span><span class="grow nm">${esc(p ? p.name : "?")}${String(id) === best ? " ⭐" : ""}</span><span class="stx">${g.join(" ")}${small ? `<small>${small}</small>` : ""}</span></div>`;
    }).join("");
    return `<div class="lcol"><div class="lhead">${crest(t, 18)}<b>${esc(t.name)}</b><span class="mute small">${esc((half ? m.lineups[i] : first).formation)}</span></div>${rows}</div>`;
  };
  return `<div class="lineups">${col(0)}${col(1)}</div>${final ? '<p class="tiny mute mt">⭐ player of the match. KP chances created, TK tackles, INT interceptions, SV saves, SH shots.</p>' : '<p class="tiny mute mt">Ratings update with every event.</p>'}`;
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
    if (n.dataset.pb === "lineups") {
      const now = clamp(half * 45 + t * 45, 0, 90), final = S.step === "md.result" || (S.step === "md.half2" && t >= 1), cnt = (m.all || m.events || []).filter((e) => e.minute <= now).length, key = `${S.step}|${S.reveal.seq}|${k}|${cnt}|${final}`;
      if (n.dataset.last !== key) { n.dataset.last = key; n.innerHTML = lineupsPanel(m, half, now, final); }
      continue;
    }
    const s = matchState(m, half, t);
    if (n.dataset.pb === "score") {
      const txt = `${s.sc[0]} – ${s.sc[1]}`;
      if (n.textContent !== txt) {
        if (n.textContent) {
          n.classList.remove("goalflash"); void n.offsetWidth; n.classList.add("goalflash");
          const bar = n.closest(".sbar");
          if (bar) { bar.classList.remove("burst"); void bar.offsetWidth; bar.classList.add("burst"); const g = s.events.filter((e) => e.type === "goal").pop(); if (g) goalCall(nm(g.player), team(g.team ? m.b : m.a).name, g.minute); }
        }
        n.textContent = txt;
      }
    } else if (n.dataset.pb === "ticker") {
      const html = s.events.slice().reverse().map((e) => evLine(m, e)).join("") || `<span class="mute small">${half ? "Second half under way." : "Kick-off."}</span>`;
      if (n.dataset.last !== html) { n.innerHTML = html; n.dataset.last = html; }
    }
  }
}
function fixtureRows(S, ms) {
  const me = S.me ? S.me.teamId : -1;
  return ms.map((m, k) => `<div class="fixture ${m.a === me || m.b === me ? "mine" : ""} ${k === focusK(S) ? "focus" : ""}" data-act="mfocus" data-k="${k}" title="Show this match"><div class="l">${tchipK(m.a, 0, 18, m.b)}</div><div class="score" data-pb="score" data-k="${k}"></div><div>${tchipK(m.b, 1, 18, m.a)}</div></div>`).join("");
}
function focusK(S) {
  const R = S.reveal;
  const own = S.me && S.me.match ? S.me.match.index : S.pm && S.pm.team != null ? R.matches.findIndex((x) => x.a === S.pm.team || x.b === S.pm.team) : -1;   // your club's match: a manager's or a footballer's
  const mine = own;
  if (st.ui.focusDay !== R.day) { st.ui.focusDay = R.day; st.ui.focus = null; }
  return st.ui.focus != null && R.matches[st.ui.focus] ? st.ui.focus : mine >= 0 ? mine : 0;
}
// The broadcast scoreboard: both clubs in their colours with crest and kit, the score in the middle, the clock under it.
function scoreboard(S, m, k) {
  const [HC, AC] = matchColors(club(team(m.a)), club(team(m.b))), ink = (c) => (lum(c) > 0.4 ? "#10151b" : "#ffffff");
  const half = S.step === "md.half1" ? "First half" : S.step === "md.half" ? "Half-time" : S.step === "md.half2" ? "Second half" : "Full time";
  const one = (ti, opp, side, cls) => `<div class="sbs ${cls}">${crest(team(ti), 52)}${shirt(club(team(ti)), kitOf(ti, opp, side), 46)}<span class="tn">${esc(team(ti).name)}</span></div>`;
  return `<div class="sbar" id="sbar" data-k="${k}" style="--hc:${HC};--ac:${AC};--hn:${ink(HC)};--an:${ink(AC)}">${one(m.a, m.b, 0, "h")}<div class="mid"><div class="sc" data-pb="score" data-k="${k}"></div><div class="clk" data-pb="clock" data-k="${k}"></div><div class="half">${half}</div></div>${one(m.b, m.a, 1, "a")}</div>`;
}
function playbackView(S) {
  const R = S.reveal, me = S.me;
  const mine = focusK(S);
  const m = R.matches[mine] || null;
  const big = m ? `${scoreboard(S, m, mine)}<div class="card"><div class="ticker" data-pb="ticker" data-k="${mine}"></div><div data-pb="mstats" data-k="${mine}"></div></div>
    <div class="card"><h3>Line-ups and ratings</h3><div data-pb="lineups" data-k="${mine}"></div></div>` : `<div class="card"><div class="row"><h3 style="margin:0">Matchday ${R.day + 1}</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="0"></span></div></div>`;
  return `${big}<div class="card"><h3>${m ? "Around the league" : "All matches"}</h3>${fixtureRows(S, R.matches)}<p class="tiny mute mt">Click a match to follow it.</p></div>`;
}

// ---------- golden boot and results ----------
export function bootPanel(S, limit = 5, title = "Golden Boot") {
  const b = (S.boot || []).slice(0, limit); if (!b.length) return "";
  const me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>${title}</h3><table class="tb"><tr><th>#</th><th>Player</th><th class="n">Goals</th></tr>${b.map((x, k) => { const p = pl(x.id), t = team(x.team);
    return `<tr class="${x.team === me ? "me" : ""} ${k === 0 ? "leader" : ""}"><td>${k + 1}</td><td><div class="bootn">${t ? crest(t, 14) : ""}<b>${p ? esc(p.name) : "?"}</b></div></td><td class="n"><b>${x.g}</b></td></tr>`; }).join("")}</table></div>`;
}
const LEAD = [["g", "Golden Boot", "Goals"], ["a", "Assists", "Assists"], ["kp", "Chances created", "KP"], ["tk", "Tackles", "Tackles"], ["ic", "Interceptions", "Int."], ["sv", "Keeper saves", "Saves"], ["mo", "Player of the Match", "Awards"], ["rt", "Average rating", "Rating"]];
export function leadersPanel(S, limit = 10) {
  const L = S.leaders || {}, key = st.ui.lead || "g", cur = LEAD.find((x) => x[0] === key) || LEAD[0], rows = (L[cur[0]] || []).slice(0, limit), me = S.me ? S.me.teamId : -1;
  const tabs = LEAD.map(([k, name]) => `<button class="btn sm ${k === cur[0] ? "on" : ""}" data-act="lead" data-k="${k}">${name}</button>`).join("");
  const body = rows.length ? `<table class="tb"><tr><th>#</th><th>Player</th>${cur[0] === "g" ? '<th class="n" title="Expected goals from their shots">xG</th>' : ""}<th class="n">${cur[2]}</th></tr>${rows.map((x, k) => { const p = pl(x.id), t = team(x.team);
    return `<tr class="${x.team === me ? "me" : ""} ${k === 0 ? "leader" : ""}"><td>${k + 1}</td><td><div class="bootn">${t ? crest(t, 14) : ""}<b>${p ? esc(p.name) : "?"}</b><span class="mute small">${p ? p.pos : ""}</span></div></td>${cur[0] === "g" ? `<td class="n mute">${x.xg}</td>` : ""}<td class="n"><b>${cur[0] === "rt" ? x.rt.toFixed(2) : x[cur[0]]}</b></td></tr>`; }).join("")}</table>` : `<p class="mute small">Nothing yet.</p>`;
  return `<div class="card"><h3>${cur[1]}</h3><div class="row wrap" style="gap:6px;margin-bottom:8px">${tabs}</div>${body}</div>`;
}
function scorerLines(m, side) {
  const by = new Map();
  for (const g of m.goals || []) if (g.team === side) (by.get(g.player) || by.set(g.player, []).get(g.player)).push(g.minute);
  return [...by.entries()].map(([pid, mins]) => `<div class="sc1"><b>${esc(nm(pid))}</b> <span class="mute">${mins.map((x) => x + "'").join(" ")}</span></div>`).join("") || `<div class="sc1 mute">–</div>`;
}
function resRows(ms, me, focus = null) {
  return ms.map((m, i) => `<div class="resrow ${m.a === me || m.b === me ? "mine" : ""} ${i === focus ? "focus" : ""}" ${focus != null ? `data-act="mfocus" data-k="${i}"` : ""}>
    <div class="side l">${tchipK(m.a, 0, 20, m.b)}<div class="scs">${scorerLines(m, 0)}</div></div>
    <div class="fscore">${m.score[0]} – ${m.score[1]}</div>
    <div class="side r">${tchipK(m.b, 1, 20, m.a)}<div class="scs">${scorerLines(m, 1)}</div></div></div>`).join("");
}
function resultsView(S) {
  const R = S.reveal, me = S.me ? S.me.teamId : -1, k = focusK(S), m = R.matches[k];
  return `<div class="card"><div class="row"><h3 style="margin:0">Matchday ${R.day + 1} results</h3><div class="grow"></div><span class="clock" data-pb="clock" data-k="${k}">FT</span></div><div class="mt">${resRows(R.matches, me, k)}</div></div>
    <div class="card"><h3>${tchipK(m.a, 0, 20, m.b)} <span class="mute">v</span> ${tchipK(m.b, 1, 20, m.a)} · full time</h3><div data-pb="mstats" data-k="${k}"></div></div>
    <div class="card"><h3>Ratings</h3><div data-pb="lineups" data-k="${k}"></div></div>`;
}

// ---------- the menu between matches ----------
const coinsTxt = (n) => `${Math.round(n).toLocaleString()} 🪙`;
function hubBar(S, title, back = "hubback", backText = "← Menu") {
  const me = S.me, ready = me && S.teams[me.teamId].ready;
  return `<div class="card hubbar"><button class="btn sm" data-act="${back}">${backText}</button><h3 style="margin:0">${esc(title)}</h3><div class="grow"></div>${me ? `<button class="btn ${ready ? "" : "pri"}" data-act="mready">${ready ? "Ready ✓ (undo)" : "Ready"}</button>` : ""}</div>`;
}
// Last five results of a club, newest on the right.
function formDots(S, ti) {
  const res = S.sched ? S.sched.results.filter(([, a, b]) => a === ti || b === ti).sort((x, y) => x[0] - y[0]).slice(-5) : [];
  const dots = res.map(([d, a, b, ga, gb]) => { const mine = a === ti ? ga : gb, th = a === ti ? gb : ga, o = mine > th ? "W" : mine < th ? "L" : "D"; return `<i class="${o}" title="Matchday ${d + 1}: ${ga}–${gb}">${o}</i>`; });
  while (dots.length < 5) dots.unshift(`<i class="n">–</i>`);
  return `<span class="form">${dots.join("")}</span>`;
}
const ordinal = (n) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");
// The one thing worth your attention right now.
function biggestDecision(S, me, t) {
  if (me) {
    const l = me.lineup, tired = l ? [l.gk, ...l.out].filter((id) => id != null && pl(id) && pl(id).stam < 50).length : 0;
    if (winOpen(S) && incomingOffers(S)) return { ic: "🔁", text: `${incomingOffers(S)} trade offer${incomingOffers(S) === 1 ? " is" : "s are"} waiting for you.`, to: "transfers" };
    if (winOpen(S) && S.window.left <= 1) return { ic: "⏳", text: "Last chance: the transfer window shuts at the next kick-off.", to: "transfers" };
    if (tired >= 3) return { ic: "🔋", text: `${tired} of your starters are tired. Rotate the squad or accept the drop in form.`, to: "team" };
    if (me.fin && me.fin.expiring.length) return { ic: "📝", text: `${me.fin.expiring.length} contract${me.fin.expiring.length === 1 ? "" : "s"} run out this season (about ${Math.round(me.fin.cheapest)} coins to keep ${me.fin.expiring.length === 1 ? "him" : "them"}).`, to: "finance" };
    if (S.store && S.store.open && Object.values(S.store.stock || {}).some((n) => n > 0) && me.coins >= 60) return { ic: "🛒", text: "A rare item is in the store and you can afford a look.", to: "store" };
    if (winOpen(S)) return { ic: "🔁", text: `The transfer window is open: ${winCountdown(S)}.`, to: "transfers" };
    return { ic: "✅", text: t && t.ready ? "You are locked in. Waiting for the rest of the room." : "Nothing urgent. Check your line-up and press Ready.", to: t && t.ready ? null : "team", ok: true };
  }
  return { ic: "👀", text: "Waiting for the managers.", to: null, ok: true };
}
function hubHome(S) {
  const me = S.me, d = S.season.day, myTi = me ? me.teamId : S.pm && S.pm.team != null ? S.pm.team : null;
  const fx = myTi != null ? (S.season.fixtures || []).find(([a, b]) => a === myTi || b === myTi) : null;
  const t = me ? S.teams[me.teamId] : null, ready = t && t.ready;
  const rank = myTi != null ? (S.table || []).findIndex((r) => r.i === myTi) : -1, row = rank >= 0 ? S.table[rank] : null;
  const have = me ? me.coins : S.pm ? S.pm.coins : 0, rare = S.store && S.store.open && Object.values(S.store.stock || {}).some((n) => n > 0);
  const tile = (to, ic, name, sub, cls = "") => `<button class="hubtile ${cls}" data-act="hubgo" data-to="${to}"><span class="ic">${ic}</span><b>${name}</b><span class="sub">${sub}</span></button>`;
  const side = (ti, opp, k) => { const tm = team(ti), r = (S.table || []).findIndex((x) => x.i === ti), tr = r >= 0 ? S.table[r] : null;
    return `<div class="hh-side ${ti === myTi ? "mine" : ""}">${crest(tm, 64)}<div class="kits">${shirt(club(tm), kitOf(ti, opp, k), 46)}</div><div class="tn">${esc(tm.name)}</div><div class="sub">${tr ? `${ordinal(r + 1)} · ${tr.pts} pts` : "–"}</div>${formDots(S, ti)}</div>`; };
  const hero = fx ? `<div class="hh-vs">${side(fx[0], fx[1], 0)}<div class="hh-mid">V<small>${myTi === fx[0] ? "HOME" : myTi === fx[1] ? "AWAY" : "NEXT"}</small></div>${side(fx[1], fx[0], 1)}</div>${kitNote(fx)}` : "";
  const dec = biggestDecision(S, me, t), info = [];
  const winTxt = winOpen(S) ? `Window open · ${S.window.left} matchday${S.window.left === 1 ? "" : "s"} left` : "";
  const tiles = [
    winOpen(S) ? tile("transfers", "🔁", "Transfers", `${winCountdown(S)}${incomingOffers(S) ? ` · <span class="rarepip">${incomingOffers(S)} offer${incomingOffers(S) === 1 ? "" : "s"} for you</span>` : ""}`, "windowtile") : "",
    me ? tile("team", "📋", "Team", `${esc(me.lineup ? me.lineup.formation : "")} · tactics &amp; items`) : "",
    tile("standings", "🏆", "Standings", row ? `${ordinal(rank + 1)} · ${row.pts} pts` : "Table &amp; results"),
    me && me.fin ? tile("finance", "💰", "Finance", me.fin.expiring.length ? `${me.fin.expiring.length} expiring` : "All set") : "",
    tile("stats", "📊", "Stats", "Goals, ratings, awards"),
    tile("store", "🛒", "Store", `${Math.round(have)} coins${rare ? " · <span class=\"rarepip\">rare item</span>" : ""}`),
    tile("news", "📰", "News", ((S.news && S.news.list) || []).length ? `${S.news.list.length} stor${S.news.list.length === 1 ? "y" : "ies"}` : "The Daily Whistle"),
    me ? `<button class="hubtile ready ${ready ? "on" : ""}" data-act="mready"><span class="ic">${ready ? "✔" : "▶"}</span><b>${me.auto ? "Auto on" : "Ready"}</b><span class="sub">${ready ? "Locked in. Tap to undo." : "Lock in for the next match"}</span></button>` : "",
  ].join("");
  return `<div class="card hub-hero"><div class="hh-top"><span>Matchday ${d + 1} of ${S.season.total}</span>${winTxt ? `<span class="win">${winTxt}</span>` : ""}</div>${hero}
    <div class="hh-foot">${myTi != null ? `<span class="hh-rank">${row ? ordinal(rank + 1) : "–"}<small>${row ? `${row.pts} pts · ${row.w}-${row.d}-${row.l}` : ""}</small></span>` : ""}<span class="grow"></span><span class="coin">${Math.round(have)}<i></i></span></div>
    ${dec.to ? `<button class="decision ${dec.ok ? "ok" : ""}" data-act="${dec.to === "mready" ? "mready" : "hubgo"}" data-to="${dec.to}"><span class="di">${dec.ic}</span><span><b>${dec.ok ? "All good" : "Needs you"}</b><span class="dt">${dec.text}</span></span></button>` : `<div class="decision ${dec.ok ? "ok" : ""}"><span class="di">${dec.ic}</span><span><b>${dec.ok ? "All good" : "Needs you"}</b><span class="dt">${dec.text}</span></span></div>`}</div>
    <div class="hubgrid compact">${tiles}</div>${fixturesPreview(S)}`;
}
// Phone: the menu lives in a bar at the bottom of the screen, on every menu page.
function hubDock(S) {
  const me = S.me, ready = me && S.teams[me.teamId].ready, hub = st.ui.hub || "home";
  const b = (to, ic, name, extra = "") => `<button class="${hub === to ? "on" : ""}" data-act="${to === "home" ? "hubback" : "hubgo"}" data-to="${to}"><span class="ic">${ic}</span>${name}${extra}</button>`;
  return `<nav class="hubdock">${b("home", "🏠", "Home")}${me ? b("team", "📋", "Team") : ""}${b("standings", "🏆", "Table")}${winOpen(S) ? b("transfers", "🔁", "Window", incomingOffers(S) ? `<i class="dotb"></i>` : "") : me && me.fin ? b("finance", "💰", "Money") : b("stats", "📊", "Stats")}${b("news", "📰", "News")}${me ? `<button class="rd ${ready ? "done" : ""}" data-act="mready"><span class="ic">${ready ? "✔" : "▶"}</span>${ready ? "Ready" : "Go"}</button>` : ""}</nav>`;
}
function teamViewer(S, i) {
  const t = team(i), c = club(t), row = (S.table || []).findIndex((r) => r.i === i), tr = row >= 0 ? S.table[row] : null;
  const ps = t.players.map((id) => pl(id)).filter(Boolean);
  const fit = ps.filter((p) => !p.susp), gk = fit.filter((p) => p.pos === "GK").sort((a, b) => b.ovr - a.ovr)[0];
  const out = fit.filter((p) => p !== gk).sort((a, b) => b.ovr - a.ovr).slice(0, 5), start = new Set([gk, ...out].filter(Boolean).map((p) => p.id));
  const lines = (list) => list.map((p) => `<div class="benchrow tv ${p.susp ? "dim" : ""}"><span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span class="grow"><b>${esc(p.name)}</b> <span class="mute small">${p.pos}${p.user ? " · created player" : ""}</span></span>
    ${p.x ? `<span class="tiny mute" title="This season: games, goals, assists, Player of the Match awards, average rating">${p.x[0]} gp · ${p.x[1]}G ${p.x[2]}A${p.x[11] ? ` · ⭐${p.x[11]}` : ""} · <b>${p.x[7].toFixed(1)}</b></span>` : ""}<span class="tiny mute" title="Stamina">${Math.round(p.stam)}%</span>${p.susp ? `<span class="pill bad tiny">SUSP ${p.susp}</span>` : ""}<button class="pinfo" data-act="pcard" data-id="${p.id}" title="Full player card" aria-label="Open full card">i</button><span class="pill tiny ${p.contract <= 1 ? "warn" : ""}" title="Contract">${p.contract} season${p.contract === 1 ? "" : "s"} left</span></div>`).join("");
  const byOvr = (a, b) => b.ovr - a.ovr, starters = ps.filter((p) => start.has(p.id)).sort((a, b) => (a.pos === "GK" ? -1 : b.pos === "GK" ? 1 : byOvr(a, b))), bench = ps.filter((p) => !start.has(p.id)).sort(byOvr);
  return `${hubBar(S, t.name, "closeteam", "← Standings")}<div class="card"><div class="row wrap" style="gap:14px">${crest(t, 48)}${shirt(c, 0, 56)}<div class="grow"><b style="font-size:20px">${esc(t.name)}</b><div class="mute small">${t.owner ? "Managed by " + esc(t.owner) : "CPU manager"}${tr ? ` · ${row + 1}${["st", "nd", "rd"][row] || "th"} · ${tr.pts} pts (${tr.w}-${tr.d}-${tr.l})` : ""} · ${ps.length}/${t.cap} players</div></div></div>
    <h3 class="mt">Likely line-up</h3><div class="col" style="gap:3px">${lines(starters)}</div>
    ${bench.length ? `<h3 class="mt">Bench</h3><div class="col" style="gap:3px">${lines(bench)}</div>` : ""}
    <p class="tiny mute mt">Line-ups are set at kick-off. This shows the strongest available players. Contract = seasons left, counting this one.</p></div>${scheduleCard(S, i)}`;
}
// The whole season for one team: every fixture, with the score once it has been played.
function scheduleCard(S, i) {
  const sc = S.sched; if (!sc || !sc.days.length) return "";
  const res = new Map(); for (const [d, a, b, ga, gb] of sc.results) res.set(d + ":" + a + ":" + b, [ga, gb]);
  let w = 0, dr = 0, l = 0;
  const rows = sc.days.map((day, d) => {
    const fx = day.find(([a, b]) => a === i || b === i); if (!fx) return "";
    const home = fx[0] === i, opp = home ? fx[1] : fx[0], r = res.get(d + ":" + fx[0] + ":" + fx[1]), mine = r ? (home ? r[0] : r[1]) : null, theirs = r ? (home ? r[1] : r[0]) : null;
    const o = r ? (mine > theirs ? "W" : mine < theirs ? "L" : "D") : ""; if (o === "W") w++; else if (o === "D") dr++; else if (o === "L") l++;
    return `<div class="schedrow ${o ? "r" + o : ""} ${d === S.season.day && !r ? "next" : ""}" data-act="viewteam" data-i="${opp}" title="See ${esc(team(opp).name)}"><span class="md">MD ${d + 1}</span><span class="ha">${home ? "H" : "A"}</span><span class="grow">${chip(team(opp), 18)}</span>
      ${r ? `<b class="sc">${mine}–${theirs}</b><span class="pill tiny ${o === "W" ? "good" : o === "L" ? "bad" : ""}">${o}</span>` : `<span class="mute small">${d === S.season.day ? "next" : "to play"}</span>`}</div>`;
  }).join("");
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Season schedule and results</h3><div class="grow"></div><span class="small mute">${w}W ${dr}D ${l}L so far</span></div><div class="schedlist mt">${rows}</div></div>`;
}
function standingsView(S) {
  if (st.ui.viewTeam != null && team(st.ui.viewTeam)) return teamViewer(S, st.ui.viewTeam);
  const me = S.me ? S.me.teamId : -1, L = S.lastDay;
  const last = L ? `<div class="card"><h3>Matchday ${L.day + 1} results</h3><div class="mt">${resRows(L.matches, me)}</div></div>` : `<div class="card"><h3>Latest results</h3><p class="mute small">No matches played yet.</p></div>`;
  return `${hubBar(S, "Standings")}${tablePanel(S, 99, true)}${last}${leadersPanel(S, 10)}`;
}
function financeView(S) {
  const f = S.me.fin, ex = f.expiring, short = f.left0 < 0, tab = st.ui.finTab || 1;
  const grp = f.ahead[tab - 1] || { list: [], maxLen: 3 };
  const cols = Math.max(1, Math.min(3, grp.maxLen)), when = ["this season", "next season", "in two seasons"][tab - 1];
  const rows = grp.list.map((e) => { const p = pl(e.id); if (!p) return "";
    return `<tr><td><b>${esc(p.name)}</b> <span class="pg pg-${posGroup(p.pos)}">${p.pos}</span> <button class="pinfo inl" data-act="pcard" data-id="${p.id}" aria-label="Open full card">i</button></td><td class="n">${p.ovr}${e.ovrNext !== p.ovr ? ` <span class="mute">→ ${e.ovrNext}</span>` : ""}</td><td class="n">${p.age}</td>${[0, 1, 2].map((k) => `<td class="n">${k < cols ? "~" + e.fees[k] : "–"}</td>`).join("")}<td class="n">${e.retire ? `<span class="${e.retire >= 0.4 ? "neg" : "mute"}">${Math.round(e.retire * 100)}%</span>` : "–"}</td></tr>`; }).join("");
  const total = grp.list.reduce((x, e) => x + e.fees[0] * (1 - e.retire), 0);
  const tabs = [1, 2, 3].map((k) => `<button class="btn sm ${tab === k ? "pri" : ""}" data-act="finTab" data-k="${k}">${["Ending this season", "Ending next season", "Ending in two seasons"][k - 1]} <span class="mute">(${f.ahead[k - 1].list.length})</span></button>`).join("");
  return `<div class="card"><div class="row wrap" style="gap:18px"><div><div class="mute small">Coins now</div><b style="font-size:24px">${coinsTxt(f.coins)}</b></div>
      <div><div class="mute small">Still to come this season</div><b style="font-size:24px">~${coinsTxt(f.income)}</b><div class="tiny mute">${f.left} match${f.left === 1 ? "" : "es"} × ~${f.perMatch.total} (${f.perMatch.base} base + ${f.perMatch.catchup} catch-up + ~${f.perMatch.bonus} for wins and draws)</div></div>
      <div><div class="mute small">Cost to keep the expiring</div><b style="font-size:24px">~${coinsTxt(f.cheapest)}</b><div class="tiny mute">1-season deals, retirements allowed for</div></div>
      <div><div class="mute small">Left over after that</div><b style="font-size:24px" class="${short ? "neg" : ""}">~${coinsTxt(f.left0)}</b></div></div></div>
    <div class="card"><h3>Re-sign costs ahead</h3><div class="row wrap mt" style="gap:6px">${tabs}</div>
      ${grp.maxLen < 1 ? `<p class="mute small mt">The game ends before then, so nothing needs re-signing.</p>` : grp.list.length ? `<table class="tb mt"><tr><th>Player</th><th class="n">OVR</th><th class="n">Age</th><th class="n">1 yr</th><th class="n">2 yrs</th><th class="n">3 yrs</th><th class="n" title="Chance he retires that off-season">Retire</th></tr>${rows}</table>
      <p class="tiny mute mt">${tab === 1 ? "" : `These deals run out ${when}. `}Estimated re-sign fees with your loyalty discount, for a player ${tab} year${tab > 1 ? "s" : ""} older at the rating his age suggests (about ${coinsTxt(total)} for one-season deals if you keep everyone who does not retire). Real fees move with off-season ageing.${grp.maxLen < 3 ? ` <b>Only ${grp.maxLen} season${grp.maxLen === 1 ? "" : "s"} will be left then, so longer deals are not available.</b>` : ""} You have ${f.roster}/${f.cap} players${tab === 1 ? `, ${f.staying} already signed for next season` : ""}.</p>` : `<p class="mute small mt">Nobody's contract runs out ${when}.</p>`}</div>`;
}
function hubView(S) {
  if (st.ui.hubDay !== S.season.day || st.ui.hubSeason !== S.seasonNo) { st.ui.hubDay = S.season.day; st.ui.hubSeason = S.seasonNo; st.ui.hub = null; st.ui.viewTeam = null; st.ui.mSel = null; st.ui.itemSel = null; }
  const hub = st.ui.hub;
  let body;
  if (!hub || (hub === "team" && !S.me)) body = hubHome(S);
  else if (hub === "team") body = hubBar(S, "Team: tactics and items") + lineupEditor(S, false);
  else if (hub === "finance" && S.me && S.me.fin) body = hubBar(S, "Finance") + financeView(S);
  else if (hub === "transfers") body = hubBar(S, "Transfers") + transfersView(S);
  else if (hub === "stats") body = hubBar(S, "Player stats") + playerStats(S);
  else if (hub === "news") body = hubBar(S, "The Daily Whistle") + frontPage(S, { cols: 9 });
  else if (hub === "store") body = hubBar(S, "Store") + (storeCard(S) || `<div class="card"><p class="mute">The store is closed right now.</p></div>`);
  else body = standingsView(S);
  return body + hubDock(S);
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
      main = `<div class="card champ"><h3>Champions</h3><div class="t">${esc(longName(champ).title)}</div>${longName(champ).club ? `<div class="small mute">${esc(longName(champ).club)}</div>` : ""}<div class="mt">${crest(champ, 64)}</div><p class="mute mt">${champ.owner ? "Managed by " + esc(champ.owner) : "CPU manager"} · ${R.table[0].pts} points</p>${S.host && !R.final ? `<button class="btn pri big mt2" data-act="cont">Continue to the off-season</button>` : ""}</div>${awardsCard(S)}${bootPanel(S, 10, "Golden Boot, final table")}${playerStats(S)}${R.final ? finalCard(S) : ""}`;
      break;
    }
    default: main = `<div class="card">…</div>`;
  }
  return { main, side };
}
function finalCard(S) {
  const h = S.history || [], wins = new Map();
  for (const x of h) wins.set(x.champion, (wins.get(x.champion) || 0) + 1);
  return `<div class="card"><h3>Hall of champions</h3><table class="tb"><tr><th>Season</th><th>Champion</th><th class="n">Points</th><th>Golden Boot</th><th>Ballon d'Or</th></tr>${h.map((x) => `<tr><td>${x.season}</td><td>${chip(team(x.champion), 18, true)}</td><td class="n">${x.pts}</td><td>${x.boot ? esc(x.boot.name) + " <span class=\"mute\">(" + x.boot.g + ")</span>" : "–"}</td><td>${x.awards && x.awards.ballon && x.awards.ballon[0] ? esc(x.awards.ballon[0].name) : "–"}</td></tr>`).join("")}</table><p class="mute small mt">That was the last season of this game.</p></div>`;
}
function fixturesPreview(S) {
  const fx = S.season.fixtures || [], me = S.me ? S.me.teamId : -1;
  return `<div class="card"><h3>Matchday ${S.season.day + 1} fixtures</h3>${fx.map(([a, b]) => `<div class="fixture ${a === me || b === me ? "mine" : ""}"><div class="l">${tchipK(a, 0, 18, b)}</div><div class="score mute">v</div><div>${tchipK(b, 1, 18, a)}</div></div>`).join("")}</div>`;
}
