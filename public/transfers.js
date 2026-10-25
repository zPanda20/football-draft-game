// The in-season transfer window: for the first matchdays of a season, between matches, trade with any club, sign free agents
// straight away and drop players (no refund). The server decides whether it is open; this page just shows it.
import { st, esc, send, team, card, pl, coins, userTags } from "./core.js";
import { tradeBody } from "./off.js";

const ui = () => st.ui;
export const winHandlers = {
  tpLater(a) { (st.ui.tradeHide || (st.ui.tradeHide = {}))[a.id] = true; st.render(); },
  winTab(a) { ui().winTab = a.tab; st.render(); },
  winSign(a) { send({ t: "windowSign", id: +a.id, len: +a.len }); },
  winDrop(a) { if (ui().dropAsk === +a.id) { ui().dropAsk = null; send({ t: "windowDrop", id: +a.id }); } else { ui().dropAsk = +a.id; st.render(); } },
  winDropNo() { ui().dropAsk = null; st.render(); },
  winPos(a) { ui().winPos = a.value; st.render(); },
  winSort(a) { ui().winSort = a.value; st.render(); },
  winQ(a) { ui().winQ = a.value; st.render(); },
};

export const winOpen = (S) => !!(S.window && S.window.open && S.me);
export function winCountdown(S) {
  const w = S.window; if (!w) return "";
  if (!w.open) return "Transfer window closed";
  return w.left === 1 ? "Last chance: the window closes at kick-off" : `${w.left} matchdays left in the window`;
}
export function incomingOffers(S) { const t = S.me && S.me.trade; return t ? t.offers.filter((o) => o.to === S.me.teamId && o.status === "open").length : 0; }

function banner(S) {
  const w = S.window, left = w.left, total = w.total;
  const dots = Array.from({ length: total }, (_, i) => `<i class="${i < w.done ? "gone" : i === w.done ? "now" : ""}"></i>`).join("");
  return `<div class="card winhead"><div class="row wrap" style="gap:14px"><div><h3 style="margin:0">Transfer window <span class="pill good">OPEN</span></h3>
      <div class="small mute mt">${left === 1 ? "<b>Final matchday of the window.</b> It shuts at kick-off." : `Closes at kick-off of matchday ${total}.`} After that: no trades, no signings, no drops until next season.</div></div><div class="grow"></div>
      <div class="wincount"><b>${left}</b><span>matchday${left === 1 ? "" : "s"} left</span></div></div>
    <div class="windots mt" title="Matchdays in the window">${dots}</div>
    <div class="row mt wrap" style="gap:12px"><span>Coins ${coins(S.me.coins)}</span><span class="pill">${team(S.me.teamId).players.length}/${team(S.me.teamId).cap} players</span><span class="small mute">Next kick-off in <b id="wclock">–</b></span></div></div>`;
}

