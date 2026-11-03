// Footballer relationships: your partner, asking other footballers out, going exclusive, thrupples, weddings as events,
// answering online beef, and the ceremony popup everybody sees.
import { st, $, esc, send, toast, coins, faceOf, initials } from "./core.js";

const ui = () => st.ui;
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// A face: a footballer's own portrait, or the picture of a listed person.
function face(x, size = 48) {
  if (x && x.img != null && x.pid != null) return `<span class="relface" style="width:${size}px;height:${size}px">${faceOf(x.img, size, x.g)}</span>`;
  const u = x && st.cat.art && st.cat.art.partners && st.cat.art.partners[x.npc || x.id];
  return u ? `<img class="relface" src="${esc(u)}" alt="" width="${size}" height="${size}">` : `<span class="relface ini" style="width:${size}px;height:${size}px;--h:${hue((x && (x.id || x.npc || x.name)) || "?")}">${esc(initials((x && x.name) || "?").toUpperCase())}</span>`;
}
const lfOf = () => st.S && st.S.pm && st.S.pm.life;

export const romHandlers = {
  romAsk(a) { send({ t: "romAsk", to: +a.to, kind: a.kind }); },
  romYes(a) { send({ t: "romReply", id: +a.id, yes: true }); },
  romNo(a) { send({ t: "romReply", id: +a.id, yes: false }); },
  exclAsk() { send({ t: "exclAsk" }); },
  breakUp() { if (!ui().confirmBreak) { ui().confirmBreak = true; return st.render(); } ui().confirmBreak = false; send({ t: "breakUp" }); },
  breakKeep() { ui().confirmBreak = false; st.render(); },
  thrLeave() { send({ t: "thrLeave" }); },
  revealLoyal(a) { send({ t: "revealLoyal", id: a.id }); },
  wedTier(a) { (ui().wed = ui().wed || {}).tier = a.id; st.render(); },
  wedDay(a) { (ui().wed = ui().wed || {}).day = +a.day; st.render(); },
  wedGuest(a) { const w = (ui().wed = ui().wed || {}); w.guests = w.guests || []; const i = w.guests.indexOf(a.pub); if (i >= 0) w.guests.splice(i, 1); else w.guests.push(a.pub); st.render(); },
  wedBook() {
    const R = lfOf() && lfOf().rom, w = ui().wed || {};
    if (!R) return;
    const tier = w.tier || R.tiers[0].id, day = w.day != null ? w.day : R.days[0];
    if (day == null) return toast("No matchday left this season to hold it on.");
    send({ t: "wedPlan", tier, day, guests: w.guests || [] }); ui().wed = null; ui().wedEdit = false;
  },
  wedCancel() { send({ t: "wedCancel" }); },
  wedAgree() { send({ t: "wedAgree", yes: true }); ui().wedEdit = false; },
  wedNo() { send({ t: "wedAgree", yes: false }); ui().wedEdit = false; },
  wedWithdraw() { send({ t: "wedWithdraw" }); },
  wedEdit() { const R = lfOf() && lfOf().rom, pl = R && R.wed && R.wed.plan; if (pl) ui().wed = { tier: pl.tier, day: pl.day, guests: (pl.guests || []).map((g) => g.pub) }; ui().wedEdit = true; st.render(); },
  wedEditBack() { ui().wedEdit = false; st.render(); },
  propose() { if (!ui().confirmProp) { ui().confirmProp = true; return st.render(); } ui().confirmProp = false; send({ t: "propose" }); },
  propKeep() { ui().confirmProp = false; st.render(); },
  affairEnd() { send({ t: "affairEnd" }); },
  affairPublic() { if (!ui().confirmPublic) { ui().confirmPublic = true; return st.render(); } ui().confirmPublic = false; send({ t: "affairPublic" }); },
  affairKeep() { ui().confirmPublic = false; st.render(); },
  divorce() { if (!ui().confirmDivorce) { ui().confirmDivorce = true; return st.render(); } ui().confirmDivorce = false; send({ t: "divorce" }); },
  divorceKeep() { ui().confirmDivorce = false; st.render(); },
  beefReply(a) { send({ t: "beefReply", mode: a.mode }); },
  cerClose() { closeCeremony(); },
};

