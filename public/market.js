// Pre-season market: free agents are won by the market-value lottery; ordinary items are bought at a fixed price.
import { st, $, esc, send, team, chip, card, pl, miniPlayer, itemCard, coins, flag, tierOf } from "./core.js";
import { squadCard } from "./draft.js";

const ui = () => st.ui;

function target(S) { return ui().sel; }
function feeOf(p, len) { return Math.round(p.mv * st.cat.rules.lenMult[len]); }
function curBid(S) {
  const sel = target(S); if (!sel) return null;
  if (sel.kind === "p") { const p = pl(sel.id); if (!p) return null; const min = feeOf(p, ui().bidLen); return { sel, p, min }; }
  const it = st.items[sel.id]; return { sel, it, min: it.price };
}
function sendBid(lock) {
  const S = st.S, b = curBid(S); if (!b) return;
  send({ t: "bid", bid: { kind: b.sel.kind, id: b.sel.id, len: b.sel.kind === "p" ? ui().bidLen : 1, extra: ui().bidExtra | 0 }, lock: !!lock });
}
const maxExtra = (S, min) => Math.max(0, Math.min(Math.floor(min * st.cat.rules.extraCap), Math.floor(S.me.coins - min)));

export const marketHandlers = {
  mkTab(a) { ui().mkTab = a.tab; st.render(); },
  mkPos(a) { ui().pos = a.value; st.render(); },
  mkSort(a) { ui().sort = a.value; st.render(); },
  mkSelect(a) {
    ui().sel = { kind: a.kind, id: a.kind === "p" ? +a.id : a.id }; ui().bidExtra = 0;
    sendBid(false); st.render();
  },
  mkLen(a) { ui().bidLen = +a.len; const b = curBid(st.S); if (b) ui().bidExtra = Math.min(ui().bidExtra, maxExtra(st.S, b.min)); sendBid(false); st.render(); },
  mkExtraLive(a) { ui().bidExtra = +a.value; const o = $("#extraOut"); if (o) o.textContent = a.value; const x = $("#oddsOut"); const b = curBid(st.S); if (x && b) x.textContent = "×" + (1 + a.value / b.min).toFixed(2); },
  mkExtra(a) { ui().bidExtra = +a.value; sendBid(false); },
  mkLock() { sendBid(true); },
  mkUnlock() { send({ t: "bidUnlock" }); },
  mkPass() { send({ t: "pass" }); },
  buyItem(a) { send({ t: "buy", id: a.id }); },
};

