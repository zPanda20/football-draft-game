// The social layer's screens: the manager's Social panel (inbox, public comments, promises, squad mood, story so far),
// a footballer's reaction card, the lobby style picker, news tags, and the mid-season gala.
import { st, esc, send } from "./core.js";

const ui = () => st.ui;
const TAG = { confirmed: ["Confirmed", "tg-ok"], rumour: ["Rumour", "tg-rum"], statement: ["Statement", "tg-st"], private: ["Private", "tg-pv"] };
// A small "Confirmed / Rumour / Statement" chip for a news item.
export const tagChip = (n) => (n && n.tag && TAG[n.tag] && n.tag !== "confirmed" ? `<span class="tagchip ${TAG[n.tag][1]}" title="${n.tag === "rumour" ? "Not confirmed. It may turn out to be true, or not." : "A public statement: someone said this on the record."}">${TAG[n.tag][0]}</span>` : "");

export const socialHandlers = {
  socStyle(a) { send({ t: "socStyle", style: a.id || null }); },
  socAns(a) { send({ t: "socAnswer", id: +a.id, opt: a.opt }); },
  socToggle() { ui().socOpen = !ui().socOpen; st.render(); },
  socTab(a) { ui().socTab = a.k; st.render(); },
  socKind(a) { ui().cmKind = a.value; ui().cmLine = null; st.render(); },
  socLine(a) { ui().cmLine = a.value; },
  socTarget(a) { ui().cmTarget = a.value; },
  socSay() {
    const S = st.S, c = S.social && S.social.comment, kind = ui().cmKind || "predict", lines = (c.lines || {})[kind] || [], line = ui().cmLine && lines.some((l) => l.id === ui().cmLine) ? ui().cmLine : (lines[0] || {}).id;
    if (!line) return;
    send({ t: "socComment", kind, line, target: kind === "jab" ? (ui().cmTarget != null && ui().cmTarget !== "" ? +ui().cmTarget : (c.others[0] || {}).team) : undefined });
  },
  // lobby switches (host)
  // gala
  gInvite(a) { send({ t: "gInvite", to: a.to }); },
  gAnswer(a) { send({ t: "gAnswer", id: +a.id, yes: a.yes === "1" }); },
  gWithdraw(a) { send({ t: "gWithdraw", id: +a.id }); },
  gSeat(a) { send({ t: "gSeat", target: a.value || null }); },
  gReady(a) { send({ t: "gReady", on: a.on !== "0" }); },
  gPick(a) { send({ t: "gPick", opt: a.opt }); },
  gRespond(a) { send({ t: "gRespond", id: +a.id, mode: a.mode }); },
  gInviteSel(a) { ui().gInv = a.value; },
  gInviteGo() { const v = ui().gInv || (document.getElementById("ginv") || {}).value; if (v) send({ t: "gInvite", to: v }); },
};

// ---------- lobby ----------
// The style picker and the two switches' explanation (the switches themselves live in the host's game settings).
export function styleCard(S) {
  const you = S.players.find((p) => p.you); if (!you || you.mode === "player" || !S.settings || S.settings.social === false) return "";
  const cur = (S.social && S.social.style) || (you.style || null), styles = (S.social && S.social.styles) || [
    { id: "direct", name: "Straight talker", blurb: "Hard answers cost you less trust: a refusal or a fine lands one step softer." },
    { id: "diplomat", name: "Diplomat", blurb: "Kind answers earn extra trust, and a toast or an apology at the gala is more likely to be accepted." },
    { id: "showman", name: "Showman", blurb: "The press loves you: your public statements get printed first. A broken promise costs more." }];
  return `<div class="card"><h3>Your style as a manager</h3><p class="small mute" style="margin:0 0 8px">Optional. It only changes how trust moves when you answer your players, and how the papers treat you.</p>
    <div class="row wrap" style="gap:8px">${styles.map((s) => `<button class="btn ${cur === s.id ? "pri" : ""}" data-act="socStyle" data-id="${cur === s.id ? "" : s.id}" title="${esc(s.blurb)}">${esc(s.name)}</button>`).join("")}</div>
    <div class="tiny mute mt">${cur ? esc((styles.find((s) => s.id === cur) || {}).blurb || "") : "No style chosen: everything is neutral."}</div></div>`;
}
export const lobbySwitches = (S, sel) => `<span class="small">Gala dinner</span>${sel("gala", [[1, "On"], [0, "Off"]])}<span class="small">Social events</span>${sel("social", [[1, "On"], [0, "Off"]])}`;

