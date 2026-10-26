// App shell: connection, landing, lobby, top bar, and routing to the draft / market / match views.
import { st, $, $$, esc, send, store, now, toast, buildIndex, applyTheme, chip, crest, crestOfClub, kitImg, team, myTeam, remaining, fmtClock, coins } from "./core.js";
import { draftView, draftHandlers } from "./draft.js";
import { marketView, marketHandlers } from "./market.js";
import { offView, offHandlers } from "./off.js";
import { storeCard } from "./store.js";
import { histHandlers } from "./history.js";
import { helpHandlers, helpButton, maybeFirstGuide, drawHelp } from "./help.js";
import { liteHandlers, liteChooser, isLite } from "./lite.js";
import { pmHandlers, pmPanel, seekersCard, modeCard, creator, gambleOverlay } from "./pm.js";
import { unlockHandlers, unlockSync, trophySync, enterCode, codeClubs, clubOpen } from "./unlocks.js";
import { lifeHandlers, lifePanel, newsAsk, newsCard, newsTick } from "./life.js";
import { matchView, matchHandlers, tablePanel, playbackTick } from "./match.js";
import { pcardHandlers, pcardSync } from "./pcard.js";
import { winHandlers, tradePopup } from "./transfers.js";
import { phaseBanner } from "./skin.js";

const app = $("#app");
app.innerHTML = `<div id="top"></div><div id="body"></div><div id="hostbar"></div>`;
const el = { top: $("#top"), body: $("#body"), host: $("#hostbar") };

const params = new URLSearchParams(location.search);
st.watch = location.pathname === "/screen";
st.token = store("token") || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
store("token", st.token);
st.room = (params.get("room") || "").toUpperCase() || null;

// ---------- connection ----------
let retry = 0, intent = null;
function connect(first) {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  st.ws = ws;
  ws.onopen = () => { retry = 0; if (first) intent = first; if (intent) ws.send(JSON.stringify({ token: st.token, ...intent })); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "hello") {
      st.cat = m.catalog; st.off = m.now - Date.now(); buildIndex();
      st.room = m.room; store("room", m.room);
      if (!st.watch) intent = { t: "join", room: m.room, name: store("name") || "Manager" };
      history.replaceState(null, "", (st.watch ? "/screen" : "/") + "?room=" + m.room);
    } else if (m.t === "state") {
      st.S = m.s; st.off = m.s.now - Date.now();
      { const g = m.s.me && m.s.me.gain ? m.s.me.gain : m.s.pm && m.s.pm.gain ? m.s.pm.gain : null;   // money paid after a match: show it once
        if (st.ui.gainSeen === undefined) st.ui.gainSeen = g ? g.seq : 0; else if (g && g.seq > st.ui.gainSeen) { st.ui.gainSeen = g.seq; showGain(g); } }
      { const ns = m.s.notices || [], top = ns.length ? ns[ns.length - 1].id : 0; if (st.ui.noticeSeen === undefined) st.ui.noticeSeen = top; else for (const n of ns) if (n.id > st.ui.noticeSeen) { toast(n.text); st.ui.noticeSeen = n.id; } }
      newsTick(m.s); unlockSync(m.s); trophySync(m.s);
      const nt = m.s.speed && m.s.speed.note;
      if (nt && nt.id !== st.ui.paceNoteId) { if (st.ui.paceNoteId !== undefined) toast(nt.text); st.ui.paceNoteId = nt.id; } else if (st.ui.paceNoteId === undefined) st.ui.paceNoteId = 0;
      render();
    } else if (m.t === "error") { toast(m.msg); if (!st.S) { store("room", null); landing(); } }
  };
  ws.onclose = () => { if (!intent) return; retry++; setTimeout(() => connect(), Math.min(4000, 400 * retry)); };
}
const nameVal = () => ($("#nm")?.value || "").trim() || store("name") || "Manager";
function landing() {
  st.S = null; el.top.innerHTML = ""; el.host.innerHTML = "";
  const saved = store("room");
  el.body.innerHTML = `<div class="landing"><span class="logo"><b></b> Football Draft</span>
    <div class="hero">Draft the squad.<br>Win the <em>league</em>.</div>
    <div><button class="btn" data-act="helpOpen">How to play</button></div>
    <p class="lead">Open packs, pick your six, bid for the rest, then watch your team play a season. A game for a room full of laptops.</p>
    <div class="stack">
      <div class="card"><h3>Your name</h3><input id="nm" style="width:100%" maxlength="24" placeholder="Name" value="${esc(store("name") || "")}"></div>
      <div class="grid2">
        <div class="card col"><h3>Host a game</h3><p class="small mute">Start a room and share the code.</p><button class="btn pri big" data-act="create">Create game</button></div>
        <div class="card col"><h3>Join a game</h3><input class="big" id="jc" maxlength="4" placeholder="CODE" value="${esc(st.room || "")}"><button class="btn pri" data-act="join">Join</button></div>
      </div>
      <div class="card row wrap"><div class="grow"><h3>Big-screen view</h3><div class="small mute">For the projector. Shows the matches and tables, no controls.</div></div><input id="wc" maxlength="4" placeholder="CODE" style="width:90px;text-transform:uppercase;text-align:center"><button class="btn" data-act="watch">Watch</button></div>
      ${saved && !st.watch ? `<div class="card row"><div class="grow">Rejoin room <span class="code">${esc(saved)}</span></div><button class="btn pri" data-act="rejoin">Rejoin</button></div>` : ""}
    </div></div>`;
}