function poolList(S) {
  const f = ui().pos, sort = ui().sort;
  let ids = S.market.pool.map((id) => pl(id)).filter((p) => p && (f === "all" || p.pos === f || (f === "DEF" && ["CB", "LB", "RB"].includes(p.pos)) || (f === "MID" && ["CDM", "CM", "LM", "RM", "CAM"].includes(p.pos)) || (f === "ATT" && ["ST", "LW", "RW"].includes(p.pos))));
  ids.sort((a, b) => (sort === "mv" ? b.mv - a.mv : sort === "age" ? a.age - b.age : b.ovr - a.ovr));
  const mine = S.me.bid && S.me.bid.kind === "p" ? S.me.bid.id : null;
  const rows = ids.slice(0, 150).map((p) => `<div class="poolrow ${ui().sel && ui().sel.kind === "p" && ui().sel.id === p.id ? "sel" : ""}" data-act="mkSelect" data-kind="p" data-id="${p.id}">
    <span class="ovrb ${tierOf(p.ovr)}">${p.ovr}</span><span><b>${esc(p.name)}</b> <span class="mute small">${esc(p.pos)} ${flag(p.nat)} ${esc(p.club)}</span></span><span class="mute small">${p.age}y</span><span class="mute small">${p.st[6]} STA</span><span class="coin right">${p.mv}<i></i></span></div>`).join("");
  return `<div class="row wrap mt" style="gap:8px"><select data-change="mkPos">${[["all", "All positions"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["ATT", "Attackers"], ["GK", "Keepers"]].map(([v, l]) => `<option value="${v}" ${f === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <select data-change="mkSort">${[["ovr", "Best first"], ["mv", "Highest value"], ["age", "Youngest"]].map(([v, l]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`).join("")}</select><span class="small mute">${ids.length} available · value = minimum 1-season offer</span></div>
    <div class="poolwrap mt" data-keep="pool">${rows || `<div class="small mute" style="padding:12px">Nobody matches.</div>`}</div>`;
}

function bidPanel(S) {
  const me = S.me, b = curBid(S), locked = me.bid && me.bid.locked;
  if (me.done) return `<div class="card"><h3>Your bid</h3><p class="mute">You are done shopping for this window.</p></div>`;
  if (me.rosterRoom <= 0 && (!ui().sel || ui().sel.kind === "p")) return `<div class="card"><h3>Your bid</h3><p class="mute">Your roster is full (${st.cat.rules.rosterMax}).</p></div>`;
  if (!b) return `<div class="card"><h3>Your bid</h3><p class="mute">Choose a free agent or an item.</p><div class="row mt"><button class="btn" data-act="mkPass">I'm done shopping</button></div></div>`;
  const rules = st.cat.rules, mx = maxExtra(S, b.min), extra = Math.min(ui().bidExtra, mx);
  const w = S.market.odds, avg = w.reduce((a, c) => a + c, 0) / w.length, mine = w[me.teamId] / avg;
  const canAfford = me.coins >= b.min;
  let head = "";
  if (b.sel.kind === "p") head = `<div class="row" style="align-items:flex-start;gap:14px">${card(b.sel.id, { size: "md" })}<div class="grow col" style="gap:8px"><div><b>Contract</b><div class="row mt" style="gap:6px">${[1, 2, 3].map((l) => `<button class="btn sm ${ui().bidLen === l ? "on" : ""}" data-act="mkLen" data-len="${l}">${l} season${l > 1 ? "s" : ""}<br>${feeOf(b.p, l)}</button>`).join("")}</div></div>
      <div class="small mute">Market value ${b.p.mv}. Minimum offer for ${ui().bidLen} season${ui().bidLen > 1 ? "s" : ""}: <b>${b.min}</b>. One-off fee, no wages. Only the winner pays.</div></div></div>`;
  else head = `<div class="row" style="align-items:flex-start;gap:14px">${itemCard(b.it)}<div class="grow small mute">Price <b>${b.it.price}</b>. ${b.it.supply != null ? "Only one exists in the lobby, so it goes to a draw." : ""}</div></div>`;
  return `<div class="card"><h3>Your bid</h3>${head}
    <div class="mt"><b>Extra coins</b> <span class="mute small">(raise your odds if others want him too)</span>
      <div class="row mt"><input type="range" class="grow" min="0" max="${mx}" step="5" value="${extra}" data-input="mkExtraLive" data-change="mkExtra" ${locked ? "disabled" : ""}><span class="b" id="extraOut">${extra}</span></div>
      <div class="small mute">Tickets <b id="oddsOut">×${(1 + extra / b.min).toFixed(2)}</b> · underdog bonus ×${mine.toFixed(2)} vs the average team${mx < Math.floor(b.min * rules.extraCap) ? " · limited by your coins" : ""}</div></div>
    <div class="row mt"><span>Total if you win: <span class="coin">${b.min + extra}<i></i></span></span><div class="grow"></div>
      ${locked ? `<button class="btn" data-act="mkUnlock">Change bid</button>` : `<button class="btn pri" data-act="mkLock" ${canAfford ? "" : "disabled"}>${canAfford ? "Lock bid" : "Can't afford"}</button>`}
      <button class="btn ghost" data-act="mkPass">I'm done</button></div></div>`;
}

function itemShop(S) {
  const ord = st.cat.items.filter((i) => i.supply == null), fin = st.cat.items.filter((i) => i.supply != null);
  const owned = S.me.items || {};
  return `<div class="mt"><h3>Buy now</h3><div class="hand" style="justify-content:flex-start">${ord.map((i) => `<div class="col" style="gap:6px;width:170px">${itemCard(i)}<button class="btn sm" data-act="buyItem" data-id="${i.id}" ${S.me.coins < i.price ? "disabled" : ""}>Buy · ${i.price}${owned[i.id] ? ` (have ${owned[i.id]})` : ""}</button></div>`).join("")}</div>
    <h3 class="mt2">Limited — goes to a draw</h3><div class="hand" style="justify-content:flex-start">${fin.map((i) => {
      const left = (S.market.supply[i.id] ?? i.supply); return `<div class="col" style="gap:6px;width:170px">${itemCard(i, { cls: left ? "pickable" : "dim" })}<button class="btn sm" data-act="mkSelect" data-kind="i" data-id="${i.id}" ${left ? "" : "disabled"}>${left ? "Bid · " + i.price : "Sold"}</button></div>`; }).join("")}</div></div>`;
}

function reveal(S) {
  const R = S.reveal, me = S.me;
  const lost = me && S.reveal.bidders.find((b) => b.team === me.teamId) && !R.wins.find((w) => w.team === me.teamId);
  const what = (w) => (w.kind === "p" ? miniPlayer(w.id) : `<span class="pill">${esc(st.items[w.id].name)}</span>`);
  return `<div class="card"><h3>Market round ${R.round + 1} results</h3>
    ${lost ? `<p class="pill warn" style="margin-bottom:10px">Your bid did not win the draw. You keep your coins.</p>` : ""}
    ${R.wins.length ? `<div class="reveal-row">${R.wins.map((w) => `${chip(team(w.team), 20, true)}<span>${what(w)} <span class="mute small">${w.kind === "p" ? w.len + " season" + (w.len > 1 ? "s" : "") + " · " : ""}${Math.round(w.paid)} coins${w.contested > 1 ? ` · won a draw against ${w.contested - 1}` : ""}</span></span>`).join("")}</div>` : `<p class="mute">Nobody signed anyone this round.</p>`}</div>`;
}

function allSquads(S) {
  return `<div class="card"><h3>Squads for the season</h3><div class="grid2">${S.teams.map((t) => `<div class="card" style="padding:10px"><div class="row" style="justify-content:space-between">${chip(t, 22, true)}</div><div class="col mt" style="gap:3px">${t.players.map((id) => miniPlayer(id)).join("")}</div></div>`).join("")}</div></div>`;
}

export function marketView(S, ctx) {
  const me = S.me; let main = "";
  const side = squadCardWithContracts(S) + ctx.teamsList(S) + ctx.chatCard(S);
  if (S.step === "market.bid") {
    if (!me) main = `<div class="card c"><h3>Market round ${S.market.round + 1}</h3><p style="font-size:22px;font-weight:800">${S.market.locked.length} bids locked in</p></div>`;
    else {
      const tab = ui().mkTab;
      main = `<div class="card"><div class="row wrap"><h3 style="margin:0">Free-agent market · round ${S.market.round + 1}/${S.market.total}</h3><div class="grow"></div><span>Coins ${coins(me.coins)}</span><span class="pill">${S.teams[me.teamId].players.length}/${st.cat.rules.rosterMax} players</span></div>
        <p class="small mute mt">Every target has a market value. Offer at least that (more for a longer contract) to enter the draw. Teams with weaker squads get better odds, and extra coins buy extra tickets. Only the winner pays.</p>
        <div class="row mt" style="gap:6px"><button class="btn sm ${tab === "players" ? "on" : ""}" data-act="mkTab" data-tab="players">Players</button><button class="btn sm ${tab === "items" ? "on" : ""}" data-act="mkTab" data-tab="items">Items</button></div>
        ${tab === "players" ? poolList(S) : itemShop(S)}</div>${bidPanel(S)}`;
    }
  } else if (S.step === "market.reveal") main = reveal(S);
  else main = allSquads(S);
  return { main, side };
}

function squadCardWithContracts(S) {
  const me = S.me; if (!me) return "";
  const t = team(me.teamId), items = Object.entries(me.items || {});
  return `<div class="card"><h3>Your squad (${t.players.length}/${st.cat.rules.rosterMax})</h3><div class="col" style="gap:5px">${t.players.map((id) => { const p = pl(id); return miniPlayer(id, `<span class="mute tiny">${p.contract}y</span>`); }).join("") || `<span class="mute small">Nobody yet.</span>`}</div>
    ${items.length ? `<h3 class="mt">Items</h3><div class="col" style="gap:4px">${items.map(([id, n]) => `<div class="small"><b>${esc(st.items[id].name)}</b> <span class="mute">${n} use${n > 1 ? "s" : ""}</span></div>`).join("")}</div>` : ""}</div>`;
}