const BEEF = [["high", "🕊️", "High road", "Calm and classy. A few new fans."], ["funny", "😂", "Funny comeback", "Good for followers. Small chance of a grudge."], ["petty", "🙄", "Petty reply", "Lots of likes. They may hold a grudge."], ["rude", "🔥", "Roast them", "Huge reach. They will not forget it."], ["ignore", "🙈", "Ignore it", "Say nothing. Nothing happens."]];
const KIND_TXT = { date: "asks you out on a date", excl: "asks you to go exclusive", thr: "asks to be in a thrupple", wed: "asks you to marry them" };

function beefCard(R) {
  const b = R.beef; if (!b) return R.beefLast && R.beefLast.feud ? "" : "";
  return `<div class="relbox beef"><div class="row wrap" style="gap:8px"><b>🤡 ${esc(b.teamName)} are trolling you online</b></div>
    <p class="small mute" style="margin:4px 0 8px">${esc(b.text)}</p>
    <div class="row wrap" style="gap:6px">${BEEF.map(([k, e, n, t]) => `<button class="btn sm ${k === "rude" ? "bad" : ""}" data-act="beefReply" data-mode="${k}" title="${esc(t)}">${e} ${esc(n)}</button>`).join("")}</div>
    <div class="tiny mute mt">Petty or rude replies can turn ${esc(b.teamName)} into your rivals (rivalry graphics when you play them). Any reply except ignoring it is announced to the whole lobby.</div></div>`;
}
function feudLine(R, S) {
  const ts = (R.feuds || []).map((f) => (S.teams || [])[f.team]).filter(Boolean);
  return ts.length ? `<div class="small mt">🔥 Rivals: ${ts.map((t) => `<b>${esc(t.name)}</b>`).join(", ")}</div>` : "";
}
function requestsIn(R) {
  if (!R.incoming.length) return "";
  return R.incoming.map((r) => `<div class="relbox req">${face(r.who, 40)}<div class="grow"><b>${esc(r.who.name)}</b> ${KIND_TXT[r.kind] || "asks you something"}${r.kind === "thr" && r.mate ? ` with ${esc(r.mate)}` : ""}.${r.kind === "date" ? `<div class="tiny mute">They pay${r.cost ? ` ${r.cost} coins` : ""}. You go for free.</div>` : ""}</div>
    <button class="btn sm pri" data-act="romYes" data-id="${r.id}">Yes</button><button class="btn sm" data-act="romNo" data-id="${r.id}">No</button></div>`).join("");
}
function partnerBox(R, lf) {
  const q = R.partner;
  if (!q) return `<div class="relbox"><b>No partner yet</b><div class="small mute">Go on a date in "Your week" above. After ${R.exclDates} dates (${R.exclGood} of them good ones) you can ask them to go exclusive.</div></div>`;
  const status = lf.married ? "💍 Married" : R.wed ? "💍 Engaged" : q.excl ? "💞 Exclusive" : "❤ Dating";
  const tier = q.avg >= 75 ? "great" : q.avg >= 55 ? "good" : "shaky";
  const loy = q.human != null ? "" : q.loyalty ? `<span class="pill ${q.loyalty.n >= 60 ? "good" : q.loyalty.n < 40 ? "bad" : ""}" title="Hidden until you know them. Low loyalty can mean they cheat.">Loyalty ${q.loyalty.n} · ${esc(q.loyalty.word)}</span>` : q.canReveal ? `<button class="btn sm" data-act="revealLoyal" data-id="${esc(q.id)}">🔎 Find out how loyal they are</button>` : `<span class="pill" title="You find out after ${q.revealAt} dates">Loyalty ???</span>`;
  const actions = [];
  if (!q.human && !q.excl && !lf.married) actions.push(`<button class="btn sm pri" data-act="exclAsk" ${q.canExcl && R.open ? "" : "disabled"} title="${esc(q.canExcl ? "Depends on how the dates went and how loyal they are." : q.exclWhy)}">💞 Ask to go exclusive</button>${!q.canExcl && q.exclWhy ? `<span class="tiny mute">${esc(q.exclWhy)}</span>` : ""}`);
  if (q.prop && !R.wed) actions.push(ui().confirmProp ? `<span class="small">Propose to ${esc(q.name)}? Your chances look <b>${esc(q.prop.odds || "")}</b>. If it goes wrong they may leave.</span><button class="btn sm pri" data-act="propose">Yes, propose</button><button class="btn sm" data-act="propKeep">Not yet</button>` : `<button class="btn sm pri" data-act="propose" ${q.prop.can && R.open ? "" : "disabled"} title="${esc(q.prop.can ? "The answer depends on how the relationship has been going." : q.prop.why)}">💍 Propose</button><span class="tiny mute">${q.prop.can ? `Chances look ${esc(q.prop.odds)}` : esc(q.prop.why)}</span>`);
  if (lf.married) actions.push(ui().confirmDivorce ? `<span class="small">File for divorce from ${esc(q.name)}? ${q.human != null ? "" : "No settlement if you are the one filing."}</span><button class="btn sm bad" data-act="divorce">Yes, divorce</button><button class="btn sm" data-act="divorceKeep">Stay married</button>` : `<button class="btn sm ghost" data-act="divorce">File for divorce</button>`);
  if (q.excl && !lf.married) actions.push(ui().confirmBreak ? `<span class="small">Really end it with ${esc(q.name)}?</span><button class="btn sm bad" data-act="breakUp">Yes, break up</button><button class="btn sm" data-act="breakKeep">Stay together</button>` : `<button class="btn sm ghost" data-act="breakUp" ${R.open ? "" : "disabled"}>Break up</button>`);
  return `<div class="relbox partner">${face(q, 58)}<div class="grow"><div class="row wrap" style="gap:8px"><b>${esc(q.name)}</b><span class="pill">${status}</span>${loy}</div>
    <div class="small mute mt">${q.dates} date${q.dates === 1 ? "" : "s"} · ${q.good} good · <span class="rq ${tier}">dates going ${tier === "great" ? "great" : tier === "good" ? "well" : "shakily"}${q.n ? ` (${q.avg}%)` : ""}</span>${q.cheated ? ` · <span style="color:var(--bad)">cheated ${q.cheated}×</span>` : ""}</div>
    <div class="bondrow mt"><span class="small">Bond</span><span class="bondbar ${q.bond < 25 ? "bad" : q.bond < 40 ? "warn" : ""}"><i style="width:${Math.max(3, q.bond)}%"></i></span><b class="small">${q.bond}</b><span class="tiny ${q.bond < 40 ? "dn" : "mute"}">${esc(q.bondWord)}</span></div>
    <div class="tiny mute">${q.like ? `They enjoy ${esc(q.like)}: a week doing that counts as time together. ` : ""}${q.committed ? `Dates raise the bond. Ignore them for a few weeks and it slowly drops: ${q.human != null ? "you may drift apart" : "they may walk out, or divorce you"}.` : ""}${q.bond < 40 && q.committed ? ` <b style="color:var(--bad)">${esc(q.name)} feels ignored.</b>` : ""}</div>
    ${q.rivals && q.rivals.length ? `<div class="tiny" style="color:var(--warn,#e9b44c)">Also seeing: ${q.rivals.map(esc).join(", ")}. It makes dates awkward and going exclusive harder.</div>` : ""}
    ${actions.length ? `<div class="row wrap mt" style="gap:8px">${actions.join("")}</div>` : ""}</div></div>`;
}
// The affair: a secret second track. The danger meter is how likely the next week is to end in the papers.
function affairBox(R, lf) {
  const a = R.affair; if (!a) return "";
  const q = R.partner, tone = a.heat >= 75 ? "bad" : a.heat >= 50 ? "warn" : "";
  const pub = a.canPublic ? (ui().confirmPublic ? `<span class="small">Leave ${esc(q ? q.name : "them")} for ${esc(a.name)}? It will be in every paper.</span><button class="btn sm bad" data-act="affairPublic">Yes, go public</button><button class="btn sm" data-act="affairKeep">Not yet</button>` : `<button class="btn sm" data-act="affairPublic" ${R.open ? "" : "disabled"}>💔 Leave ${esc(q ? q.name : "them")} for ${esc(a.name)}</button>`) : "";
  return `<div class="relbox affair">${face(a, 46)}<div class="grow"><div class="row wrap" style="gap:8px"><b>🕵️ Secret: ${esc(a.name)}</b><span class="pill">${a.dates} secret date${a.dates === 1 ? "" : "s"}</span>${a.active ? "" : `<span class="pill">Over</span>`}</div>
    <div class="bondrow mt"><span class="small">Feelings</span><span class="bondbar"><i style="width:${Math.max(3, a.love)}%"></i></span><b class="small">${a.love}</b></div>
    <div class="bondrow"><span class="small" style="color:var(--bad)">Danger</span><span class="bondbar heat ${tone}"><i style="width:${Math.max(3, a.heat)}%"></i></span><b class="small">${a.heat}%</b><span class="tiny ${tone ? "dn" : "mute"}">${esc(a.word)}${a.chance ? ` · about ${a.chance}% to be caught next week` : ""}</span></div>
    <div class="tiny mute">Every secret date raises the danger, and being famous makes it worse. It cools a little each week you stay away. If you are caught the papers print it, ${q && R.partner && R.partner.committed ? `${esc(q.name)} may leave you` : "your partner may leave you"}, and the bond takes a hit${q && lf.married ? ". Married? That can mean divorce" : ""}.</div>
    <div class="row wrap mt" style="gap:8px">${a.active ? `<button class="btn sm ghost" data-act="affairEnd">End it</button>` : ""}${pub}</div></div></div>`;
}
function peopleList(R, lf, pm) {
  if (!R.people.length) return `<div class="small mute">No other footballers in this lobby.</div>`;
  const cost = lf.costs.date * R.dateMult;
  return R.people.map((o) => {
    const b = [];
    b.push(`<button class="btn sm" data-act="romAsk" data-to="${o.pid}" data-kind="date" ${o.can.date ? "" : "disabled"} title="You pay, they come free. A date with another footballer costs ${cost}.">💘 Ask on a date · −${cost}</button>`);
    if (o.mine && !o.exclWithMe) b.push(`<button class="btn sm" data-act="romAsk" data-to="${o.pid}" data-kind="excl" ${o.can.excl ? "" : "disabled"} title="${esc(o.can.excl ? "" : o.why || "Date them first")}">💞 Go exclusive</button>`);
    if (o.exclWithMe && !R.wed) b.push(`<button class="btn sm" data-act="romAsk" data-to="${o.pid}" data-kind="wed" ${o.can.wed ? "" : "disabled"} title="Needs ${R.wedDates} dates together. They have to say yes.">💍 Propose</button>`);
    if (o.can.thr) b.push(`<button class="btn sm" data-act="romAsk" data-to="${o.pid}" data-kind="thr" title="Ask to join their relationship. Their partner has a say too.">🔺 Thrupple</button>`);
    return `<div class="relrow">${face(o, 40)}<div class="grow"><b>${esc(o.name)}</b><div class="tiny mute">${esc(o.team)} · ${esc(o.rel)}${o.thr ? " · in a thrupple" : ""}</div></div><div class="row wrap" style="gap:6px;justify-content:flex-end">${b.join("")}</div></div>`;
  }).join("");
}
function planSummary(R, pl, who) {
  const t = R.tiers.find((x) => x.id === pl.tier);
  return `<div class="small"><b>${esc(t ? t.name : pl.tierName || "")}</b> · matchday ${pl.day + 1} · ${(pl.guests || []).length ? `${pl.guests.length} guest${pl.guests.length === 1 ? "" : "s"}: ${pl.guests.map((g) => esc(g.name)).join(", ")}` : "no league guests"} · ${t ? t.cost + " coins" : ""} ${who}</div>`;
}
function planner(R, pm, human, label) {
  const ui2 = ui().wed || {}, w = R.wed, tier = ui2.tier || R.tiers[0].id, day = ui2.day != null ? ui2.day : R.days[0], guests = ui2.guests || [], t = R.tiers.find((x) => x.id === tier) || R.tiers[0];
  const payerMe = !human || (w && w.organiser), pays = human ? (payerMe ? "You pay." : `${esc(R.partner ? R.partner.name : "Your partner")} pays.`) : "You pay up front.";
  return `<div class="weds mt">${R.tiers.map((x) => `<button class="wedtier ${x.id === tier ? "sel" : ""}" data-act="wedTier" data-id="${x.id}"><b>${esc(x.name)}</b><span class="tiny mute">${esc(x.text)}</span><span class="pill">${x.cost} coins</span><span class="tiny mute">+${(x.fol / 1000).toFixed(x.fol >= 10000 ? 0 : 1)}K followers</span></button>`).join("")}</div>
    <div class="small mt"><b>When?</b> ${R.days.length ? R.days.map((d) => `<button class="btn sm ${d === day ? "pri" : ""}" data-act="wedDay" data-day="${d}">MD ${d + 1}</button>`).join(" ") : `<span class="mute">No matchday left this season. Plan it next season.</span>`}</div>
    <div class="small mt"><b>Who is invited?</b> <span class="mute">Other players and managers see the invite. Everybody sees the ceremony.</span></div>
    <div class="row wrap mt" style="gap:6px">${R.guests.length ? R.guests.map((g) => `<button class="btn sm ${guests.includes(g.pub) ? "pri" : ""}" data-act="wedGuest" data-pub="${esc(g.pub)}">${guests.includes(g.pub) ? "✓ " : ""}${esc(g.name)} <span class="tiny">${g.kind === "player" ? "⚽" : "🧢"}</span></button>`).join("") : `<span class="small mute">Nobody else is in the lobby.</span>`}</div>
    <div class="row wrap mt" style="gap:10px"><button class="btn pri" data-act="wedBook" ${R.days.length && (!payerMe || pm.coins >= t.cost) ? "" : "disabled"}>${label || (human ? "Send to " + esc(R.partner ? R.partner.name : "them") : "Book it")} · ${t.cost} coins</button><span class="tiny mute">${pays} ${human ? "You both have to agree on the type, the day and the guests." : ""}</span></div>`;
}
function weddingBox(R, lf, pm) {
  const w = R.wed, human = !!(R.partner && R.partner.human != null), name = esc(R.partner ? R.partner.name : "your partner");
  if (w && w.status === "planned") {
    const t = R.tiers.find((x) => x.id === w.tier);
    return `<div class="relbox wed"><div class="row wrap" style="gap:8px"><b>💍 Wedding booked</b><span class="pill">${esc(t ? t.name : "")}</span><span class="pill">Matchday ${w.day + 1}</span></div>
      <div class="small mute mt">${(w.guests || []).length ? `${w.guests.length} guest${w.guests.length === 1 ? "" : "s"} from the league: ${(w.guests || []).map((g) => esc(g.name)).join(", ")}.` : "No league guests invited."} Everyone in the lobby gets to watch the ceremony.${human ? ` ${w.organiser ? "You paid." : `${name} paid.`}` : ""}</div>
      <button class="btn sm ghost mt" data-act="wedCancel">Call it off (half the cost goes back to whoever paid)</button></div>`;
  }
  if (w && w.status === "agreeing" && w.plan) {
    const pl = w.plan, who = w.organiser ? "· you pay" : `· ${name} pays`;
    if (pl.mine) return `<div class="relbox wed"><b>💍 Waiting for ${name} to agree</b>${planSummary(R, pl, who)}<button class="btn sm ghost mt" data-act="wedWithdraw">Take it back</button></div>`;
    if (ui().wedEdit) return `<div class="relbox wed"><b>💍 Suggest changes to ${esc(pl.byName)}'s plan</b>${planner(R, pm, true, "Send my changes")}<button class="btn sm ghost mt" data-act="wedEditBack">Back to their plan</button></div>`;
    return `<div class="relbox wed req"><b>💍 ${esc(pl.byName)} suggests this wedding</b>${planSummary(R, pl, who)}<div class="row wrap mt" style="gap:8px"><button class="btn sm pri" data-act="wedAgree">👍 Agree</button><button class="btn sm" data-act="wedEdit">✏️ Suggest changes</button><button class="btn sm ghost" data-act="wedNo">Not this one</button></div></div>`;
  }
  if (!R.canPlan) return "";
  return `<div class="relbox wed"><b>💍 ${human ? "Plan the wedding together" : "Plan the wedding"}</b> <span class="small mute">with ${name}</span>${planner(R, pm, human)}</div>`;
}

