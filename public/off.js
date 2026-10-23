// Off-season screens: retirements, development, re-signing, rookie draft, trade window.
import { st, $, esc, send, team, chip, card, pl, miniPlayer, tierOf, flag, coins, crest } from "./core.js";

const POT = { low: "Low potential", med: "Medium potential", high: "High potential" };
const base = (id) => st.idx[id];
const plain = (id) => { const p = pl(id); return p ? `${esc(p.name)} <span class="mute small">${p.pos} · ${p.ovr}</span>` : "?"; };

// ---------- handlers ----------
const tr = () => (st.ui.tr = st.ui.tr || { to: null, give: [], get: [], gc: 0, rc: 0 });
export const offHandlers = {
  resign(a) { send({ t: "resign", id: +a.id, len: +a.len }); },
  offDone() { send({ t: "ready", on: !st.S.teams[st.S.me.teamId].ready }); },
  rkSel(a) { st.ui.rk = +a.id; st.render(); },
  rkPick() { if (st.ui.rk != null) { send({ t: "rookie", id: st.ui.rk }); st.ui.rk = null; } },
  trTo(a) { const T = tr(); T.to = a.value === "" ? null : +a.value; T.get = []; st.render(); },
  trToggle(a) { const T = tr(), list = a.side === "give" ? T.give : T.get, key = a.k + ":" + a.id; const i = list.indexOf(key); if (i >= 0) list.splice(i, 1); else list.push(key); st.render(); },
  trCoins(a) { const T = tr(); const n = Math.max(0, Math.floor(+a.value || 0)); if (a.side === "give") T.gc = n; else T.rc = n; },
  trSend() {
    const T = tr(); if (T.to == null) return;
    const mk = (list, coin) => [...list.map((s) => { const [k, ...r] = s.split(":"); const id = r.join(":"); return k === "p" ? { k, id: +id } : { k, id }; }), ...(coin > 0 ? [{ k: "c", amt: coin }] : [])];
    send({ t: "tradeOffer", to: T.to, give: mk(T.give, T.gc), get: mk(T.get, T.rc) });
    st.ui.tr = { to: T.to, give: [], get: [], gc: 0, rc: 0 };
  },
  trYes(a) { send({ t: "tradeRespond", id: +a.id, accept: true }); },
  trNo(a) { send({ t: "tradeRespond", id: +a.id, accept: false }); },
  trCancel(a) { send({ t: "tradeCancel", id: +a.id }); },
};