function faTab(S) {
  const me = S.me, t = team(me.teamId), room = (me.rosterRoom ?? 0) > 0, maxLen = me.maxLen || 3;
  const pos = ui().winPos || "all", sort = ui().winSort || "ovr", q = (ui().winQ || "").toLowerCase();
  let list = (S.window.pool || []).map((id) => pl(id)).filter(Boolean);
  if (pos !== "all") list = list.filter((p) => (pos === "GK" ? p.pos === "GK" : pos === "DEF" ? ["CB", "LB", "RB"].includes(p.pos) : pos === "MID" ? ["CDM", "CM", "CAM", "LM", "RM"].includes(p.pos) : ["LW", "RW", "ST"].includes(p.pos)));
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
  list.sort(sort === "mv" ? (a, b) => b.mv - a.mv : sort === "age" ? (a, b) => a.age - b.age : (a, b) => b.ovr - a.ovr);
  const fee = (p, l) => Math.round(p.mv * st.cat.rules.lenMult[l]);
  const rows = list.slice(0, 40).map((p) => `<div class="farow">${card(p.id, { size: "sm", info: true })}<div class="grow col" style="gap:6px"><div><b>${esc(p.name)}</b> <span class="mute small">${p.pos} · ${p.age}y · value ${p.mv}</span></div>
      <div class="row wrap" style="gap:6px">${[1, 2, 3].filter((l) => l <= maxLen).map((l) => { const f = fee(p, l); return `<button class="btn sm pri" data-act="winSign" data-id="${p.id}" data-len="${l}" ${room && me.coins >= f ? "" : "disabled"}>${l} season${l > 1 ? "s" : ""} · ${f}</button>`; }).join("")}</div></div></div>`).join("");
  return `<div class="card"><div class="row wrap" style="gap:8px"><h3 style="margin:0">Free agents</h3><div class="grow"></div>
      <select data-change="winPos">${[["all", "All positions"], ["GK", "Keepers"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["ATT", "Attackers"]].map(([v, l]) => `<option value="${v}" ${pos === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select data-change="winSort">${[["ovr", "Best first"], ["mv", "Highest value"], ["age", "Youngest"]].map(([v, l]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input id="winq" placeholder="Search…" value="${esc(ui().winQ || "")}" data-input="winQ" style="width:130px"></div>
    <p class="small mute mt">Sign straight away at the market price, no draw: the first manager to press the button gets him. ${room ? "" : `<b>Your squad is full (${t.cap}).</b> Drop someone first (no refund). `}</p>
    <div class="fagrid mt">${rows || `<p class="mute small">Nobody matches.</p>`}</div></div>`;
}
function dropTab(S) {
  const me = S.me, t = team(me.teamId), min = st.cat.rules.rosterMin;
  const ps = t.players.map((id) => pl(id)).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const gks = ps.filter((p) => p.pos === "GK").length;
  const rows = ps.map((p) => {
    const locked = p.user || ps.length <= min || (p.pos === "GK" && gks <= 1), ask = ui().dropAsk === p.id;
    return `<div class="farow">${card(p.id, { size: "sm", info: true, tag: `${p.contract} yr${p.contract === 1 ? "" : "s"} left` })}<div class="grow col" style="gap:6px"><div><b>${esc(p.name)}</b> <span class="mute small">${p.pos} · ${p.age}y</span></div>
      <div class="row wrap" style="gap:6px">${p.user ? `<span class="small mute">A created footballer cannot be dropped.</span>` : ask ? `<button class="btn sm bad" data-act="winDrop" data-id="${p.id}">Yes, drop him (no refund)</button><button class="btn sm" data-act="winDropNo">Keep</button>` : `<button class="btn sm" data-act="winDrop" data-id="${p.id}" ${locked ? "disabled" : ""}>Drop</button><span class="tiny mute">${locked ? (ps.length <= min ? `A squad needs ${min} players.` : "Your only keeper.") : "Goes to the free-agent pool. The contract money is gone."}</span>`}</div></div></div>`;
  }).join("");
  return `<div class="card"><h3>Your squad (${ps.length}/${t.cap})</h3><p class="small mute">Dropping a player frees a roster spot. <b>There is no refund</b> and he joins the free-agent pool where anybody can sign him.</p><div class="fagrid mt">${rows}</div></div>`;
}

export function transfersView(S) {
  if (!S.window || !S.window.open || !S.me) return `<div class="card"><h3>Transfer window</h3><p class="mute">The window is closed. It reopens in the first matchdays of next season.</p></div>`;
  const tab = ui().winTab || "trade", n = incomingOffers(S);
  const tabs = [["trade", `Trade${n ? ` (${n})` : ""}`], ["fa", "Free agents"], ["drop", "Drop players"]].map(([k, l]) => `<button class="btn sm ${tab === k ? "pri" : ""}" data-act="winTab" data-tab="${k}">${l}</button>`).join("");
  const body = tab === "fa" ? faTab(S) : tab === "drop" ? dropTab(S) : tradeBody(S);
  return `${banner(S)}<div class="row wrap mt" style="gap:6px">${tabs}</div><div class="mt">${body}</div>`;
}

// ---------- a trade offer from another manager takes over the screen until it is answered or put off ----------
export function tradePopup(S) {
  const t = S.me && S.me.trade; if (!t) return "";
  const hidden = st.ui.tradeHide || (st.ui.tradeHide = {});
  const open = t.offers.filter((o) => o.to === S.me.teamId && o.status === "open");
  const shown = open.filter((o) => !hidden[o.id]); if (!shown.length) return "";
  const o = shown[0], from = team(o.from);
  const side = (list) => {
    const ps = list.filter((a) => a.k === "p"), rest = list.filter((a) => a.k !== "p");
    return `<div class="tp-cards">${ps.map((a) => `<div class="tp-c">${card(a.id, { size: "sm", info: true, tag: " " })}<span class="tiny mute">${(pl(a.id) || {}).contract ? (pl(a.id).contract + " season" + (pl(a.id).contract === 1 ? "" : "s") + " left") : ""}</span></div>`).join("")}</div>
      ${rest.map((a) => `<div class="pill">${a.k === "i" ? esc((st.items[a.id] || {}).name || a.id) : coins(a.amt)}</div>`).join(" ")}${list.length ? "" : `<span class="mute">Nothing</span>`}`;
  };
  return `<div class="gamble tradepop" role="dialog" aria-label="Trade offer"><div class="gamble-in">
    <div class="tiny mute" style="text-transform:uppercase;letter-spacing:.12em">Trade offer${shown.length > 1 ? ` · ${shown.length} waiting` : ""}</div>
    <h2>${esc(from.owner || from.name)} wants a deal</h2>
    <p class="lead">${esc(from.name)} have sent you an offer. ${S.window && S.window.open ? S.window.left <= 1 ? "The window shuts at the next kick-off." : `The window is open for ${S.window.left} more matchdays.` : ""}</p>
    <div class="tp-grid"><div><h4>You get</h4>${side(o.give)}</div><div class="tp-arrow">⇄</div><div><h4>You give</h4>${side(o.get)}</div></div>
    <div class="row mt" style="justify-content:flex-end;gap:10px"><button class="btn sm ghost" data-act="tpLater" data-id="${o.id}">Decide later</button><button class="btn" data-act="trNo" data-id="${o.id}">Decline</button><button class="btn pri big" data-act="trYes" data-id="${o.id}">Accept</button></div></div></div>`;
}