// ---------- the manager's Social panel ----------
function sitCard(s, open) {
  const exp = s.expires != null ? `<span class="tiny mute">Lapses after matchday ${s.expires + 1}</span>` : "";
  return `<div class="relbox sit ${s.vis === "public" ? "pub" : ""}"><div class="row wrap" style="gap:8px;justify-content:space-between"><b>${esc(s.title)}</b>${s.vis ? `<span class="pill ${s.vis === "public" ? "bad" : ""}">${s.vis === "public" ? "Public" : "Private"}</span>` : ""}</div>
    <div class="small mt">${esc(s.why || "")}</div>${s.temper ? `<div class="tiny mute">${esc(s.temper)} · trust: ${esc(s.trust || "Neutral")}</div>` : s.trust ? `<div class="tiny mute">Trust: ${esc(s.trust)}</div>` : ""}
    <div class="col mt" style="gap:6px">${(s.opts || []).map((o) => `<div class="sitopt"><button class="btn sm ${o.rec ? "pri" : ""}" data-act="socAns" data-id="${s.id}" data-opt="${esc(o.id)}" ${open && !o.no ? "" : "disabled"}>${esc(o.label)}</button><span class="tiny mute">${esc(o.preview || "")}</span></div>`).join("")}</div>${exp}</div>`;
}
const commentBox = (S, c) => {
  if (!c) return "";
  if (!c.can) return `<div class="tiny mute">${esc(c.why || "")}</div>`;
  const kind = ui().cmKind || "predict", lines = (c.lines || {})[kind] || [], line = ui().cmLine || (lines[0] || {}).id;
  const kinds = [["predict", "Predict the match"], ["jab", "Criticise a manager"], ["praise", "Praise someone"]];
  return `<div class="row wrap" style="gap:6px"><select data-change="socKind">${kinds.map(([k, l]) => `<option value="${k}" ${k === kind ? "selected" : ""}>${l}</option>`).join("")}</select>
    <select data-change="socLine">${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === line ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select>
    ${kind === "jab" ? `<select data-change="socTarget">${(c.others || []).map((o) => `<option value="${o.team}" ${String(o.team) === String(ui().cmTarget) ? "selected" : ""}>${esc(o.boss)} (${esc(o.word)}${o.said ? ", already named" : ""})</option>`).join("") || `<option value="">No other managers</option>`}</select>` : ""}
    <button class="btn sm pri" data-act="socSay" ${kind === "jab" && !(c.others || []).length ? "disabled" : ""}>Say it</button></div>
    <div class="tiny mute mt">Fixed lines only, printed under your name. ${c.left} left this season. ${kind === "predict" && c.opp ? `The prediction is about your next opponent, ${esc(c.opp.name)}, and is checked after the match.` : kind === "jab" ? "Criticising a manager gives them an inbox card to answer. Be ready for a reply." : "Praise is safe, and costs nothing."}</div>`;
};
export function socialPanel(S) {
  const sc = S.social; if (!sc || !sc.on) return "";
  const tab = ui().socTab || "now", n = sc.inbox.length;
  if (!ui().socOpen) return `<div class="card socp"><div class="row wrap" style="gap:8px;align-items:center;justify-content:space-between"><div class="row" style="gap:8px"><h3 style="margin:0">Social</h3>${n ? `<span class="pill bad">${n} need${n === 1 ? "s" : ""} you</span>` : `<span class="tiny mute">Nothing needs you</span>`}</div><button class="btn sm ${n ? "pri" : ""}" data-act="socToggle">Open</button></div></div>`;
  const tabs = [["now", `Inbox${sc.inbox.length ? ` (${sc.inbox.length})` : ""}`], ["talk", "Public comments"], ["squad", "Squad & promises"], ["story", "Story so far"]];
  let body = "";
  if (tab === "now") body = sc.inbox.length ? sc.inbox.map((s) => sitCard(s, sc.open)).join("") : `<p class="small mute">Nothing needs you. When a player asks for minutes, objects to a signing, or the dressing room hears something, it shows up here. Nothing here ever stops the match from starting.</p>`;
  else if (tab === "talk") body = commentBox(S, sc.comment) + ((sc.comment.others || []).length ? `<h4 class="shh mt">Other managers</h4>${sc.comment.others.map((o) => `<div class="tiny">${esc(o.boss)}: <b>${esc(o.word)}</b></div>`).join("")}` : "");
  else if (tab === "squad") body = `${sc.promises.length ? `<h4 class="shh">Promises</h4>${sc.promises.map((p) => `<div class="small">You promised <b>${esc(p.name)}</b> a start by matchday ${p.due}.</div>`).join("")}` : `<p class="small mute">No open promises.</p>`}
    <h4 class="shh mt">Dressing-room mood</h4>${sc.mood.length ? sc.mood.map((m) => `<div class="small"><b>${esc(m.name)}</b> <span class="tiny mute">${esc(m.pos)} ${m.ovr}${m.temper ? " · " + esc(m.temper) : ""}</span> <span class="pill ${m.t < 0 ? "bad" : "good"}">${esc(m.word)}</span></div>`).join("") : `<p class="small mute">Nobody is particularly happy or unhappy with you yet.</p>`}`;
  else body = (sc.archive || []).length ? sc.archive.map((th) => `<div class="thread"><div class="tiny mute" style="text-transform:uppercase">${esc(th.kind)} · ${th.status}</div>${th.lines.map((l) => `<div class="small ${l.priv ? "mute" : ""}">${l.priv ? "🔒 " : ""}${esc(l.text)} ${l.tag && l.tag !== "confirmed" ? `<span class="tagchip">${esc(l.tag)}</span>` : ""}<span class="tiny mute"> · S${l.season} MD${l.day + 1}</span></div>`).join("")}</div>`).join("") : `<p class="small mute">No stories yet. Private lines are only shown to the people involved.</p>`;
  const rep = sc.rep && sc.rep.words && sc.rep.words.length ? `<span class="tiny mute"> Your reputation: ${sc.rep.words.map(esc).join(", ")}</span>` : "";
  const note = sc.note ? `<div class="small mt" style="color:var(--accent,#3ddc84)">${esc(sc.note)}</div>` : "";
  return `<div class="card socp"><div class="row wrap" style="gap:8px;align-items:center"><h3 style="margin:0">Social</h3>${rep}<span class="grow"></span><button class="btn sm ghost" data-act="socToggle">Close</button></div>
    <div class="row wrap mt" style="gap:6px">${tabs.map(([k, l]) => `<button class="btn sm ${tab === k ? "pri" : ""}" data-act="socTab" data-k="${k}">${l}</button>`).join("")}</div><div class="mt">${body}</div>${note}</div>`;
}
// A footballer's cards: a manager's decision they get to react to, and where they stand with the manager.
export function playerSocial(S) {
  const sc = S.social; if (!sc || !sc.on || sc.role !== "player") return "";
  if (!sc.inbox.length && !sc.mgr) return "";
  return `<div class="card socp"><h3>Your manager</h3>${sc.mgr ? `<div class="small">${esc(sc.mgr.boss)} · trust: <b>${esc(sc.mgr.trust)}</b></div>` : ""}${sc.inbox.map((s) => sitCard(s, sc.open)).join("")}${sc.note ? `<div class="small mt">${esc(sc.note)}</div>` : ""}</div>`;
}

