// WAG mode screens: the profile (lobby, draft, market), the weekly home screen, requests, people, gifts and the footballer-side list of WAGs.
// A WAG is a third way to play: no club, no squad, no wages. The server sends this person only their own record (S.wag).
import { st, $, esc, send, toast, team, crest, faceOf, SKIN, HAIRC, HAIR_NAMES } from "./core.js";

const ui = () => (st.ui.wag = st.ui.wag || {});
const you = (S) => S.players.find((p) => p.you);
export const isWagUser = (S) => { const y = you(S); return !!(y && y.mode === "wag"); };

export const wagHandlers = {
  wName(a) { send({ t: "wChar", c: { name: a.value } }); },
  wGender(a) { send({ t: "wChar", c: { gender: a.g } }); },
  wFace(a) { const y = you(st.S), w = st.S.wag || (y && y.wag) || {}, cur = String(w.img || (y && y.wchar && y.wchar.img) || "0-0-0"), p = cur.split("-").map(Number); if (a.f) return send({ t: "wChar", c: { img: a.f } }); p[+a.part] = +a.v; send({ t: "wChar", c: { img: p.slice(0, 3).join("-") } }); },
  wAuto() { send({ t: "auto", on: !(st.S.wag && st.S.wag.auto) }); },
  wPick(a) { ui().act = a.act; st.render(); },
  wFx(a) { const u = ui(); u.fx = +a.value; u.team = null; u.target = ""; st.render(); },
  wTeam(a) { const u = ui(); u.team = +a.value; u.target = ""; st.render(); },
  wTarget(a) { ui().target = a.value; },
  wPartner(a) { ui().partner = a.value; },
  wGiftTo(a) { ui().giftTo = a.value; },
  wGiftPub(a, el) { ui().giftPub = !!(el && el.checked); },
  wQuiet() { send({ t: "wAct", c: { act: "quiet" } }); },
  wContent() { send({ t: "wAct", c: { act: "content" } }); },
  wAttend() {
    const W = st.S.wag, u = ui(), fx = u.fx != null ? u.fx : (W.fixtures[0] || {}).i, f = W.fixtures.find((x) => x.i === fx); if (!f) return toast("No match to go to.");
    const tm = u.team != null && (u.team === f.a || u.team === f.b) ? u.team : f.a;
    send({ t: "wAct", c: { act: "attend", fixture: f.i, team: tm, target: u.target || null } });
  },
  wDate() { const id = ui().partner || ""; if (!id) return toast("Pick someone to invite."); send({ t: "wAct", c: { act: "date", partner: id } }); },
  wClear() { send({ t: "wClear" }); },
  wAsk(a) { send({ t: "wAsk", to: a.to, kind: a.kind || "date" }); },
  wYes(a) { send({ t: "wAnswer", id: +a.id, yes: true }); },
  wNo(a) { send({ t: "wAnswer", id: +a.id, yes: false }); },
  wGift(a) { const to = ui().giftTo; if (!to) return toast("Pick who the gift is for."); send({ t: "wGift", to, tier: a.tier, pub: !!ui().giftPub }); },
};

