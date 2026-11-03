// Player mode screens: the character creator (lobby), the career panel shown over every game screen, and the manager's list of free players.
import { st, esc, send, team, chip, crest, card, pl, miniPlayer, itemCard, coins, flag, tierOf, avatar, faceOf, SKIN, HAIRC, HAIR_NAMES, ISO_NATIONS } from "./core.js";

const POS = ["ST", "LW", "RW", "CAM", "CM", "LM", "RM", "CDM", "CB", "LB", "RB", "GK"];
const OUT = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"], GKL = ["DIV", "HAN", "KIC", "REF", "SPE", "POS"];
const ui = () => st.ui;
const you = (S) => S.players.find((p) => p.you);

export const pmHandlers = {
  mode(a) { send({ t: "mode", mode: a.mode }); },
  roll() { send({ t: "roll" }); },
  charName(a) { send({ t: "char", c: { name: a.value } }); },
  charPos(a) { send({ t: "char", c: { pos: a.value } }); },
  charNat(a) { send({ t: "char", c: { nat: a.value } }); },
  charGender(a) { send({ t: "char", c: { gender: a.g } }); },
  charFace(a) { const y = you(st.S), p = String((y && y.char && y.char.img) || "0-0-0").split("-").map(Number); if (a.f && a.f.startsWith("f:")) return send({ t: "char", c: { img: a.f } }); p[+a.part] = +a.v; send({ t: "char", c: { img: p.slice(0, 3).join("-") } }); },
  charSwap(a) {
    const i = +a.i, s = ui().swap, y = you(st.S), asg = y && y.char && y.char.assign;
    if (!asg) return;
    if (s == null) { ui().swap = i; st.render(); return; }
    ui().swap = null;
    if (s !== i) { const n = asg.slice(); [n[s], n[i]] = [n[i], n[s]]; send({ t: "char", c: { assign: n } }); } else st.render();
  },
  offerMake(a) { send({ t: "offer", pid: +a.pid, len: +a.len }); },
  offerDrop(a) { send({ t: "offerWithdraw", id: +a.id }); },
  offerYes(a) { send({ t: "offerRespond", id: +a.id, accept: true }); },
  offerNo(a) { send({ t: "offerRespond", id: +a.id, accept: false }); },
  cardPick(a) { send({ t: "card", n: +a.n, opt: +a.opt }); st.ui.gambleHide = null; },
  gambleLater() { const pm = st.S.pm; st.ui.gambleHide = pm && pm.pending.length ? pm.pending[pm.pending.length - 1].n : null; st.render(); },
  gambleShow() { st.ui.gambleHide = null; st.render(); },
  pmEquip(a) {
    const pm = st.S.pm, cap = st.cat.rules.playerItemCap ?? 2; let ids = pm.equip.slice();
    ids = ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id].slice(0, cap);
    send({ t: "equipSelf", ids });
  },
  openPack() { send({ t: "itemPack" }); },
  packPick(a) { send({ t: "packPick", idx: +a.idx }); },
  effort(a) { send({ t: "effort", mode: a.mode === (st.S.pm && st.S.pm.effort) ? null : a.mode }); },
};