// ---------- actions ----------
const go = () => { if (!st.ws || st.ws.readyState > 1) connect(); else st.ws.send(JSON.stringify({ token: st.token, ...intent })); };
const A = {
  create() { store("name", nameVal()); intent = { t: "create", name: nameVal() }; go(); },
  join() { const c = ($("#jc")?.value || "").toUpperCase(); if (c.length < 4) return toast("Enter the 4-letter code."); store("name", nameVal()); intent = { t: "join", room: c, name: nameVal() }; go(); },
  rejoin() { intent = { t: "join", room: store("room"), name: store("name") || "Manager" }; go(); },
  watch() { const c = ($("#wc")?.value || "").toUpperCase() || st.room; if (!c || c.length < 4) return toast("Enter the 4-letter code."); intent = { t: "watch", room: c }; go(); },
  club(a) {
    const you = st.S && st.S.players.find((p) => p.you), cur = you && you.club && st.clubBy[you.club];
    if (cur && (cur.base || cur.slug) === a.slug) return;                  // already on this club (maybe its throwback): leave it
    send({ t: "club", slug: a.slug });
  },
  clubCont(a) { st.ui.clubCont = a.c; render(); },
  clubVar(a, el) { send({ t: "club", slug: el.checked ? a.slug : a.main }); },
  start() { send({ t: "start" }); },
  pause() { send({ t: "pause" }); }, resume() { send({ t: "resume" }); }, skip() { send({ t: "skip" }); },
  copy() { navigator.clipboard?.writeText(`${location.origin}/?room=${st.S.room}`); toast("Link copied"); },
  chatSend() { const i = $("#chatin"); if (i && i.value.trim()) { send({ t: "chat", text: i.value }); i.value = ""; } },
  speed(a) { send({ t: "speedVote", dir: a.dir }); },
  auto() { send({ t: "auto", on: !st.S.me.auto }); },
};
Object.assign(A, draftHandlers, marketHandlers, matchHandlers, offHandlers, pmHandlers, lifeHandlers, unlockHandlers, pcardHandlers, winHandlers, liteHandlers, histHandlers, helpHandlers);

// An idle manager is back online with the first thing they touch.
let lastWake = 0;
for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, () => {
  const me = st.S && st.S.me; if (!me || !me.idle || Date.now() - lastWake < 1500) return;
  lastWake = Date.now(); send({ t: "active" });
}, { passive: true, capture: true });

app.addEventListener("click", (e) => {
  if (e.target.closest(".vopt")) return;                                 // ticking a throwback/alt box is a change, not a club click
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const f = A[b.dataset.act]; if (f) { e.preventDefault(); f({ ...b.dataset }, b); }
});
app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "teamname") send({ t: "teamName", name: t.value });
  if (t.dataset.set) { const s = {}; s[t.dataset.set] = isNaN(+t.value) ? t.value : +t.value; send({ t: "settings", s }); }
  if (t.dataset.change && A[t.dataset.change]) A[t.dataset.change]({ ...t.dataset, value: t.value }, t);
});
app.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.input && A[t.dataset.input]) A[t.dataset.input]({ ...t.dataset, value: t.value }, t);
});
app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "chatin") A.chatSend(); if (e.key === "Enter" && e.target.id === "jc") A.join(); if (e.key === "Enter" && e.target.id === "codein") A.redeem(); });