// ---------- profile ----------
function faceRow(label, list, part, cur) { return `<div class="facerow"><span class="small mute">${label}</span>${list.map((col, i) => `<button class="fdot ${cur === i ? "sel" : ""}" style="background:${col}" data-act="wFace" data-part="${part}" data-v="${i}" aria-label="${label} ${i + 1}"></button>`).join("")}</div>`; }
export function wagCreator(S, title = "Create your WAG") {
  const y = you(S); if (!y || y.mode !== "wag") return "";
  const w = S.wag || {}, c = { name: w.name || (y.wchar && y.wchar.name) || y.name, g: w.g || (y.wchar && y.wchar.gender) || "F", img: w.img || (y.wchar && y.wchar.img) || "0-0-0" };
  const [fs, fh, fc] = String(c.img).split("-").map(Number);
  const hair = `<div class="facerow"><span class="small mute">Hair</span>${HAIR_NAMES.map((n, i) => `<button class="btn sm ${fh === i ? "pri" : ""}" data-act="wFace" data-part="1" data-v="${i}">${n}</button>`).join("")}</div>`;
  const photos = (st.cat.faces || []).length ? `<div class="facerow"><span class="small mute">Photos</span>${st.cat.faces.map((f) => `<button class="fphoto ${c.img === "f:" + f ? "sel" : ""}" data-act="wFace" data-f="f:${esc(f)}"><img src="/assets/faces/${encodeURIComponent(f)}" alt="" width="36" height="36"></button>`).join("")}</div>` : "";
  return `<div class="card wagc"><h3>${title}</h3>
    <p class="small mute">A WAG is not a footballer: no club, no squad place, no wages. You earn from content, spend on tickets, dates and gifts, and meet people at matches.</p>
    <div class="row wrap mt" style="gap:10px"><input id="wname" maxlength="22" value="${esc(c.name)}" placeholder="Name" data-change="wName" style="flex:1;min-width:160px">
      <span class="seg"><button class="btn sm ${c.g === "F" ? "pri" : ""}" data-act="wGender" data-g="F">Woman</button><button class="btn sm ${c.g === "M" ? "pri" : ""}" data-act="wGender" data-g="M">Man</button></span></div>
    <div class="row wrap mt" style="gap:14px;align-items:flex-start"><div class="facebox">${faceOf(c.img, 92, c.g)}</div><div class="col grow" style="gap:6px;min-width:230px">${faceRow("Skin", SKIN, 0, fs)}${hair}${faceRow("Hair colour", HAIRC, 2, fc)}${photos}</div></div></div>`;
}
export function wagLate(S) {
  const y = you(S); if (!y || !y.late || S.wag) return "";
  return `<div class="card"><h3>You are joining late</h3><p class="small mute">The game is already running. Create your WAG below, then join: you can start meeting people straight away.</p><div class="row mt wrap" style="gap:8px"><button class="btn pri" data-act="lateJoin">Join the game as ${esc((y.wag && y.wag.name) || "a WAG")}</button><button class="btn" data-act="mode" data-mode="player">Join as a footballer instead</button></div></div>${wagCreator(S)}`;
}