// ---------- lobby ----------
export function modeCard(S) {
  const y = you(S); if (!y) return "";
  const pm = y.mode === "player";
  return `<div class="card"><h3>How do you want to play?</h3><div class="row wrap" style="gap:8px"><button class="btn ${pm ? "" : "pri"}" data-act="mode" data-mode="manager">Manage a team</button><button class="btn ${pm ? "pri" : ""}" data-act="mode" data-mode="player">Play as a footballer</button></div>
    <p class="small mute mt">${pm ? "You create a footballer, grow him through the season and pick which team to join. You do not run a team." : "You draft, bid and set line-ups for a club."}</p></div>`;
}
export function creator(S) {
  const y = you(S); if (!y || y.mode !== "player" || !y.char) return "";
  const c = y.char, gk = c.pos === "GK", labels = gk ? GKL : OUT, sw = ui().swap;
  const rolls = st.cat.rules.rerolls ?? 2;
  const rows = labels.map((l, i) => { const v = c.nums[c.assign[i]]; return `<button class="statrow ${sw === i ? "sel" : ""}" data-act="charSwap" data-i="${i}"><b>${l}</b><span class="bar"><i style="width:${Math.max(4, (v - 40) * 100 / 57)}%"></i></span><em>${v}</em></button>`; }).join("");
  const pool = S.settings && S.settings.pool, gLock = pool === "female" || pool === "male", g = c.gender || "M", [fs, fh, fc] = String(c.img || "0-0-0").split("-").map(Number);
  const dots = (part, list, cur, label) => `<div class="facerow"><span class="small mute">${label}</span>${list.map((col, i) => `<button class="fdot ${cur === i ? "sel" : ""}" style="background:${col}" data-act="charFace" data-part="${part}" data-v="${i}" aria-label="${label} ${i + 1}"></button>`).join("")}</div>`;
  const hairBtns = `<div class="facerow"><span class="small mute">Hair</span>${HAIR_NAMES.map((n, i) => `<button class="btn sm ${fh === i ? "pri" : ""}" data-act="charFace" data-part="1" data-v="${i}">${n}</button>`).join("")}</div>`;
  const looks = `<div class="row wrap mt" style="gap:14px;align-items:flex-start"><div class="facebox">${faceOf(c.img, 92, g)}</div><div class="col grow" style="gap:6px;min-width:230px">${dots(0, SKIN, fs, "Skin")}${hairBtns}${dots(2, HAIRC, fc, "Hair colour")}${(st.cat.faces || []).length ? `<div class="facerow"><span class="small mute">Photos</span>${st.cat.faces.map((f) => `<button class="fphoto ${c.img === "f:" + f ? "sel" : ""}" data-act="charFace" data-f="f:${esc(f)}"><img src="/assets/faces/${encodeURIComponent(f)}" alt="" width="36" height="36"></button>`).join("")}</div>` : ""}</div></div>`;
  return `<div class="card"><h3>Create your footballer</h3>
    <div class="row wrap" style="gap:10px"><input id="charname" maxlength="22" value="${esc(c.name)}" placeholder="Name" data-change="charName" style="flex:1;min-width:160px"><select data-change="charPos">${POS.map((p) => `<option ${p === c.pos ? "selected" : ""}>${p}</option>`).join("")}</select>
      <select data-change="charNat" title="Nation"><option value="">Nation…</option>${ISO_NATIONS.map((n) => `<option value="${esc(n)}" ${n === c.nat ? "selected" : ""}>${flag(n)} ${esc(n)}</option>`).join("")}</select>
      <span class="seg"><button class="btn sm ${g === "M" ? "pri" : ""}" data-act="charGender" data-g="M" ${gLock && pool !== "male" ? "disabled" : ""}>Man</button><button class="btn sm ${g === "F" ? "pri" : ""}" data-act="charGender" data-g="F" ${gLock && pool !== "female" ? "disabled" : ""}>Woman</button></span></div>${looks}
    <div class="row mt" style="gap:12px;align-items:center"><div class="rollovr ${tierOf(c.ovr)}"><b>${c.ovr}</b><small>Overall</small></div><div class="small mute grow">Starting overall. The six numbers below are rolled for you; tap two stats to swap their numbers and shape your player.</div><button class="btn sm" data-act="roll" ${c.rolls >= rolls ? "disabled" : ""}>Re-roll (${Math.max(0, rolls - c.rolls)} left)</button></div>
    <div class="col mt" style="gap:6px">${rows}</div>
    <p class="small mute mt">${S.phase === "draft" || (S.step || "").startsWith("draft.") ? "The others are still drafting, so you can keep re-rolling and shuffling your numbers. This closes when the market opens." : "After the draft you will wait in the free-agent pool until a manager signs you. If nobody does by the end of the first off-season, a computer team takes you."}</p></div>`;
}