// ---------- the gala ----------
const KIND = { manager: "Manager", player: "Footballer", guest: "Guest" };
const tableCard = (G, mineKey) => `<div class="galatables">${(G.tables || []).map((t) => `<div class="gtable ${t.seats.some((x) => x.key === mineKey) ? "mine" : ""}"><b>Table ${t.id + 1}</b>${t.seats.map((x) => `<div class="small ${x.key === mineKey ? "you" : ""}">${x.kind === "guest" ? "💐 " : x.kind === "manager" ? "🧥 " : x.kind === "wag" ? "💅 " : "⚽ "}${esc(x.name)}${x.key === mineKey ? " (you)" : ""}</div>`).join("")}</div>`).join("")}</div>`;
export function galaScreen(S) {
  const G = S.gala, you = S.players.find((p) => p.you);
  if (!G) return { main: `<div class="card"><h3>🥂 Mid-season gala</h3><p class="small mute">The league is at the gala. The picture will be here in a moment.</p></div>`, side: "" };
  const att = (G.att || []).filter((a) => a.kind !== "guest"), people = att.map((a) => `<span class="pill ${a.you ? "good" : ""}">${a.kind === "manager" ? "🧥" : a.kind === "wag" ? "💅" : "⚽"} ${esc(a.name)}${G.status === "prep" && a.ready ? " ✓" : G.status === "live" && a.acted ? " ✓" : ""}</span>`).join(" ");
  const head = `<div class="card galahead"><div class="row wrap" style="gap:10px;align-items:center"><h3 style="margin:0">🥂 Mid-season gala</h3><span class="tiny mute">${G.status === "prep" ? "Getting ready" : G.status === "live" ? "Dinner is served" : "The morning after"}</span></div>
    <div class="row wrap mt" style="gap:6px">${people}</div>${G.attending ? "" : `<p class="small mute mt">You are watching: only guests who were here when it started are invited. Everyone sees the roundup.</p>`}
    ${G.note ? `<div class="small mt" style="color:var(--accent,#3ddc84)">${esc(G.note)}</div>` : ""}</div>`;
  let body = "";
  if (G.status === "prep") {
    if (G.attending) {
      const seat = `<div class="card"><h4 class="shh">Ask to sit with someone</h4><div class="row wrap" style="gap:6px"><select data-change="gSeat"><option value="">No preference</option>${att.filter((a) => !a.you).map((a) => `<option value="${esc(a.key)}" ${G.seatReq === a.key ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></div>
        <div class="tiny mute mt">It is only a request. The organisers honour at most ${G.seatLimit} requests for any one guest, and they like a bit of drama.</div></div>`;
      const inv = G.kind === "player" ? `<div class="card"><h4 class="shh">Bring a date</h4>${(G.invites || []).length ? G.invites.map((i) => `<div class="row wrap" style="gap:6px;justify-content:space-between"><span class="small">${i.out ? `To <b>${esc(i.who)}</b>` : `From <b>${esc(i.from)}</b>`} · ${esc(i.status)}</span>${i.out && i.status === "open" ? `<button class="btn sm" data-act="gWithdraw" data-id="${i.id}">Withdraw</button>` : ""}${!i.out && i.status === "open" ? `<span><button class="btn sm pri" data-act="gAnswer" data-id="${i.id}" data-yes="1">Yes</button> <button class="btn sm" data-act="gAnswer" data-id="${i.id}" data-yes="0">No</button></span>` : ""}</div>`).join("") : `<p class="small mute" style="margin:0">Nobody invited yet. You can have ${G.maxInvites} invitations out at once, and only one date comes.</p>`}
        <div class="row wrap mt" style="gap:6px"><select id="ginv" data-change="gInviteSel"><option value="">Choose…</option>${(G.people || []).length ? `<optgroup label="Your list">${G.people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>` : ""}${(G.humans || []).length ? `<optgroup label="Footballers">${G.humans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>` : ""}</select><button class="btn sm pri" data-act="gInviteGo">Invite</button></div>
        <div class="tiny mute mt">A listed person decides when the evening starts (rivals compete); another footballer has to say yes.</div></div>` : "";
      body = seat + inv + `<div class="card"><button class="btn ${G.ready ? "" : "pri"} big" style="width:100%" data-act="gReady" data-on="${G.ready ? "0" : "1"}">${G.ready ? "Not ready yet" : "I am ready"}</button><div class="tiny mute mt">The evening starts when everybody is ready, or when the clock runs out.</div></div>`;
    } else body = `<div class="card"><p class="small mute">Guests are choosing their dates and tables.</p></div>`;
  } else if (G.status === "live") {
    if (G.attending) {
      const prompts = (G.prompts || []).map((p) => `<div class="relbox req"><b>${esc(p.from)}</b> would like to ${esc(p.text)}.<div class="row wrap mt" style="gap:6px">${p.modes.map(([m, l], i) => `<button class="btn sm ${i === 0 ? "pri" : ""}" data-act="gRespond" data-id="${p.id}" data-mode="${m}">${esc(l)}</button>`).join("")}</div></div>`).join("");
      const opts = G.pick ? `<p class="small mute">You have made your move for the evening.</p>` : `<div class="col" style="gap:8px">${(G.options || []).map((o) => `<div class="sitopt"><button class="btn sm ${o.kind === "toast" ? "" : "pri"}" data-act="gPick" data-opt="${esc(o.id)}">${esc(o.label)}</button><span class="tiny mute">${esc(o.preview)}</span></div>`).join("")}<div class="sitopt"><button class="btn sm ghost" data-act="gPick" data-opt="pass">Just enjoy the evening</button><span class="tiny mute">Nothing happens. A perfectly good choice.</span></div></div>`;
      body = `<div class="card"><h4 class="shh">Your table${G.date ? ` · date: ${esc(G.date)}` : ""}</h4>${(G.table || []).map((x) => `<div class="small">${x.kind === "guest" ? "💐 " : x.kind === "manager" ? "🧥 " : x.kind === "wag" ? "💅 " : "⚽ "}${esc(x.name)}</div>`).join("")}</div>${prompts}<div class="card"><h4 class="shh">One thing tonight</h4>${opts}<div class="tiny mute mt">You get one main interaction. If the other person is a player they decide; if nobody answers in time, nothing happens.</div></div>`;
    } else body = `<div class="card"><h4 class="shh">Seating plan</h4>${tableCard(G, null)}</div>`;
  } else {
    body = G.roundup ? `<div class="card"><div class="fp-head" style="font-size:20px">${esc(G.roundup.head)}</div><div class="col mt" style="gap:6px">${G.roundup.lines.map((l) => `<div class="small">${l.tag === "private" ? "🔒 " : l.tag === "rumour" ? "🗞 " : "• "}${esc(l.text)} ${l.tag === "rumour" ? `<span class="tagchip tg-rum">Rumour</span>` : l.tag === "private" ? `<span class="tagchip tg-pv">Only you can see this</span>` : ""}</div>`).join("")}</div></div><div class="card"><h4 class="shh">Seating plan</h4>${tableCard(G, G.you)}</div>` : `<div class="card"><p class="small mute">The newspapers are calling people.</p></div>`;
  }
  return { main: head + body, side: "" };
}