// ---------- the home screen ----------
const tn = (S, id) => (S.teams[id] ? S.teams[id].name : "?");
const pill = (t, c = "") => `<span class="pill ${c}">${t}</span>`;
function head(S, W) {
  const sup = W.support ? `<span class="small mute">Supports <b>${esc(W.support)}</b></span>` : "";
  return `<div class="card wagh"><div class="row wrap" style="gap:14px;align-items:center"><div class="facebox">${faceOf(W.img, 64, W.g)}</div>
    <div class="grow col" style="gap:4px"><h3 style="margin:0">${esc(W.name)} <span class="tiny mute">WAG</span></h3>
      <div class="row wrap" style="gap:8px">${pill(`💰 ${W.coins} coins`)}${pill(`👥 ${W.fol.toLocaleString()} followers`)}${sup}</div></div>
    <button class="btn sm ${W.auto ? "pri" : ""}" data-act="wAuto" title="On Auto you take quiet weeks and are never waited for">${W.auto ? "Auto: on" : "Auto: off"}</button></div>
    ${W.step === "md.lineup" ? `<div class="small mute mt">Matchday ${W.next} of ${W.total}. Choose how you spend this week before kick-off.</div>` : ""}
    ${W.note ? `<div class="small mt" style="color:var(--accent,#3ddc84)">${esc(W.note)}</div>` : ""}</div>`;
}
function lastLine(W) {
  const l = W.last; if (!l) return "";
  const txt = l.act === "content" ? `You made content and earned ${l.earned} coins.` : l.act === "attend" ? "You went to the match." : l.act === "date" ? (l.failed ? "Your date did not happen." : `Your date ${l.good ? "went well" : "was awkward"}.`) : l.failed ? "Your invitation was not taken up." : "A quiet week.";
  return `<div class="small mute mt">Last matchday: ${esc(txt)}</div>`;
}
function choice(S, W) {
  if (!W.chooseOpen) return `<div class="card"><h4 class="shh">This week</h4><p class="small mute">${W.step === "md.result" ? "The matchday is over. You choose your next week when the line-up window opens." : "Choices open in the line-up window before each match."}</p>${W.attending ? `<p class="small">🎟️ You are at the ${esc(W.attending.team)} match.</p>` : ""}${lastLine(W)}</div>`;
  const u = ui(), act = W.act ? W.act.act : null, cur = (id) => (act === id ? "pri" : "");
  const fx = W.fixtures.find((x) => x.i === (u.fx != null ? u.fx : (W.act && W.act.fixture != null ? W.act.fixture : (W.fixtures[0] || {}).i))) || W.fixtures[0];
  const tm = fx ? (u.team != null && (u.team === fx.a || u.team === fx.b) ? u.team : (W.act && act === "attend" && (W.act.team === fx.a || W.act.team === fx.b) ? W.act.team : fx.a)) : null;
  const sq = fx && tm != null ? W.roster[tm] || [] : [];
  const attend = `<div class="sitopt"><div class="grow"><b>🎟️ Go to a match</b> <span class="tiny mute">${W.cost.attend} coins, paid at kick-off. After full time there is a chance to meet someone from the team you back; you can invite them from next matchday.</span>
      <div class="row wrap mt" style="gap:6px"><select data-change="wFx">${W.fixtures.map((f) => `<option value="${f.i}" ${fx && f.i === fx.i ? "selected" : ""}>${esc(f.an)} v ${esc(f.bn)}</option>`).join("")}</select>
      ${fx ? `<select data-change="wTeam"><option value="${fx.a}" ${tm === fx.a ? "selected" : ""}>Support ${esc(fx.an)}</option><option value="${fx.b}" ${tm === fx.b ? "selected" : ""}>Support ${esc(fx.bn)}</option></select>` : ""}
      <select data-change="wTarget"><option value="">Anyone</option>${sq.map((p) => `<option value="${esc(p.id)}" ${u.target === p.id ? "selected" : ""} ${p.taken ? "disabled" : ""}>${esc(p.name)} (${esc(p.pos)})${p.human ? " ★" : ""}${p.taken ? " · taken" : ""}</option>`).join("")}</select></div>
      <div class="tiny mute mt">Naming someone improves the odds a little. It is a chance, not a promise.</div></div><button class="btn ${cur("attend")}" data-act="wAttend" ${W.coins < W.cost.attend ? "disabled" : ""}>${act === "attend" ? "Going ✓" : "Go"}</button></div>`;
  const everyone = [...W.contacts.filter((c) => c.ready).map((c) => ({ id: c.id, name: c.name, tag: "contact", team: c.team })), ...W.scene.map((p) => ({ id: p.id, name: p.name, tag: "on the scene", team: p.team })), ...W.seeing.map((p) => ({ id: p.id, name: p.name, tag: `seeing · bond ${p.bond}`, team: p.team }))].filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i && !String(p.id).startsWith("u:"));
  const date = `<div class="sitopt"><div class="grow"><b>💘 Go on a date</b> <span class="tiny mute">${W.cost.date} coins, only if it happens. Others may invite the same person: the better-scored invitation wins and the rest are not charged.</span>
      <div class="row wrap mt" style="gap:6px"><select data-change="wPartner"><option value="">Choose…</option>${everyone.map((p) => `<option value="${esc(p.id)}" ${(u.partner || (W.act && W.act.partner)) === p.id ? "selected" : ""}>${esc(p.name)} · ${esc(p.tag)}${p.team ? " · " + esc(p.team) : ""}</option>`).join("")}</select></div>
      ${W.act && act === "date" && String(W.act.partner).startsWith("u:") ? `<div class="small mt">Booked with a footballer who said yes.</div>` : ""}</div><button class="btn ${cur("date")}" data-act="wDate" ${W.coins < W.cost.date ? "disabled" : ""}>${act === "date" && !String((W.act || {}).partner || "").startsWith("u:") ? "Invited ✓" : "Invite"}</button></div>`;
  const content = `<div class="sitopt"><div class="grow"><b>📸 Make content</b> <span class="tiny mute">About +${W.contentPay} coins and a few followers. ${W.contentLeft} left this season.</span></div><button class="btn ${cur("content")}" data-act="wContent" ${W.contentLeft <= 0 ? "disabled" : ""}>${act === "content" ? "Chosen ✓" : "Do it"}</button></div>`;
  const quiet = `<div class="sitopt"><div class="grow"><b>🛋️ A quiet week</b> <span class="tiny mute">Costs nothing.</span></div><button class="btn ${cur("quiet")}" data-act="wQuiet">${act === "quiet" ? "Chosen ✓" : "Stay in"}</button></div>`;
  return `<div class="card"><h4 class="shh">This week · one main thing</h4><div class="col" style="gap:10px">${attend}${date}${content}${quiet}</div>
    ${act ? `<div class="row mt" style="gap:8px;align-items:center"><span class="small">You chose: <b>${esc({ attend: "Go to a match", date: "Go on a date", content: "Make content", quiet: "A quiet week" }[act])}</b></span><button class="btn sm ghost" data-act="wClear">Change my mind</button></div>` : ""}${lastLine(W)}</div>`;
}
function requests(S, W) {
  const inc = W.incoming || [], out = W.outgoing || []; if (!inc.length && !out.length) return "";
  const what = (r) => (r.kind === "gift" ? "wants to give you a gift" : "asked you out. They pay") + ".";
  return `<div class="card"><h4 class="shh">Requests</h4>${inc.map((r) => `<div class="relbox req"><b>${esc(r.who.name)}</b> ${r.kind === "date" ? `asks you out. They pay ${r.cost} coins if you say yes.` : what(r)}<div class="row wrap mt" style="gap:6px"><button class="btn sm pri" data-act="wYes" data-id="${r.id}">Yes</button><button class="btn sm" data-act="wNo" data-id="${r.id}">No thanks</button></div></div>`).join("")}
    ${out.length ? `<div class="tiny mute mt">Waiting for an answer from: ${out.map((r) => esc(r.who.name)).join(", ")}. Requests lapse at kick-off.</div>` : ""}</div>`;
}
function people(S, W) {
  const u = ui(), open = W.chooseOpen;
  const row = (p, tag) => `<div class="row" style="gap:8px;justify-content:space-between;padding:3px 0"><span class="small"><b>${esc(p.name)}</b> <span class="mute">${esc(p.team || "")}${p.pos ? " · " + esc(p.pos) : ""}${p.ovr ? " · " + p.ovr : ""}</span> ${tag ? pill(tag) : ""}</span></div>`;
  const contacts = W.contacts.length ? W.contacts.map((c) => row(c, c.ready ? "contact" : `from matchday ${c.from + 1}`)).join("") : `<p class="small mute">No contacts yet. Go to a match and see who you meet.</p>`;
  const scene = W.scene.length ? W.scene.map((p) => row(p, "on the scene")).join("") : `<p class="small mute">Nobody on the scene.</p>`;
  const seeing = W.seeing.length ? W.seeing.map((p) => `<div class="relbox"><b>${esc(p.name)}</b> <span class="small mute">${esc(p.team || "")}${p.human ? " · a player in this room" : ""} · ${p.dates} date${p.dates === 1 ? "" : "s"} · bond ${p.bond}</span></div>`).join("") : "";
  const hum = (W.humans || []).length ? `<h4 class="shh mt">Footballers in the room</h4>${W.humans.map((h) => `<div class="row" style="gap:8px;justify-content:space-between;padding:3px 0"><span class="small"><b>${esc(h.name)}</b> <span class="mute">${esc(h.team)}</span>${h.taken ? " " + pill("taken") : ""}</span><span class="row" style="gap:6px"><button class="btn sm" data-act="wAsk" data-to="${esc(h.id)}" data-kind="date" ${open && !h.taken && W.coins >= W.cost.date ? "" : "disabled"}>Ask out</button></span></div>`).join("")}<div class="tiny mute">A human footballer has to say yes. You pay for the date. Nothing is booked until they do.</div>` : "";
  const giftTargets = [...W.contacts.filter((c) => c.ready).map((c) => ({ id: c.id, name: c.name })), ...W.seeing.map((p) => ({ id: p.id, name: p.name })), ...(W.humans || []).filter((h) => !h.taken).map((h) => ({ id: h.id, name: h.name + " ★" }))].filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
  const gifts = W.social ? `<h4 class="shh mt">Gifts</h4><div class="row wrap" style="gap:6px"><select data-change="wGiftTo"><option value="">Who for?</option>${giftTargets.map((p) => `<option value="${esc(p.id)}" ${u.giftTo === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>${W.gifts.map((g) => `<button class="btn sm" data-act="wGift" data-tier="${g.id}" ${W.giftOpen && g.can ? "" : "disabled"}>${esc(g.name)} · ${g.price}</button>`).join("")}<label class="tiny"><input type="checkbox" data-change="wGiftPub" ${u.giftPub ? "checked" : ""}> public</label></div><div class="tiny mute">Private by default. A public gift is worth followers and may be noticed. A footballer in the room can return it.</div>` : "";
  return `<div class="card"><h4 class="shh">People</h4>${seeing}<h4 class="shh mt">Contacts</h4>${contacts}<h4 class="shh mt">On the scene</h4>${scene}${hum}${gifts}</div>`;
}
function memory(W) {
  const m = W.mem, bits = [];
  if (m.exes.length) bits.push(`Exes: ${m.exes.map(esc).join(", ")}`);
  if (m.rejected.length) bits.push(`Turned you down: ${m.rejected.map((r) => esc(r.name) + (r.by ? ` (chose ${esc(r.by)})` : "")).join(", ")}`);
  if (m.rivals.length) bits.push(`Rivals: ${m.rivals.map(esc).join(", ")}`);
  if (m.gifts.length) bits.push(`Gifts: ${m.gifts.map((g) => `${esc(g.tier)} to ${esc(g.name)}`).join(", ")}`);
  return bits.length ? `<div class="card"><h4 class="shh">Your history</h4>${bits.map((b) => `<div class="small">${b}</div>`).join("")}</div>` : "";
}
// What a WAG sees in every phase. During the draft and market there is no weekly choice: just the profile, the people and the league.
export function wagScreen(S, ctx) {
  const W = S.wag;
  if (!W) return { main: `<div class="card"><h3>WAG</h3><p class="small mute">Your profile is being set up…</p></div>`, side: ctx.chatCard(S) };
  const pre = /^(draft|market)\./.test(S.step) || S.step === "season.intro";
  const intro = pre ? `<div class="card"><h4 class="shh">${S.step.startsWith("draft.") ? "The managers are drafting" : S.step.startsWith("market.") ? "The pre-season market" : "The season is about to start"}</h4><p class="small mute">You have no squad to build. Finish your profile and have a look at the league: your weekly choices open once the season is under way.</p></div>` : "";
  const main = head(S, W) + intro + (pre ? "" : choice(S, W) + requests(S, W)) + (pre ? requests(S, W) : "") + people(S, W) + memory(W) + (W.edit ? wagCreator(S, "Your profile") : "");
  return { main, side: ctx.teamsList(S) + ctx.chatCard(S) };
}
// Drawn above the match screens so the full-time view still tells a WAG what their day was.
export function wagStrip(S) {
  const W = S.wag; if (!W) return "";
  return `<div class="card wagh"><div class="row wrap" style="gap:10px;align-items:center"><span class="facebox">${faceOf(W.img, 36, W.g)}</span><b>${esc(W.name)}</b>${pill(`💰 ${W.coins}`)}${pill(`👥 ${W.fol.toLocaleString()}`)}${W.attending ? pill(`🎟️ at the ${esc(W.attending.team)} match`, "good") : ""}<span class="grow"></span>${W.note ? `<span class="small">${esc(W.note)}</span>` : ""}</div>${S.step === "md.result" ? lastLine(W) : ""}</div>`;
}

// ---------- the footballer's side ----------
export function wagBox(S) {
  const pm = S.pm, lf = pm && pm.life, X = lf && lf.wag; if (!X || (!X.list.length && !X.incoming.length)) return "";
  const reqs = X.incoming.map((r) => `<div class="relbox req"><b>${esc(r.who.name)}</b> <span class="pill">WAG</span> ${r.kind === "gift" ? `wants to give you ${r.pub ? "a public gift" : "a gift"}.` : `asks you out. They pay: it costs you nothing.`}<div class="row wrap mt" style="gap:6px"><button class="btn sm pri" data-act="wYes" data-id="${r.id}">${r.kind === "gift" ? "Accept" : "Yes"}</button><button class="btn sm" data-act="wNo" data-id="${r.id}">${r.kind === "gift" ? "Return it" : "No thanks"}</button></div></div>`).join("");
  const book = X.booked ? `<div class="relbox"><b>💘 Booked:</b> a date with ${esc(X.booked.name || "a WAG")} at kick-off. Choosing something else cancels it.</div>` : "";
  const list = X.list.map((w) => `<div class="row" style="gap:8px;justify-content:space-between;padding:3px 0"><span class="small"><span class="facebox" style="display:inline-block;vertical-align:middle">${faceOf(w.img, 26, w.g)}</span> <b>${esc(w.name)}</b> <span class="mute">${w.fol.toLocaleString()} followers</span> ${w.seeing ? '<span class="pill good">seeing</span>' : ""}${w.asked ? '<span class="pill">asked</span>' : ""}</span><button class="btn sm" data-act="wAsk" data-to="${esc(w.id)}" data-kind="date" ${w.can && !w.asked ? "" : "disabled"}>Ask out · ${X.cost}</button></div>`).join("");
  return `<h4 class="shh mt">WAGs in the room</h4>${reqs}${book}${list || ""}<div class="tiny mute">A WAG is not a footballer: no squad place or wages. They say yes or no. Your invitation costs you a date; theirs costs you nothing.</div>`;
}