// ---------- in-game panel for a player-mode user ----------
function offerRow(o) {
  const t = team(o.team);
  return `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${chip(t, 18, true)} <span class="mute small">${o.len} season${o.len > 1 ? "s" : ""}${o.from === "cpu" ? " · computer team" : ""}</span></span>${o.status === "open" ? `<span class="row" style="gap:6px"><button class="btn sm pri" data-act="offerYes" data-id="${o.id}">Accept</button><button class="btn sm" data-act="offerNo" data-id="${o.id}">Decline</button></span>` : `<span class="pill good">signed</span>`}</div>`;
}
function cardBox(c) {
  const pc = (p) => Math.round(p * 100);
  return `<div class="card" style="padding:10px;border-color:var(--acc)"><div class="tiny mute" style="text-transform:uppercase;letter-spacing:.08em">${esc(c.kind)}</div><b>${esc(c.title)}</b><p class="small mute" style="margin:4px 0 8px">${esc(c.text)}</p>
    <div class="col" style="gap:6px">${c.opts.map((o, i) => `<button class="btn" data-act="cardPick" data-n="${c.n}" data-opt="${i}" style="justify-content:space-between;text-align:left">${esc(o.label)} <span class="small">${o.p >= 1 ? "safe" : `<span style="color:var(--good)">${pc(o.p)}% +${o.win}</span> · <span style="color:var(--bad)">${pc(1 - o.p)}% ${o.lose < 0 ? "" : "+"}${o.lose}</span>`}</span></button>`).join("")}</div></div>`;
}
// The footballer's header: who he is, where he plays, and the one-line news of the week.
// Split into parts so the career panel (draft, market, off-season) and the matchday screens (pmscreen.js) show the same pieces.
export function pmBits(S) {
  const pm = S.pm; if (!pm) return null;
  const p = pl(pm.pid); if (!p) return null;
  const t = pm.team != null ? team(pm.team) : null;
  const status = t ? `<span class="playsfor">Plays for ${crest(t, 26)} <b>${esc(t.name)}</b></span> <span class="mute">· ${pm.contract} season${pm.contract === 1 ? "" : "s"} left</span>` : `<b>No team yet.</b> <span class="mute">${pm.market ? "Offers arrive while the market is open." : "You follow the league from the stands."}</span>`;
  const last = pm.last ? `<div class="pill ${pm.last.ok ? "good" : "bad"}" style="margin-top:6px">${pm.last.ok ? "✓" : "✗"} ${esc(pm.last.title)}: ${esc(pm.last.choice)}${pm.last.ovr ? ` (${pm.last.ovr > 0 ? "+" : ""}${pm.last.ovr} OVR)` : ""}</div>` : "";
  const open = pm.offers.filter((o) => o.status === "open" || o.status === "accepted");
  const ban = pm.susp ? `<span class="pill bad">Suspended: ${pm.susp} game${pm.susp > 1 ? "s" : ""} left</span>` : "";
  const eff = pm.onPitch ? `<div class="mt"><b>Half-time</b><div class="row mt" style="gap:8px"><button class="btn ${pm.effort === "push" ? "pri" : ""}" data-act="effort" data-mode="push">Push</button><button class="btn ${pm.effort === "conserve" ? "pri" : ""}" data-act="effort" data-mode="conserve">Conserve</button></div><p class="small mute mt">Push: a little sharper, tires you faster. Conserve: save your legs for later.</p></div>` : "";
  const pend = pm.pending.length ? `<div class="mt"><button class="btn pri" data-act="gambleShow">${pm.pending.length} career moment${pm.pending.length === 1 ? "" : "s"} waiting · decide</button></div>` : "";
  const offers = open.length ? `<div class="mt"><b>Offers</b>${open.map(offerRow).join("")}</div>` : (pm.unsigned && pm.market ? `<p class="small mute mt">No offers yet. Managers can still make them this round.</p>` : "");
  return { pm, p, status, last, ban, eff, pend, offers, extra: `${pend}${offers}${eff}` };
}
export function pmPanel(S) {
  const b = pmBits(S); if (!b) return "";
  const { pm, p } = b;
  return `<div class="card pmp"><div class="pmhead">${card(pm.pid, { size: "sm" })}<div class="grow col" style="gap:5px;min-width:0"><h3 style="margin:0">${esc(p.name)} <span class="mute small">${esc(p.pos)} · ${p.age}y · OVR ${p.ovr}</span></h3><div class="small">${b.status}</div><div class="row wrap" style="gap:8px"><span class="pill">${coins(pm.coins)}</span>${b.ban}</div>${b.last}</div></div>
    ${b.extra}</div>`;
}