// ---------- top bar ----------
function phaseLabel(S) {
  switch (S.step) {
    case "lobby": return "Lobby";
    case "draft.intro": return "Pack draft · get ready";
    case "draft.pick": return `Pack draft · pack ${S.draft.round}/${S.draft.total}`;
    case "draft.reveal": return `Pack draft · pack ${S.draft.round}/${S.draft.total} results`;
    case "market.bid": return `${S.phase === "offseason" ? "Free agency" : "Market"} · round ${S.market.round + 1}`;
    case "market.reveal": return `${S.phase === "offseason" ? "Free agency" : "Market"} · round ${S.market.round + 1} results`;
    case "market.done": return "Squads set";
    case "season.intro": return `Season ${S.seasonNo}`;
    case "season.end": return S.final ? "Final table" : `Season ${S.seasonNo} complete`;
    case "off.retire": return "Off-season · retirements";
    case "off.age": return "Off-season · development";
    case "off.resign": return "Off-season · re-signing";
    case "off.resign.reveal": return "Off-season · re-signing results";
    case "off.rookie.turn": return "Off-season · rookie draft";
    case "off.rookie.reveal": return "Off-season · rookie results";
    case "off.trade": return "Off-season · trade window";
    default: return S.step.startsWith("md.") ? `Season ${S.seasonNo} · matchday ${S.season.day + 1}/${S.season.total}` : S.step;
  }
}
function stepper(S) {
  if (S.step === "lobby") return "";
  if (S.phase === "offseason") { const order = ["off.retire", "off.age", "off.resign", "off.resign.reveal", "off.rookie.turn", "off.rookie.reveal", "off.trade", "market.bid", "market.reveal", "market.done"], at = order.indexOf(S.step); const seg = [["Retire", 0, 1], ["Re-sign", 2, 3], ["Rookies", 4, 5], ["Trades", 6, 6], ["Free agency", 7, 9]]; return `<nav class="stepper">${seg.map(([l, a, b], i) => `${i ? "<s>›</s>" : ""}<span class="sg ${at > b ? "done" : at >= a ? "on" : ""}"><i>${at > b ? "✓" : i + 1}</i><b>${l}</b></span>`).join("")}</nav>`; }
  const ph = S.phase, g = (n, label, state) => `<span class="sg ${state}"><i>${state === "done" ? "✓" : n}</i><b>${label}</b></span>`;
  const idx = { draft: 0, market: 1, season: 2 }[ph];
  return `<nav class="stepper">${g(1, "Packs", idx > 0 ? "done" : "on")}<s>›</s>${g(2, "Market", idx > 1 ? "done" : idx === 1 ? "on" : "")}<s>›</s>${g(3, "Season", idx === 2 ? "on" : "")}</nav>`;
}
const names = (S, ids) => { const n = ids.map((id) => { const t = S.teams[id]; return (t && (t.owner || t.name)) || "?"; }); return n.length > 3 ? n.slice(0, 3).join(", ") + ` +${n.length - 3}` : n.join(", "); };
function nowLine(S) {
  const me = S.me, step = S.step; if (step === "lobby") return null;
  if (S.pm && step !== "lobby") {
    if (S.pm.pending.length) return { kind: "you", text: "A career card is waiting for you. Make your choice." };
    if (S.pm.offers.some((o) => o.status === "open")) return { kind: "you", text: "A team has made you an offer. Accept or decline." };
    if (step === "md.half" && S.pm.onPitch && !S.pm.effort) return { kind: "you", text: "Half-time: push or conserve?" };
  }
  if (me && me.idle) return { kind: "wait", text: "You are idle, so the room is moving on without you. Tap anything to jump back in." };
  switch (step) {
    case "draft.intro": return { kind: "info", text: "Get ready: the first pack opens in a moment." };
    case "draft.pick": {
      const d = S.draft, left = d.humans.filter((id) => !d.locked.includes(id));
      if (!me) return { kind: "info", text: `Pack ${d.round}: ${d.locked.length}/${d.humans.length} locked in.` };
      if (me.pick && me.pick.locked) return { kind: "wait", text: left.length ? `Locked in. Waiting for ${names(S, left)}.` : "Locked in. Everyone is ready." };
      return { kind: "you", text: me.pick ? "Happy with it? Press Lock in." : "Open your pack, choose one card, then lock in." };
    }
    case "draft.reveal": return { kind: "info", text: `Pack ${S.draft.round} results.` };
    case "market.bid": {
      if (!me) return { kind: "info", text: "Managers are bidding for free agents." };
      if (me.done) return { kind: "wait", text: "You are done shopping. Waiting for the others." };
      if (me.bid && me.bid.locked) return { kind: "wait", text: "Bid locked in. Waiting for the others." };
      return { kind: "you", text: "Pick a free agent, set a contract and any extra coins, then lock your bid. Or press I'm done." };
    }
    case "market.reveal": return { kind: "info", text: "Market results." };
    case "market.done": return { kind: "info", text: "Squads are set. The season starts soon." };
    case "season.intro": return { kind: "info", text: `Season ${S.seasonNo}: ${S.season.total} matchdays.` };
    case "md.lineup": return me ? (me.auto ? { kind: "wait", text: "Auto: the coaching staff pick your line-up." } : S.teams[me.teamId].ready ? { kind: "wait", text: "Ready. Waiting for the others." } : { kind: "you", text: "Set your line-up, formation and items, then press Ready." }) : { kind: "info", text: "Managers are setting line-ups." };
    case "md.half1": return { kind: "info", text: "First half." };
    case "md.half": return me ? (S.teams[me.teamId].ready || me.auto ? { kind: "wait", text: "Half-time changes in. Waiting for the others." } : { kind: "you", text: "Half-time: swap tired players, change formation, then press Ready." }) : { kind: "info", text: "Half-time." };
    case "md.half2": return { kind: "info", text: "Second half." };
    case "md.result": return { kind: "info", text: "Full time." };
    case "season.end": return { kind: "info", text: S.final ? "That was the final season." : S.host ? "Season over. Press Continue when everyone has had a look." : "Season over. The host moves the room on to the off-season." };
    case "off.retire": return { kind: "info", text: "Retirements: players in their late thirties may hang up their boots." };
    case "off.age": return { kind: "info", text: "Everyone gets a year older. Young players tend to improve, veterans to fade." };
    case "off.resign": {
      if (!me) return { kind: "info", text: "Managers are re-signing players." };
      if (!(me.resign || []).length) return { kind: "wait", text: "No contracts of yours expire. Waiting for the others." };
      return S.teams[me.teamId].ready ? { kind: "wait", text: "Done. Waiting for the others." } : { kind: "you", text: "Contracts have run out. Re-sign who you want to keep, then press Done." };
    }
    case "off.resign.reveal": return { kind: "info", text: "Re-signing results. Released players go to free agency." };
    case "off.rookie.turn": {
      const RK = S.rookies, cur = RK && team(RK.order[RK.idx]);
      if (me && me.myTurn) return { kind: "you", text: RK.stage === "pack" ? "Your pack is open: keep one rookie or abstain." : "Your turn: open a pack, take a leftover, or abstain." };
      return { kind: "info", text: cur ? `${cur.owner || cur.name} ${RK.stage === "pack" ? "has opened a pack" : "is on the clock"}. The weakest team picks first.` : "Rookie draft." };
    }
    case "off.rookie.reveal": return { kind: "info", text: "Rookie draft results." };
    case "off.trade": return me ? (S.teams[me.teamId].ready ? { kind: "wait", text: "You are done trading. Waiting for the others." } : { kind: "you", text: "Trade window: swap players, items and coins with other managers. Press Done when finished." }) : { kind: "info", text: "Managers are trading." };
  }
  return null;
}
const CLOCK_STEPS = ["draft.pick", "market.bid", "md.lineup", "md.half", "off.resign", "off.rookie.turn", "off.trade"];
// A short stack of chips under the money line: what was just paid and why.
function showGain(g) {
  const box = $("#gains"); if (!box) return;
  const lines = g.coins != null ? [["wallet", `+${g.coins} wallet`]] : [["inc", `+${g.base} income`]];
  if (g.catchup > 0) lines.push(["cu", `+${g.catchup} catch-up`]);
  if (g.result === "W") lines.push(["win", `+${g.bonus} win`]); else if (g.result === "D") lines.push(["draw", `+${g.bonus} draw`]);
  const wrap = document.createElement("div"); wrap.className = "gain " + (g.result === "W" ? "w" : g.result === "D" ? "d" : "");
  wrap.innerHTML = lines.map(([k, t], i) => `<span class="gl ${k}" style="animation-delay:${i * 0.35}s">${t}</span>`).join("") + (g.total ? `<b class="gt" style="animation-delay:${lines.length * 0.35}s">= +${g.total}</b>` : "");
  box.appendChild(wrap); setTimeout(() => wrap.remove(), 6500);
}
function renderTop() {
  const S = st.S, nl = nowLine(S);
  const clock = S.deadline && !S.paused && CLOCK_STEPS.includes(S.step) && S.me;
  const hud = nl ? `<div class="hud ${nl.kind}" id="hud"><span class="hmsg">${esc(nl.text)}</span>${clock ? `<span class="hclock" id="hclock"></span><i class="hbar" id="hbar"></i>` : ""}</div>` : "";
  const sp = S.speed, lv = ["Relaxed", "Normal", "Fast", "Turbo"][sp.levels.indexOf(sp.pace)];
  el.top.innerHTML = `<div class="top"><span class="logo"><b></b> Football Draft</span><span class="code" title="Room code">${esc(S.room)}</span>${stepper(S)}<span class="phase">${esc(phaseLabel(S))}</span>${S.paused ? `<span class="paused">PAUSED</span>` : ""}<span class="grow"></span>${helpButton()}
    ${S.step !== "lobby" && S.me ? `<span class="coin" title="Your coins">${Math.round(S.me.coins)}<i></i></span>` : ""}
    ${S.step !== "lobby" && !st.watch && S.me ? `<span class="row" style="gap:4px"><span class="tiny mute">${lv}</span><button class="btn sm" data-act="speed" data-dir="down" title="Vote slower">−</button><button class="btn sm" data-act="speed" data-dir="up" title="Vote faster">+</button></span>` : ""}</div>${hud}`;
  tick();
}
function tick() {
  const S = st.S, w = $("#wclock"); if (w && S) { const r0 = remaining(); w.textContent = r0 == null ? "–" : fmtClock(r0); }
  const c = $("#hclock"); if (!c || !S) return;
  const r = remaining(); if (r == null) { c.textContent = ""; return; }
  const tot = S.dur > 0 ? S.dur : r;
  c.textContent = fmtClock(r);
  $("#hud")?.classList.toggle("low", r < 6000 && r > 0);
  const bar = $("#hbar"); if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, r / Math.max(tot, 1)))})`;
}
// ---------- "press Ready" nudge: no click for 10 seconds while the line-up is open makes the Ready buttons flash (and, in Lite mode, a big prompt appears) ----------
let lastAct = Date.now(), lastStep = "";
for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { lastAct = Date.now(); nudge(); }, { capture: true, passive: true });
function nudge() {
  const S = st.S; if (S && S.step !== lastStep) { lastStep = S.step; lastAct = Date.now(); }
  const me = S && S.me, on = !!(me && !st.watch && (S.step === "md.lineup" || S.step === "md.half") && !me.auto && S.teams[me.teamId] && !S.teams[me.teamId].ready && !S.paused && Date.now() - lastAct >= 10000);
  document.body.classList.toggle("nudge", on); document.body.classList.toggle("nudge-strong", on && isLite(S));
  let cta = $("#readycta");
  if (on && isLite(S)) { if (!cta) { cta = document.createElement("button"); cta.id = "readycta"; cta.dataset.act = "mready"; cta.className = "btn pri big"; cta.textContent = "▶ Press Ready when you are happy with the team"; document.body.appendChild(cta); } }
  else if (cta) cta.remove();
}
setInterval(() => { tick(); playbackTick(); nudge(); }, 250);

// ---------- lobby ----------
function chatCard(S) {
  if (st.watch) return "";
  return `<div class="card chat"><h3>Chat</h3><div class="log" id="chatlog">${S.chat.map((c) => `<div><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join("") || `<span class="mute small">Say something to the room.</span>`}</div><div class="row"><input id="chatin" class="grow" maxlength="160" placeholder="Message"><button class="btn sm" data-act="chatSend">Send</button></div></div>`;
}
function clubPreview(you) {
  const c = you && you.club ? st.clubBy[you.club] : null; if (!c) return "";
  const kits = [["kitHome", "Home"], ["kitAway", "Away"], ["kitThird", "Third"]].map(([k, l]) => kitImg(c, k, 84) ? `<figure class="kitf">${kitImg(c, k, 84)}<figcaption>${l}</figcaption></figure>` : "").join("");
  return `<div class="clubprev mt"><span class="swatch" style="background:${c.c1}"></span><span class="swatch" style="background:${c.c2}"></span>${crestOfClub(c, 56)}<div class="grow"><b>${esc(c.name)}</b>${c.kind !== "main" ? ` <span class="pill tiny">${c.kind}</span>` : ""}</div>${kits}</div>`;
}
function lobby(S) {
  const you = S.players.find((p) => p.you);
  const taken = new Map(S.players.filter((p) => p.club).map((p) => [p.club, p]));
  const humans = S.players.filter((p) => p.mode !== "player").length, fill = Math.max(0, Math.min(S.settings.minTeams, S.pools && S.pools[S.settings.pool || "all"] ? S.pools[S.settings.pool || "all"].maxClubs : 30) - humans);
  const fam = (slug) => (st.clubBy[slug] && st.clubBy[slug].base) || slug;
  const takenFam = new Map(S.players.filter((p) => p.club).map((p) => [fam(p.club), p]));
  const cont = st.ui.clubCont || "all", CONTS = ["Europe", "South America", "North America", "Africa", "Asia"];
  const mainsAll = st.cat.clubs.filter((c) => c.kind === "main");
  // Sorted by (hidden) fan base; a pinned club (London City Lionesses) leads, so the women's game is visible straight away.
  const lead = (a, b) => (b.pin || 0) - (a.pin || 0), byFans = (a, b) => (b.fans || 0) - (a.fans || 0);
  const shownClubs = mainsAll.filter((c) => cont === "all" || c.continent === cont).sort(cont === "all" ? (a, b) => lead(a, b) || byFans(a, b) : (a, b) => String(a.country).localeCompare(String(b.country)) || lead(a, b) || byFans(a, b));
  const filterBar = `<div class="contbar mt"><button class="btn sm ${cont === "all" ? "pri" : ""}" data-act="clubCont" data-c="all">All (${mainsAll.length})</button>${CONTS.map((k) => `<button class="btn sm ${cont === k ? "pri" : ""}" data-act="clubCont" data-c="${k}">${k} (${mainsAll.filter((c) => c.continent === k).length})</button>`).join("")}</div>`;
  let lastCountry = null;
  const clubs = shownClubs.map((c) => {
    const owner = takenFam.get(c.slug), mine = you && you.club && fam(you.club) === c.slug, others = owner && owner !== you;
    const vars = st.cat.clubs.filter((v) => v.base === c.slug && clubOpen(v, you));
    const shown = mine && you.club !== c.slug ? st.clubBy[you.club] : c;     // the tile wears the chosen scheme
    const boxes = vars.map((v) => `<label class="vopt" title="Use the ${esc(v.label || v.kind)} colours and art"><input type="checkbox" data-change="clubVar" data-main="${c.slug}" data-slug="${v.slug}" ${mine && you.club === v.slug ? "checked" : ""} ${others ? "disabled" : ""}> ${esc(v.label || v.kind)}</label>`).join("");
    const head = cont !== "all" && c.country !== lastCountry ? `<div class="clubcountry">${esc(c.country)}</div>` : ""; lastCountry = c.country;
    return `${head}<div class="club ${mine ? "sel" : ""} ${others ? "taken" : ""}" data-act="club" data-slug="${c.slug}" role="button" tabindex="0">${crestOfClub(shown, 28)}<span class="grow"><b>${esc(c.full || c.name)}</b>${others ? `<div class="tiny mute">${esc(owner.name)}</div>` : cont === "all" ? `<div class="tiny mute">${esc(c.country)}</div>` : ""}${boxes}</span></div>`;
  }).join("");
  const extra = codeClubs(you).map((c) => {
    const owner = takenFam.get(c.slug), mine = you && you.club === c.slug, others = owner && owner !== you;
    return `<div class="club ${mine ? "sel" : ""} ${others ? "taken" : ""}" data-act="club" data-slug="${c.slug}" role="button" tabindex="0">${crestOfClub(c, 28)}<span class="grow"><b>${esc(c.full || c.name)}</b>${others ? `<div class="tiny mute">${esc(owner.name)}</div>` : ""}</span></div>`;
  }).join("");
  const s = S.settings, hostOnly = S.host ? "" : "disabled";
  const sel = (k, opts) => `<select data-set="${k}" ${hostOnly}>${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const main = `<div class="card"><div class="row wrap"><div><h3>Room code</h3><div style="font-size:54px;font-weight:900;letter-spacing:.2em">${esc(S.room)}</div></div><div class="grow"></div>
      <div class="col" style="align-items:flex-end"><button class="btn" data-act="copy">Copy join link</button><span class="small mute">or open <b>/screen</b> on the projector</span></div></div></div>
    ${modeCard(S)}${liteChooser(S)}${you && you.mode === "player" ? creator(S) : ""}
    <div class="card" ${you && you.mode === "player" ? 'style="display:none"' : ""}><h3>Your club</h3><div class="row"><input id="teamname" class="grow" maxlength="28" placeholder="Team name" value="${esc(you?.teamName || "")}"></div><p class="small mute mt">Pick a club for its badge, colours, wallpaper, kits and default name. You can rename it.</p>${clubPreview(you)}${filterBar}<div class="clubgrid mt">${clubs}</div>${extra ? `<h4 class="mt2" style="margin:14px 0 6px">Unlocked clubs</h4><div class="clubgrid">${extra}</div>` : ""}</div>
    ${enterCode(you)}`;
  const side = `<div class="card"><h3>In the room (${S.players.length})</h3><div class="plist">${S.players.map((p) => `<div class="pl"><span class="dot ${p.connected ? (p.idle ? "idle" : "on") : ""}"></span><div class="grow"><b>${esc(p.name)}</b>${p.host ? ` <span class="pill acc">host</span>` : ""}${p.mode === "player" ? ` <span class="pill">footballer</span>` : ""}<div class="small mute">${p.mode === "player" ? esc((p.char && p.char.name) || "") + (p.char ? " · " + esc(p.char.pos) : "") : esc(p.teamName || "no club yet")}</div></div></div>`).join("")}</div>
      ${s.pool && s.pool !== "all" && S.pools ? `<p class="small mute mt">${s.pool === "female" ? "Women" : "Men"}-only league: ${S.pools[s.pool].players} players, ${S.pools[s.pool].keepers} keepers, so at most ${S.pools[s.pool].maxClubs} clubs.</p>` : ""}
      ${fill ? `<p class="small mute mt">${fill} CPU team${fill > 1 ? "s" : ""} will fill the league up to ${s.minTeams}. League sizes are always even; 17–19 managers become 20.</p>` : ""}</div>
    <div class="card"><h3>Game settings ${S.host ? "" : `<span class="tiny">(host only)</span>`}</h3><div class="set">
      <span class="small">Player pool</span>${sel("pool", [["all", "All players"], ["female", "Women only"], ["male", "Men only"]])}
      <span class="small">Minimum teams</span>${sel("minTeams", [10, 12, 14, 16, 20, 24, 30].map((n) => [n, n]))}
      <span class="small">Pace</span>${sel("pace", [[1.4, "Relaxed"], [1, "Normal"], [0.7, "Fast"], [0.5, "Turbo"]])}
      <span class="small">Pack pick timer</span>${sel("draftSec", [[20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"]])}
      <span class="small">Market round timer</span>${sel("marketSec", [[20, "20 s"], [30, "30 s"], [45, "45 s"], [60, "60 s"]])}
      <span class="small">Line-up timer</span>${sel("lineupSec", [[20, "20 s"], [30, "30 s"], [35, "35 s"], [45, "45 s"], [60, "60 s"], [90, "90 s"]])}
      <span class="small">Half-time timer</span>${sel("halfSec", [[10, "10 s"], [15, "15 s"], [20, "20 s"], [30, "30 s"]])}
      <span class="small">Seasons</span>${sel("seasons", [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]))}
      <span class="small">Re-sign timer</span>${sel("resignSec", [[20, "20 s"], [40, "40 s"], [60, "60 s"]])}
      <span class="small">Rookie pick timer</span>${sel("rookieSec", [[15, "15 s"], [25, "25 s"], [40, "40 s"]])}
      <span class="small">Trade window</span>${sel("tradeSec", [[60, "1 min"], [120, "2 min"], [180, "3 min"], [300, "5 min"]])}</div>
      ${S.host ? `<button class="btn pri big mt2" style="width:100%" data-act="start">Start game</button>` : `<p class="small mute mt">Waiting for the host to start.</p>`}</div>
    ${chatCard(S)}`;
  return { main, side };
}

function teamsList(S) {
  return `<div class="card"><h3>Teams</h3><div class="col" style="gap:6px">${S.teams.map((t) => `<div class="row" style="justify-content:space-between">${chip(t, 20, true)}<span class="tiny mute">${t.human ? (t.connected ? (t.idle ? "idle" : "") : "offline") : "CPU"} · ${t.players.length} player${t.players.length === 1 ? "" : "s"}</span></div>`).join("")}</div></div>`;
}
function hostBar(S) {
  if (!S.host || S.step === "lobby") return "";
  return `<div class="hostbar"><button class="btn sm" data-act="${S.paused ? "resume" : "pause"}">${S.paused ? "▶ Resume" : "⏸ Pause"}</button><button class="btn sm" data-act="skip">Skip ⏭</button></div>`;
}

// ---------- render ----------
let lastMain = "", lastSide = "";
function render() {
  const S = st.S; if (!S) return;
  applyTheme(); renderTop();
  let main = "", side = "";
  const ctx = { chatCard, teamsList };
  if (S.step === "lobby") ({ main, side } = lobby(S));
  else if (S.step.startsWith("draft.")) ({ main, side } = draftView(S, ctx));
  else if (S.step.startsWith("market.")) ({ main, side } = marketView(S, ctx));
  else if (S.step.startsWith("off.")) ({ main, side } = offView(S, ctx));
  else ({ main, side } = matchView(S, ctx));
  if (S.step !== "lobby") { main = tradePopup(S) + newsAsk(S) + main; if (S.pm) main = gambleOverlay(S) + (S.step.startsWith("draft.") ? creator(S) : "") + pmPanel(S) + (/^(md|season)\./.test(S.step) ? lifePanel(S) : "") + main; if (S.news && S.news.list.length && S.step !== "md.lineup") main += newsCard(S); if (S.step.startsWith("market.") && S.step !== "market.done") main += seekersCard(S); if (S.step !== "md.lineup") main += storeCard(S); }
  if (!$(".page", el.body)) el.body.innerHTML = `<div class="page"><div class="main" id="mainwrap"></div><div class="side" id="sidewrap"></div></div>`;
  const mw = $("#mainwrap"), sw = $("#sidewrap");
  const keep = $$("[data-keep]").map((n) => [n.dataset.keep, n.scrollTop, n.scrollLeft]);
  const typed = $$("input[id]").filter((n) => n.type !== "checkbox" && n.type !== "range").map((n) => [n.id, n.value]);
  const fo = document.activeElement && document.activeElement.id;
  if (main !== lastMain) { mw.innerHTML = main; lastMain = main; }
  if (side !== lastSide) { sw.innerHTML = side; lastSide = side; }
  el.host.innerHTML = hostBar(S);
  for (const [k, top, left] of keep) { const n = $(`[data-keep="${k}"]`); if (n) { n.scrollTop = top; n.scrollLeft = left; } }
  for (const [id, val] of typed) { const n = document.getElementById(id); if (n && n.value !== val) n.value = val; }
  if (fo && $("#" + fo) && document.activeElement !== $("#" + fo)) $("#" + fo).focus();
  const log = $("#chatlog"); if (log) log.scrollTop = log.scrollHeight;
  if (st.ui.lastStep !== S.step) { st.ui.lastStep = S.step; window.scrollTo(0, 0); }
  document.body.dataset.view = S.step === "lobby" ? "lobby" : S.step === "md.lineup" ? "hub" : /^md\./.test(S.step) ? "match" : "other";
  playbackTick(); pcardSync(); phaseBanner(S); maybeFirstGuide(S);
}
st.render = render;
window.__st = st;

// ---------- boot ----------
if (st.watch && st.room) { intent = { t: "watch", room: st.room }; connect(); }
else if (st.room && store("name")) { intent = { t: "join", room: st.room, name: store("name") }; connect(); }
else landing();