export function relPanel(S) {
  const pm = S.pm, lf = pm && pm.life, R = lf && lf.rom; if (!R) return "";
  const mine = (R.incoming || []).length, out = (R.outgoing || []).length;
  const thr = R.thr ? `<div class="relbox"><b>🔺 Thrupple</b> <span class="small">${R.thr.map(esc).join(" · ")}</span> <button class="btn sm ghost" data-act="thrLeave">Leave</button></div>` : "";
  const outs = out ? `<div class="tiny mute mt">Waiting for an answer from: ${R.outgoing.map((r) => esc(r.who.name)).join(", ")}</div>` : "";
  return `<div class="card relp"><div class="row wrap" style="gap:8px"><h3 style="margin:0">Relationships</h3>${mine ? `<span class="pill bad">${mine} request${mine === 1 ? "" : "s"}</span>` : ""}<div class="grow"></div>${R.note ? `<span class="small" style="color:var(--acc)">${esc(R.note)}</span>` : ""}</div>
    ${beefCard(R)}${requestsIn(R)}
    <div class="mt">${partnerBox(R, lf)}</div>${affairBox(R, lf)}${thr}${weddingBox(R, lf, pm)}${outs}
    <h4 class="shh mt">Other footballers</h4><div class="relist">${peopleList(R, lf, pm)}</div>${feudLine(R, S)}
    <p class="tiny mute mt">Dating a listed person is shared: if another footballer is exclusive with them, they are off everyone else's list. Going out with someone else while exclusive is a cheating scandal.</p></div>`;
}