// Your kit: match items you can wear (up to the cap), life items waiting for the right week, and item packs.
export function pmKit(S) {
  const pm = S.pm; if (!pm) return "";
  const own = Object.keys(pm.items || {}).filter((id) => pm.items[id] > 0 && st.items[id]), gear = own.filter((id) => !st.items[id].life), lifeIn = own.filter((id) => st.items[id].life);
  const ico = (it) => { const u = it.icon && st.cat.art && st.cat.art.items && st.cat.art.items[it.icon]; return u ? `<img class="kicon" src="${esc(u)}" alt="" width="34" height="34">` : ""; };
  const cap = st.cat.rules.playerItemCap ?? 2;
  const gearRows = gear.map((id) => { const it = st.items[id]; return `<label class="krow"><input type="checkbox" ${pm.equip.includes(id) ? "checked" : ""} data-change="pmEquip" data-id="${id}">${ico(it)}<span class="grow"><b>${esc(it.name)}</b>${it.banned ? ` <span class="pill bad tiny"><img class="wadamark" src="/assets/wada-mark.png" alt="" width="12" height="12"> banned</span>` : ""}<span class="tiny mute"> ${pm.items[id]} left · ${esc(it.text)}</span></span></label>`; }).join("");
  const lifeRows = lifeIn.map((id) => { const it = st.items[id]; return `<div class="krow">${ico(it)}<span class="grow"><b>${esc(it.name)}</b> <span class="pill tiny">${pm.items[id]} left</span><span class="tiny mute"> ${esc(it.text)}</span></span></div>`; }).join("");
  const body = gear.length || lifeIn.length ? `${gear.length ? `<div class="tiny mute kh">Match gear · wear up to ${cap} in the next match</div>${gearRows}` : ""}${lifeIn.length ? `<div class="tiny mute kh">For your week · used automatically on the matching activity</div>${lifeRows}` : ""}` : `<p class="small mute" style="margin:6px 0 0">Nothing yet. Open your packs in the draft, or buy gear in the Shop.</p>`;
  return `<div class="card pmkit"><div class="row wrap" style="gap:10px;align-items:center"><h3 style="margin:0">Your kit</h3><span class="pill">${coins(pm.coins)}</span></div>${body}${packStrip(S)}</div>`;
}

// Item packs: opened during the draft. Each pack deals three cards and you keep one; what is left is opened for you when the draft ends.
function packStrip(S) {
  const pm = S.pm, draft = S.step.startsWith("draft.");
  const log = (pm.packLog || []).map((r) => r.kind === "coins" ? `<span class="pill good">${coins(r.amt)}</span>` : st.items[r.id] ? `<span class="pill good" title="${esc(st.items[r.id].text)}">${esc(st.items[r.id].name)}</span>` : "").join(" ");
  if (!pm.packs && !log && !pm.pack) return "";
  return `<div class="mt packstrip"><div class="row wrap" style="gap:10px;align-items:center"><b>Item packs</b>${pm.packs ? `<button class="btn pri ${draft ? "nudgeme" : ""}" data-act="openPack" ${draft && !pm.pack ? "" : "disabled"}>Open a pack (${pm.packs} left)</button>` : ""}<span class="small mute">${pm.packs ? (draft ? "Three cards a pack: keep one. Unopened packs open themselves when the draft ends." : "Packs can be opened during the draft.") : "All opened."}</span></div>${log ? `<div class="row wrap mt" style="gap:6px">You took: ${log}</div>` : ""}</div>`;
}

