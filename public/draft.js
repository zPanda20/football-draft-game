// The pack draft: open a pack, choose one card, lock in; then the reveal of what everyone took.
import { st, esc, send, team, chip, card, itemCard, miniPlayer, pl, tierOf } from "./core.js";

const opened = new Set();
let animNow = false;

export const draftHandlers = {
  open(a) { opened.add(a.key); animNow = true; st.render(); animNow = false; },
  pickc(a) { send({ t: "pick", idx: +a.idx }); },
  lockc() { send({ t: "lock", on: true }); },
  unlockc() { send({ t: "lock", on: false }); },
};

const ORDER = { ruby: 3, gold: 2, silver: 1 };
function bestTier(hand) {
  let b = "silver"; for (const c of hand) if (c.t === "p") { const t = tierOf(pl(c.id).ovr); if (ORDER[t] > ORDER[b]) b = t; } return b;
}
const packLabel = (S) => (S.draft.round <= 6 ? "Players" : S.draft.round === 7 ? "Players + items" : "Items");

export function squadCard(S, title = "Your squad") {
  const me = S.me; if (!me) return "";
  const t = team(me.teamId);
  const items = Object.entries(me.items || {});
  return `<div class="card"><h3>${title} (${t.players.length})</h3><div class="col" style="gap:5px">${t.players.map((id) => miniPlayer(id)).join("") || `<span class="mute small">Nobody yet.</span>`}</div>
    ${items.length ? `<h3 class="mt">Items</h3><div class="col" style="gap:4px">${items.map(([id, n]) => `<div class="small"><b>${esc(st.items[id].name)}</b> <span class="mute">${n} use${n > 1 ? "s" : ""} left</span></div>`).join("")}</div>` : ""}</div>`;
}
function progress(S) {
  const d = S.draft; return `<div class="walk" style="width:100%;max-width:520px">${Array.from({ length: d.total }, (_, i) => `<span class="step ${i + 1 < d.round ? "done" : i + 1 === d.round ? "on" : ""}"></span>`).join("")}</div>`;
}

function cardFor(c, i, chosenIdx, locked, fresh, needGk = false) {
  const cls = `pickable ${chosenIdx === i ? "chosen" : ""} ${locked && chosenIdx === i ? "locked" : ""} ${locked && chosenIdx !== i ? "dim" : ""} ${fresh ? "flip" : ""}`;
  const style = fresh ? ` style="animation-delay:${i * 0.18}s"` : "";
  const attr = locked ? "" : `data-act="pickc" data-idx="${i}"`;
  const inner = c.t === "p" ? card(c.id, { size: "lg", cls: "" }) : itemCard(c.id, { cls: "" });
  const need = needGk && c.t === "p" && pl(c.id).pos === "GK" ? `<div class="needgk">YOUR KEEPER</div>` : "";
  return `<div class="${cls}" ${attr}${style}>${need}${inner}</div>`;
}

export function draftView(S, ctx) {
  const me = S.me, side = [];
  let main = "";
  if (S.step === "draft.intro") {
    main = `<div class="card c"><h3>The pack draft</h3><p style="font-size:20px;font-weight:800">${S.N} teams · ${S.draft?.total || 8} packs</p>
      <p class="mute mt">Each round you open a pack of five cards and keep one. Cards you leave go back in the pool; a card another manager takes is gone for good. The first pack has a headliner for everyone. Packs 1–6 are players, pack 7 mixes players and items, pack 8 is items only.</p></div>`;
  } else if (S.step === "draft.pick") {
    const d = S.draft, key = `d${d.round}`;
    if (!me) {
      main = `<div class="card c"><h3>Pack ${d.round} of ${d.total}</h3><p style="font-size:22px;font-weight:800">${d.locked.length} of ${d.humans.length} managers locked in</p></div>`;
    } else if (!opened.has(key) && !(me.pick && me.pick.locked)) {
      const tier = bestTier(me.hand);
      main = `<div class="card packarea"><h3>Pack ${d.round} of ${d.total} · ${packLabel(S)}</h3>${progress(S)}
        <div class="pack" data-act="open" data-key="${key}" style="border-color:var(--${tier === "silver" ? "silver" : tier});box-shadow:0 0 44px var(--${tier === "silver" ? "silver" : tier})">OPEN</div><p class="mute small">Tap to open. There is a timer, so don't wait too long.</p></div>`;
    } else {
      const ci = me.pick ? me.pick.idx : -1, locked = !!(me.pick && me.pick.locked);
      const needGk = d.round >= 3 && !team(me.teamId).players.some((id) => pl(id).pos === "GK") && me.hand.some((c) => c.t === "p" && pl(c.id).pos === "GK");
      main = `<div class="card packarea"><h3>Pack ${d.round} of ${d.total} · ${packLabel(S)}</h3>${progress(S)}
        ${needGk ? `<p class="warnline">You have no goalkeeper yet, and there is one in this pack. Without one an outfield player has to go in goal.</p>` : ""}
        <div class="hand">${me.hand.map((c, i) => cardFor(c, i, ci, locked, animNow, needGk)).join("")}</div>
        <div class="row">${locked ? `<button class="btn" data-act="unlockc">Change my pick</button>` : `<button class="btn pri big" data-act="lockc" ${ci < 0 ? "disabled" : ""}>Lock in</button>`}</div></div>`;
    }
  } else if (S.step === "draft.reveal") {
    const R = S.reveal; const mine = me && R.picks[me.teamId]; const fresh = st.ui.seenReveal !== R.seq; st.ui.seenReveal = R.seq;
    const cardHTML = (c) => (c ? (c.t === "p" ? miniPlayer(c.id) : `<span class="pill">${esc(st.items[c.id].name)}</span>`) : "—");
    main = `<div class="card"><h3>Pack ${R.round} results</h3>
      ${mine && mine.card ? `<div class="hand" style="margin-bottom:14px"><div class="${fresh ? "flip" : ""}">${mine.card.t === "p" ? card(mine.card.id, { size: "lg", tag: "YOURS" }) : itemCard(mine.card.id, { tag: "YOURS" })}</div></div>` : ""}
      <div class="reveal-row">${R.picks.map((p) => `${chip(team(p.team), 20, true)}<span>${cardHTML(p.card)}</span>`).join("")}</div></div>`;
  }
  side.push(squadCard(S), ctx.teamsList(S), ctx.chatCard(S));
  return { main, side: side.join("") };
}