// ---------- the ceremony everybody sees ----------
let cerEl = null, cerTimer = null;
function closeCeremony() { if (cerTimer) clearTimeout(cerTimer); cerTimer = null; if (cerEl) { cerEl.remove(); cerEl = null; } }
export function ceremonyTick(S) {
  const ev = S.ceremony; if (!ev) return;
  const fresh = Date.now() + (st.off || 0) - ev.at < 25000;
  if (ui().cerSeen === undefined) { ui().cerSeen = fresh ? ev.id - 1 : ev.id; }
  if (ev.id <= ui().cerSeen) return;
  ui().cerSeen = ev.id;
  closeCeremony();
  const a = ev.a, b = ev.b, aFace = face({ img: a.img, pid: a.pid, g: a.g, name: a.name }, 150), bFace = face(b.pid != null ? { img: b.img, pid: b.pid, g: b.g, name: b.name } : { npc: b.npc, name: b.name }, 150);
  cerEl = document.createElement("div"); cerEl.className = "cer";
  cerEl.innerHTML = `<div class="cer-in"><div class="cer-conf">${Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.35}s">${["🎉", "💐", "✨", "💍", "🎊"][i % 5]}</i>`).join("")}</div>
    <div class="cer-top">💒 A wedding in the league</div>
    <div class="cer-pair"><div class="cer-p l">${aFace}<b>${esc(a.name)}</b></div><div class="cer-heart">💍</div><div class="cer-p r">${bFace}<b>${esc(b.name)}</b></div></div>
    <div class="cer-line l1">Dearly beloved, we are gathered here for a <b>${esc(ev.tier.name.toLowerCase())}</b>…</div>
    <div class="cer-line l2">Do you take each other?</div>
    <div class="cer-line l3">“<b>I do.</b>” “<b>I do.</b>”</div>
    <div class="cer-line l4">${esc(a.name)} and ${esc(b.name)} are married! 🎉</div>
    ${ev.guests && ev.guests.length ? `<div class="cer-guests tiny">Guests: ${ev.guests.map(esc).join(", ")}</div>` : ""}
    <button class="btn sm" data-act="cerClose">Close</button></div>`;
  document.body.appendChild(cerEl);
  cerTimer = setTimeout(closeCeremony, 14000);
}