// The pack opening: three cards flip over, you keep one.
export function packOverlay(S) {
  const pm = S.pm; if (!pm || !pm.pack) return "";
  const tierOfItem = (it) => (it.tier === "top" ? "ruby" : it.tier === "mid" ? "gold" : it.life ? "gold" : "silver");
  const cards = pm.pack.map((c, i) => {
    const it = c.kind === "item" ? st.items[c.id] : null, t = it ? tierOfItem(it) : "gold";
    const inner = it ? itemCard(it, {}) : `<div class="icard mid purse"><div class="iicon purseic">🪙</div><div class="iname">Purse of coins</div><div class="itext">Straight into your wallet. Spend it in the Shop.</div><div class="imeta">+${c.amt} coins</div></div>`;
    return `<div class="pickable flip3d t-${t}" data-act="packPick" data-idx="${i}" style="animation-delay:${0.25 + i * 0.3}s" role="button" tabindex="0"><div class="fback">?</div>${inner}</div>`;
  }).join("");
  return `<div class="gamble packov" role="dialog" aria-label="Item pack"><div class="gamble-in">
    <div class="tiny mute" style="text-transform:uppercase;letter-spacing:.12em">Item pack${pm.packs ? ` · ${pm.packs} more after this` : " · your last one"}</div>
    <h2>Keep one</h2><p class="lead">Three cards. Tap the one you want; the others go back in the box.</p>
    <div class="hand packhand">${cards}</div></div></div>`;
}

// ---------- manager's view of players looking for a club ----------
export function seekersCard(S) {
  const sk = S.seekers, me = S.me; if (!sk || !sk.length || !me) return "";
  const t = team(me.teamId), full = t.players.length >= t.cap;
  const mine = me.offers || [];
  return `<div class="card"><h3>Footballers looking for a club</h3><p class="small mute">Each of these is controlled by a person. Make an offer instead of bidding: the player chooses. You pay the fee only if he signs.</p>
    <div class="col mt" style="gap:10px">${sk.map((s) => { const p = pl(s.id); return `<div class="row wrap" style="gap:10px;align-items:center">${miniPlayer(s.id)}<span class="mute small">${esc(s.owner)} · ${p.age}y</span><div class="grow"></div>${s.fees.map((f, i) => `<button class="btn sm ${s.mine.includes(i + 1) ? "pri" : ""}" data-act="offerMake" data-pid="${s.id}" data-len="${i + 1}" ${full || me.coins < f ? "disabled" : ""}>${i + 1}y · ${f}</button>`).join("")}</div>`; }).join("")}</div>
    ${mine.length ? `<div class="small mute mt">Your offers: ${mine.map((o) => `${esc(pl(o.pid).name)} ${o.len}y (${o.status})${o.status === "open" ? ` <a href="#" data-act="offerDrop" data-id="${o.id}">withdraw</a>` : ""}`).join(" · ")}</div>` : ""}</div>`;
}

// A career moment (a gamble with odds) takes over most of the screen until it is decided or put off.
export function gambleOverlay(S) {
  const pm = S.pm; if (!pm || !pm.pending.length) return "";
  const last = pm.pending[pm.pending.length - 1]; if (st.ui.gambleHide === last.n) return "";
  const c = pm.pending[0], pc = (p) => Math.round(p * 100);
  return `<div class="gamble" role="dialog" aria-label="Career moment"><div class="gamble-in">
    <div class="tiny mute" style="text-transform:uppercase;letter-spacing:.12em">${esc(c.kind)}${pm.pending.length > 1 ? ` · ${pm.pending.length} waiting` : ""}</div>
    <h2>${esc(c.title)}</h2><p class="lead">${esc(c.text)}</p>
    <div class="gopts">${c.opts.map((o, i) => `<button class="gopt ${o.p >= 1 ? "safe" : ""}" data-act="cardPick" data-n="${c.n}" data-opt="${i}"><b>${esc(o.label)}</b><span class="odds">${o.p >= 1 ? "Safe" : `<span class="up">${pc(o.p)}% · +${o.win}</span><span class="dn">${pc(1 - o.p)}% · ${o.lose > 0 ? "+" : ""}${o.lose}</span>`}</span></button>`).join("")}</div>
    <div class="row mt" style="justify-content:flex-end"><button class="btn sm ghost" data-act="gambleLater">Decide later</button></div></div></div>`;
}