// ---------- pages ----------
function retirePage(S) {
  const R = S.reveal, me = S.me ? S.me.teamId : -1;
  const mine = R.list.filter((r) => r.team === me), rest = R.list.filter((r) => r.team !== me);
  const row = (r) => { const b = base(r.id); const t = r.team != null ? team(r.team) : null; return `<tr class="${r.team === me ? "me" : ""}"><td><b>${esc(b.name)}</b> <span class="mute small">${b.pos} ${flag(b.nat)}</span></td><td class="n">${r.age}</td><td>${t ? chip(t, 16) : `<span class="mute small">free agent</span>`}</td><td>${r.forced ? `<span class="pill warn">certain</span>` : ""}</td></tr>`; };
  return `<div class="card"><h3>Retirements · end of season ${R.season}</h3>
    ${me >= 0 ? (mine.length ? `<p class="pill bad" style="margin-bottom:10px">${mine.length} of your players retire. Their contracts end with no refund.</p>` : `<p class="pill good" style="margin-bottom:10px">Nobody from your squad retires.</p>`) : ""}
    <table class="tb"><tr><th>Player</th><th class="n">Age</th><th>Was at</th><th></th></tr>${[...mine, ...rest].map(row).join("") || `<tr><td colspan="4" class="mute">Nobody retires this year.</td></tr>`}</table></div>`;
}
function agePage(S) {
  const R = S.reveal, me = S.me ? S.me.teamId : -1, moves = R.moves.map((m) => ({ ...m, d: m.to - m.from, p: pl(m.id) })).filter((m) => m.p);
  const mine = moves.filter((m) => m.p.team === me).sort((a, b) => b.p.ovr - a.p.ovr);
  const arrow = (m) => `<span class="${m.d > 0 ? "good" : m.d < 0 ? "bad" : "mute"} b" style="color:var(--${m.d > 0 ? "good" : m.d < 0 ? "bad" : "mute"})">${m.d > 0 ? "▲" : m.d < 0 ? "▼" : "•"} ${m.d > 0 ? "+" : ""}${m.d}</span>`;
  const list = (arr) => arr.map((m) => `<div class="row" style="justify-content:space-between;padding:3px 0">${miniPlayer(m.id)}<span>${m.from} → <b>${m.to}</b> ${arrow(m)}</span></div>`).join("");
  const up = moves.slice().sort((a, b) => b.d - a.d).slice(0, 6), down = moves.slice().sort((a, b) => a.d - b.d).slice(0, 6);
  return `<div class="card"><h3>Development · everyone is a year older</h3>
    ${me >= 0 ? `<h3 class="mt">Your squad</h3>${list(mine) || `<span class="mute">No squad.</span>`}` : ""}
    <div class="grid2 mt"><div><h3>Biggest risers</h3>${list(up)}</div><div><h3>Biggest falls</h3>${list(down)}</div></div></div>`;
}
function resignPage(S) {
  const me = S.me;
  if (!me) return `<div class="card c"><h3>Re-signing window</h3><p class="mute">Managers are deciding who to keep.</p></div>`;
  const list = me.resign || [];
  const rows = list.map((r) => { const p = pl(r.id); return `<div class="card" style="padding:10px"><div class="row wrap" style="gap:14px">${card(r.id, { size: "sm" })}<div class="grow col" style="gap:6px"><div><b>${esc(p.name)}</b> <span class="mute small">${p.pos} · ${p.age}y · market value ${p.mv}</span></div>
      <div class="row wrap" style="gap:6px">${r.fees.map((f, i) => `<button class="btn sm" data-act="resign" data-id="${r.id}" data-len="${i + 1}" ${me.coins < f ? "disabled" : ""}>${i + 1} season${i ? "s" : ""} · ${f}</button>`).join("")}</div><span class="small mute">Not re-signed = he walks into the free-agent pool.</span></div></div></div>`; }).join("");
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Re-signing window</h3><div class="grow"></div><span>Coins ${coins(me.coins)}</span><button class="btn pri" data-act="offDone">${S.teams[me.teamId].ready ? "Not done" : "Done"}</button></div>
    <p class="small mute mt">These contracts have run out. Re-sign at market value (longer = pricier), no draw. Everyone you let go joins free agency, where anyone can bid for them.</p></div>
    ${rows || `<div class="card c"><p class="mute">None of your contracts expire this year.</p></div>`}`;
}
function resignReveal(S) {
  const R = S.reveal, me = S.me ? S.me.teamId : -1;
  const byTeam = (list) => { const m = new Map(); for (const x of list) { if (!m.has(x.team)) m.set(x.team, []); m.get(x.team).push(x); } return [...m.entries()].sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : a[0] - b[0])); };
  const sg = byTeam(R.signed), rl = byTeam(R.released);
  return `<div class="grid2"><div class="card"><h3>Re-signed</h3>${sg.map(([t, xs]) => `<div class="mt">${chip(team(t), 18, true)}<div class="col mt" style="gap:3px">${xs.map((x) => miniPlayer(x.id, `<span class="mute tiny">${x.len}y</span>`)).join("")}</div></div>`).join("") || `<p class="mute">Nobody was re-signed.</p>`}</div>
    <div class="card"><h3>Released to free agency</h3>${rl.map(([t, xs]) => `<div class="mt">${chip(team(t), 18, true)}<div class="col mt" style="gap:3px">${xs.map((x) => miniPlayer(x.id)).join("")}</div></div>`).join("") || `<p class="mute">Nobody was released.</p>`}</div></div>`;
}
function rookiePage(S) {
  const RK = S.rookies, me = S.me, myTurn = me && me.myTurn;
  const cur = RK.order[RK.idx] != null ? team(RK.order[RK.idx]) : null;
  const sel = st.ui.rk;
  const avail = RK.avail.map((id) => pl(id)).sort((a, b) => b.ovr - a.ovr);
  const order = `<div class="row wrap" style="gap:6px">${RK.order.map((ti, i) => { const pk = RK.picks[i]; return `<span class="pill ${i === RK.idx ? "acc" : ""}" title="${esc(team(ti).name)}">${i + 1}. ${crest(team(ti), 14)} ${pk && pk.id != null ? esc(pl(pk.id).name.split(" ").slice(-1)[0]) : ""}</span>`; }).join("")}</div>`;
  const head = myTurn ? `<p class="pill good" style="margin-bottom:8px">Your pick. Choose a rookie and press Draft.</p>` : `<p class="mute small" style="margin-bottom:8px">${cur ? esc(cur.name) + " is on the clock." : "Draft complete."} Rookies come on a 3-season deal with no fee. Potential decides how much they tend to grow.</p>`;
  return `<div class="card"><h3>Rookie draft · new intake</h3>${head}${order}</div>
    <div class="card"><div class="row wrap"><h3 style="margin:0">Available rookies (${avail.length})</h3><div class="grow"></div><button class="btn pri" data-act="rkPick" ${myTurn && sel != null ? "" : "disabled"}>Draft${sel != null ? " " + esc(pl(sel).name.split(" ").slice(-1)[0]) : ""}</button></div>
    <div class="hand mt" style="justify-content:flex-start;gap:10px">${avail.map((p) => `<div data-act="rkSel" data-id="${p.id}">${card(p.id, { size: "md", tag: POT[p.pot] || "", cls: "pickable" + (sel === p.id ? " chosen" : "") })}</div>`).join("")}</div></div>`;
}
function rookieReveal(S) {
  const R = S.reveal;
  return `<div class="card"><h3>Rookie draft results</h3><div class="reveal-row">${R.picks.map((p) => `${chip(team(p.team), 20, true)}<span>${p.id != null ? miniPlayer(p.id, `<span class="mute tiny">${esc(POT[pl(p.id).pot] || "")}</span>`) : `<span class="mute">no pick</span>`}</span>`).join("")}</div><p class="small mute mt">Undrafted rookies go to the free-agent pool.</p></div>`;
}

// ---------- trade window ----------
function assetText(a) { return a.k === "p" ? plain(a.id) : a.k === "i" ? esc(st.items[a.id]?.name || a.id) : `<span class="coin">${a.amt}<i></i></span>`; }
function tradePage(S) {
  const me = S.me;
  if (!me) return `<div class="card"><h3>Trade window</h3><p class="mute">Managers are trading.</p>${(S.tradeLog || []).map((l) => `<div class="small mt">${esc(team(l.from).name)} ⇄ ${esc(team(l.to).name)}</div>`).join("")}</div>`;
  const T = tr(), mt = team(me.teamId), ready = mt.ready;
  const others = S.teams.filter((t) => t.id !== me.teamId);
  const them = T.to != null ? team(T.to) : null;
  const chk = (side, k, id, label) => { const on = (side === "give" ? T.give : T.get).includes(k + ":" + id); return `<label class="row small" style="cursor:pointer;gap:8px"><input type="checkbox" ${on ? "checked" : ""} data-change="trToggle" data-side="${side}" data-k="${k}" data-id="${esc(id)}"> ${label}</label>`; };
  const myItems = Object.keys(me.items || {}).filter((i) => me.items[i] > 0);
  const theirItems = them ? Object.keys(them.items || {}).filter((i) => them.items[i] > 0) : [];
  const builder = `<div class="card"><h3>Make an offer</h3>
    <div class="row wrap"><span class="small">Trade with</span><select data-change="trTo"><option value="">Choose a team…</option>${others.map((t) => `<option value="${t.id}" ${T.to === t.id ? "selected" : ""}>${esc(t.name)}${t.human ? " (" + esc(t.owner || "") + ")" : ""}</option>`).join("")}</select></div>
    <div class="grid2 mt"><div><b>You give</b><div class="col mt" style="gap:4px">${mt.players.map((id) => chk("give", "p", id, plain(id))).join("")}${myItems.map((i) => chk("give", "i", i, esc(st.items[i].name) + ` <span class="mute">(${me.items[i]} left)</span>`)).join("")}
      <label class="row small">Coins <input id="giveCoins" type="number" min="0" max="${Math.floor(me.coins)}" value="${T.gc || ""}" placeholder="0" style="width:90px" data-input="trCoins" data-side="give"></label></div></div>
    <div><b>You get</b>${them ? `<div class="col mt" style="gap:4px">${them.players.map((id) => chk("get", "p", id, plain(id))).join("")}${theirItems.map((i) => chk("get", "i", i, esc(st.items[i]?.name || i))).join("")}<label class="row small">Coins <input id="getCoins" type="number" min="0" value="${T.rc || ""}" placeholder="0" style="width:90px" data-input="trCoins" data-side="get"></label></div>` : `<p class="mute small mt">Choose a team first.</p>`}</div></div>
    <div class="row mt"><span class="small mute">Up to ${me.trade ? me.trade.max : 6} assets per side. CPU managers answer at once; they want to come out ahead.</span><div class="grow"></div><button class="btn pri" data-act="trSend" ${them && (T.give.length + T.get.length + (T.gc > 0) + (T.rc > 0)) ? "" : "disabled"}>Send offer</button></div></div>`;
  const offers = (me.trade ? me.trade.offers : []).slice().reverse().map((o) => {
    const incoming = o.to === me.teamId, other = team(incoming ? o.from : o.to);
    const theyGive = incoming ? o.give : o.get, youGive = incoming ? o.get : o.give;
    return `<div class="card" style="padding:10px"><div class="row" style="justify-content:space-between"><span>${incoming ? "From" : "To"} ${chip(other, 18, true)}</span><span class="pill ${o.status === "accepted" ? "good" : o.status === "open" ? "acc" : "bad"}">${o.status}</span></div>
      <div class="small mt"><b>You get:</b> ${theyGive.map(assetText).join(", ") || "—"}<br><b>You give:</b> ${youGive.map(assetText).join(", ") || "—"}</div>${o.why ? `<div class="small mute">${esc(o.why)}</div>` : ""}
      ${o.status === "open" ? `<div class="row mt">${incoming ? `<button class="btn sm pri" data-act="trYes" data-id="${o.id}">Accept</button><button class="btn sm" data-act="trNo" data-id="${o.id}">Decline</button>` : `<button class="btn sm" data-act="trCancel" data-id="${o.id}">Cancel</button>`}</div>` : ""}</div>`;
  }).join("");
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Trade window</h3><div class="grow"></div><span>Coins ${coins(me.coins)}</span><button class="btn ${ready ? "" : "pri"}" data-act="offDone">${ready ? "Keep trading" : "I'm done trading"}</button></div></div>${builder}<div class="col">${offers || ""}</div>`;
}

export function offView(S, ctx) {
  let main = "";
  switch (S.step) {
    case "off.retire": main = retirePage(S); break;
    case "off.age": main = agePage(S); break;
    case "off.resign": main = resignPage(S); break;
    case "off.resign.reveal": main = resignReveal(S); break;
    case "off.rookie.turn": main = rookiePage(S); break;
    case "off.rookie.reveal": main = rookieReveal(S); break;
    case "off.trade": main = tradePage(S); break;
    default: main = `<div class="card">…</div>`;
  }
  let squad = "";
  if (S.me) {
    const t = team(S.me.teamId);
    squad = `<div class="card"><h3>Your squad (${t.players.length}/${t.cap})</h3><div class="col" style="gap:5px">${t.players.map((id) => { const p = pl(id); return miniPlayer(id, `<span class="mute tiny">${p.contract}y</span>`); }).join("") || `<span class="mute small">Nobody.</span>`}</div></div>`;
  }
  return { main, side: squad + ctx.teamsList(S) + ctx.chatCard(S) };
}
