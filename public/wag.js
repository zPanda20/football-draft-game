// WAG mode screens: the profile (lobby, draft, market), the weekly home screen, requests, people, gifts and the footballer-side list of WAGs.
// A WAG is a third way to play: no club, no squad, no wages. The server sends this person only their own record (S.wag).
import { st, $, esc, send, toast, team, crest, faceOf, card, pl, SKIN, HAIRC, HAIR_NAMES } from "./core.js";

const ui = () => (st.ui.wag = st.ui.wag || {});
const you = (S) => S.players.find((p) => p.you);
export const isWagUser = (S) => { const y = you(S); return !!(y && y.mode === "wag"); };

export const wagHandlers = {
  wName(a) { send({ t: "wChar", c: { name: a.value } }); },
  wGender(a) { send({ t: "wChar", c: { gender: a.g } }); },
  wFace(a) { const y = you(st.S), w = st.S.wag || (y && y.wag) || {}, cur = String(w.img || (y && y.wchar && y.wchar.img) || "0-0-0"), p = (/^\d-\d-\d$/.test(cur) ? cur : "0-0-0").split("-").map(Number); if (a.f) return send({ t: "wChar", c: { img: a.f } }); p[+a.part] = +a.v; send({ t: "wChar", c: { img: p.slice(0, 3).join("-") } }); },
  wAuto() { send({ t: "auto", on: !(st.S.wag && st.S.wag.auto) }); },
  wTab(a) { ui().tab = a.tab; st.render(); },
  wRoster(a) { ui().rosterTeam = +a.i; st.render(); },
  wFx(a) { const u = ui(); u.fx = +a.value; u.team = null; u.target = ""; st.render(); },
  wTeam(a) { const u = ui(); u.team = +a.value; u.target = ""; st.render(); },
  wTarget(a) { ui().target = a.value; },
  wGiftTo(a) { ui().giftTo = a.value; },
  wGiftPub(a, el) { ui().giftPub = !!(el && el.checked); },
  // the week's activity: date opens the pool of people; everything else is chosen straight away
  wDo(a) { if (a.a === "date") { const u = ui(); u.dateOpen = !u.dateOpen; return st.render(); } ui().dateOpen = false; send({ t: "wAct", c: { act: a.a } }); },
  wInvite(a) { send({ t: "wAct", c: { act: "date", partner: a.id } }); },
  wGoMatch() {
    const W = st.S.wag, u = ui(), m = W.match, fx = u.fx != null ? u.fx : (m ? m.fixture : (W.fixtures[0] || {}).i), f = W.fixtures.find((x) => x.i === fx); if (!f) return toast("No match to go to.");
    const tm = u.team != null && (u.team === f.a || u.team === f.b) ? u.team : m && (m.team === f.a || m.team === f.b) && m.fixture === f.i ? m.team : f.a;
    send({ t: "wMatch", c: { fixture: f.i, team: tm, target: (u.target != null ? u.target : m && m.target) || null } });
  },
  wNoMatch() { const u = ui(); u.fx = null; u.team = null; u.target = ""; send({ t: "wMatchClear" }); },
  wSeq(a) { send({ t: "wSeq", id: a.id }); },
  wBig() { const u = ui(); u.wBig = !u.wBig; st.render(); },
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
  const w = S.wag || y.wag || {}, c = { name: w.name || (y.wchar && y.wchar.name) || y.name, g: w.g || (y.wchar && y.wchar.gender) || "F", img: w.img || (y.wchar && y.wchar.img) || "0-0-0" };
  const [fs, fh, fc] = (/^\d-\d-\d$/.test(c.img) ? c.img : "0-0-0").split("-").map(Number);
  const hair = `<div class="facerow"><span class="small mute">Hair</span>${HAIR_NAMES.map((n, i) => `<button class="btn sm ${fh === i ? "pri" : ""}" data-act="wFace" data-part="1" data-v="${i}">${n}</button>`).join("")}</div>`;
  const photos = (st.cat.faces || []).length ? `<div class="facerow"><span class="small mute">Photos</span>${st.cat.faces.map((f) => `<button class="fphoto ${c.img === "f:" + f ? "sel" : ""}" data-act="wFace" data-f="f:${esc(f)}"><img src="/assets/faces/${encodeURIComponent(f)}" alt="" width="36" height="36"></button>`).join("")}</div>` : "";
  // Portraits held by thunder plates this browser has unlocked (the same row the footballer creator shows).
  const have = new Set(y.unlocks || []), tf = (st.cat.plates || []).filter((pl) => pl.kind === "portrait" && have.has(pl.id)).flatMap((pl) => (pl.faces || []).map((f) => ({ f, pl })));
  const thunder = (st.cat.plates || []).some((pl) => pl.kind === "portrait") ? `<div class="facerow"><span class="small mute">⚡ Thunder plates</span>${tf.length ? tf.map(({ f, pl }) => `<button class="fphoto ${c.img === "p:" + f ? "sel" : ""}" data-act="wFace" data-f="p:${esc(f)}" title="${esc(pl.name)}"><img src="/assets/portraits/${encodeURIComponent(f)}" alt="" width="36" height="36"></button>`).join("") : `<span class="tiny mute">Portraits that only a thunder plate unlocks. Enter a code in the trophy cabinet to open one.</span>`}</div>` : "";
  return `<div class="card wagc"><h3>${title}</h3>
    <p class="small mute">A WAG is not a footballer: no club, no squad place, no wages. You can date, go out, shoot content, build a business and go to matches, and you earn and spend your own money.</p>
    <div class="row wrap mt" style="gap:10px"><input id="wname" maxlength="22" value="${esc(c.name)}" placeholder="Name" data-change="wName" style="flex:1;min-width:160px">
      <span class="seg"><button class="btn sm ${c.g === "F" ? "pri" : ""}" data-act="wGender" data-g="F">Woman</button><button class="btn sm ${c.g === "M" ? "pri" : ""}" data-act="wGender" data-g="M">Man</button></span></div>
    <div class="row wrap mt" style="gap:14px;align-items:flex-start"><div class="facebox">${faceOf(c.img, 92, c.g)}</div><div class="col grow" style="gap:6px;min-width:230px">${faceRow("Skin", SKIN, 0, fs)}${hair}${faceRow("Hair colour", HAIRC, 2, fc)}${photos}${thunder}</div></div></div>`;
}
export function wagLate(S) {
  const y = you(S); if (!y || !y.late || S.wag) return "";
  return `<div class="card"><h3>You are joining late</h3><p class="small mute">The game is already running. Create your WAG below, then join: you can start meeting people straight away.</p><div class="row mt wrap" style="gap:8px"><button class="btn pri" data-act="lateJoin">Join the game as ${esc((y.wag && y.wag.name) || "a WAG")}</button><button class="btn" data-act="mode" data-mode="player">Join as a footballer instead</button></div></div>${wagCreator(S)}`;
}

// ---------- the home screen ----------
const tn = (S, id) => (S.teams[id] ? S.teams[id].name : "?");
const pill = (t, c = "") => `<span class="pill ${c}">${t}</span>`;
const initialsOf = (n) => String(n || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// A dating partner who is not a player: the same pictures the footballers' dating screen uses.
const npcFace = (slug, name, size = 72) => { const u = st.cat.art && st.cat.art.partners && st.cat.art.partners[slug]; return u ? `<img class="pface" src="${esc(u)}" alt="" width="${size}" height="${size}" loading="lazy">` : `<span class="pface ini" style="width:${size}px;height:${size}px;--h:${hue(slug)}">${esc(initialsOf(name))}</span>`; };
function head(S, W) {
  const sup = W.support ? `<span class="small mute">Supports <b>${esc(W.support)}</b></span>` : "";
  const biz = W.biz.lvl ? pill(`💼 Business level ${W.biz.lvl}${W.biz.lvl < W.biz.max ? ` · ${W.biz.prog}/${W.biz.per}` : " · top"}`) : pill(`💼 No business yet${W.biz.prog ? ` · ${W.biz.prog}/${W.biz.per}` : ""}`);
  return `<div class="card wagh"><div class="row wrap" style="gap:14px;align-items:center"><div class="facebox">${faceOf(W.img, 64, W.g)}</div>
    <div class="grow col" style="gap:4px"><h3 style="margin:0">${esc(W.name)} <span class="tiny mute">WAG</span></h3>
      <div class="row wrap" style="gap:8px">${pill(`💰 ${W.coins} coins`)}${pill(`👥 ${W.fol.toLocaleString()} followers`)}${pill(`⭐ Brand ${W.brand}`)}${biz}${W.passive ? pill(`+${W.passive} coins a matchday`) : ""}${sup}</div></div>
    <button class="btn sm ${W.auto ? "pri" : ""}" data-act="wAuto" title="On Auto you take quiet weeks and are never waited for">${W.auto ? "Auto: on" : "Auto: off"}</button></div>
    ${W.step === "md.lineup" ? `<div class="small mute mt">Matchday ${W.next} of ${W.total}. Choose how you spend this week before kick-off.</div>` : ""}
    ${W.note ? `<div class="small mt" style="color:var(--accent,#3ddc84)">${esc(W.note)}</div>` : ""}</div>`;
}
function lastLine(S, W) {
  const l = W.last; if (!l) return "";
  const txt = l.act === "content" ? `You made content and earned ${l.earned} coins.` : l.act === "party" ? "You went out." : l.act === "business" ? "You worked on your business." : l.act === "date" ? (l.failed ? "Your date did not happen." : `Your date ${l.good ? "went well" : "was awkward"}.`) : l.failed ? "Your invitation was not taken up." : "A quiet night in.";
  return `<div class="small mute mt">Last matchday: ${esc(txt)}${l.attend != null ? ` You were at the ${esc(tn(S, l.attend))} match.` : ""}</div>${seqLog(W.seq)}`;
}
const seqLog = (q) => (q && q.log.length ? `<div class="col mt" style="gap:3px">${q.log.map((x) => `<div class="small">${esc(x.icon || "")} <b>${esc(x.name)}</b>${x.ok ? "" : ' <span class="tiny mute">(flopped)</span>'}: ${esc(x.text)}${x.fx ? ` <span class="tiny ${x.ok ? "" : "mute"}">(${esc(x.fx)})</span>` : ""}</div>`).join("")}</div>` : "");

// ---------- this week: a match (optional) and one main thing ----------
const ACT_CARDS = [
  ["date", "💘", "Go on a date", (W) => `From ${W.cost.dateNpc} coins. Someone from your pool, a footballer you have a number for, or a player in the room.`],
  ["party", "🪩", "Go out partying", (W) => `${W.cost.party} coins. Followers, a night out, maybe a new number.`],
  ["quiet", "🛋️", "A quiet night in", () => "Free. Warms things with whoever you see."],
  ["content", "📸", "Shoot content", (W) => `About ${W.contentPay} coins and followers. ${W.contentLeft} left this season.`],
  ["business", "💼", "Build a business", () => "Progress towards a business that pays every matchday."],
];
function matchCard(S, W) {
  const u = ui(), m = W.match, fx = W.fixtures.find((x) => x.i === (u.fx != null ? u.fx : (m ? m.fixture : (W.fixtures[0] || {}).i))) || W.fixtures[0];
  const tm = fx ? (u.team != null && (u.team === fx.a || u.team === fx.b) ? u.team : m && m.fixture === fx.i && (m.team === fx.a || m.team === fx.b) ? m.team : fx.a) : null;
  const sq = fx && tm != null ? W.roster[tm] || [] : [], tgt = u.target != null ? u.target : (m && m.team === tm ? m.target || "" : "");
  return `<div class="card"><h4 class="shh">🎟️ A match (optional)</h4>
    <p class="small mute">${W.cost.attend} coins, paid at kick-off. You choose who to support. After full time there is a chance to meet someone from that team; you can invite them from next matchday. If you go, content, a night out and business become a quick version, because the match is where you are. If you do not go, you get the match-time choices instead.</p>
    <div class="row wrap mt" style="gap:6px"><select data-change="wFx">${W.fixtures.map((f) => `<option value="${f.i}" ${fx && f.i === fx.i ? "selected" : ""}>${esc(f.an)} v ${esc(f.bn)}</option>`).join("")}</select>
      ${fx ? `<select data-change="wTeam"><option value="${fx.a}" ${tm === fx.a ? "selected" : ""}>Support ${esc(fx.an)}</option><option value="${fx.b}" ${tm === fx.b ? "selected" : ""}>Support ${esc(fx.bn)}</option></select>` : ""}
      <select data-change="wTarget"><option value="">Anyone</option>${sq.map((p) => `<option value="${esc(p.id)}" ${tgt === p.id ? "selected" : ""} ${p.taken ? "disabled" : ""}>${esc(p.name)} (${esc(p.pos)})${p.human ? " ★" : ""}${p.taken ? " · taken" : ""}</option>`).join("")}</select>
      <button class="btn ${m ? "pri" : ""}" data-act="wGoMatch" ${W.coins < W.cost.attend || !fx ? "disabled" : ""}>${m ? "Going ✓ (update)" : "Go"}</button>${m ? `<button class="btn sm ghost" data-act="wNoMatch">Not going</button>` : ""}</div>
    <div class="tiny mute mt">${m ? `You are going to the ${esc(tn(S, m.team))} match.` : "Naming someone improves the odds a little. It is a chance, not a promise."}</div></div>`;
}
const tag = (t) => `<span class="tiny mute">${t}</span>`;
function poolTile(S, W, x) {
  const act = W.act, booked = act && act.act === "date" && act.partner === x.id, open = W.chooseOpen;
  if (x.kind === "npc") {
    return `<div class="datec ${booked ? "sel" : ""} ${x.g === "F" ? "gf" : "gm"}">${npcFace(x.slug, x.name)}<b>${esc(x.name)}</b>${tag("Not a footballer · little effect on your status")}
      <button class="btn sm ${booked ? "pri" : ""}" data-act="wInvite" data-id="${esc(x.id)}" ${open && W.coins >= x.cost ? "" : "disabled"}>${booked ? "Invited ✓" : `Invite · ${x.cost}`}</button></div>`;
  }
  const label = x.kind === "seeing" ? `💘 Seeing · bond ${x.bond}` : x.kind === "contact" ? `📞 Your contact · until matchday ${x.until + 1}` : x.kind === "scene" ? "On the scene" : x.seeing ? "💘 Seeing" : x.ready ? "📞 Your contact" : "A player in the room";
  let btn;
  if (x.kind === "human") btn = booked ? `<span class="pill good">Booked ✓</span>` : `<button class="btn sm" data-act="wAsk" data-to="${esc(x.id)}" data-kind="date" ${open && !x.taken && !x.asked && W.coins >= W.cost.date ? "" : "disabled"}>${x.taken ? "Taken" : x.asked ? "Asked…" : `Ask out · ${W.cost.date}`}</button>`;
  else btn = `<button class="btn sm ${booked ? "pri" : ""}" data-act="wInvite" data-id="${esc(x.id)}" ${open && x.can && W.coins >= W.cost.date ? "" : "disabled"}>${booked ? "Invited ✓" : x.taken ? "Taken" : `Invite · ${W.cost.date}`}</button>`;
  return `<div class="datec wtile ${booked ? "sel" : ""}">${card(x.pid, { size: "sm", info: true, tag: label })}<b>${esc(x.name)}</b>${x.human ? tag("A player in this room · they have to say yes") : ""}${btn}</div>`;
}
function datePool(S, W) {
  const groups = [["seeing", "Seeing"], ["contact", "Numbers you have"], ["human", "Footballers in the room"], ["scene", "On the scene"], ["npc", "Out and about (not footballers)"]];
  return `<div class="card"><h4 class="shh">💘 Who do you invite?</h4><p class="small mute">A footballer appears here once you have their number (from a match or a night out), is on the scene, or you are already seeing them. Others may invite the same person: the better-scored invitation wins and the rest are not charged. Dates with people who are not footballers are cheaper and barely change your status.</p>
    ${groups.map(([k, t]) => { const l = W.pool.filter((x) => x.kind === k); return l.length ? `<h4 class="shh mt">${t}</h4><div class="datecards">${l.map((x) => poolTile(S, W, x)).join("")}</div>` : ""; }).join("")}</div>`;
}
function choice(S, W) {
  if (!W.chooseOpen) return `<div class="card"><h4 class="shh">This week</h4><p class="small mute">${W.step === "md.result" ? "The matchday is over. You choose your next week when the line-up window opens." : "Choices open in the line-up window before each match."}</p>${W.attending ? `<p class="small">🎟️ You are at the ${esc(W.attending.team)} match.</p>` : ""}${lastLine(S, W)}</div>`;
  const u = ui(), act = W.act ? W.act.act : null, picked = (W.act && W.act.partner) || null;
  const cards = ACT_CARDS.map(([id, ic, name, desc]) => {
    const dis = (id === "content" && W.contentLeft <= 0) || (id === "party" && W.coins < W.cost.party), on = act === id;
    return `<button class="wact ${on ? "sel" : ""}" data-act="wDo" data-a="${id}" ${dis ? "disabled" : ""}><span class="wi">${ic}</span><b>${name}</b><span class="tiny mute">${desc(W)}</span><span class="tiny">${on ? (id === "date" ? (String(picked).startsWith("n:") ? "Invited ✓" : String(picked).startsWith("u:") ? "Booked ✓" : "Invited ✓") : "Chosen ✓") : id === "date" ? (u.dateOpen ? "Hide the pool" : "Choose who →") : ""}</span></button>`;
  }).join("");
  return `${matchCard(S, W)}<div class="card"><h4 class="shh">This week · one main thing</h4><div class="wacts">${cards}</div>
    ${act ? `<div class="row mt" style="gap:8px;align-items:center"><span class="small">You chose: <b>${esc(({ date: "Go on a date", party: "Go out partying", quiet: "A quiet night in", content: "Shoot content", business: "Build a business" })[act])}</b>${W.match ? " and the match" : ""}</span><button class="btn sm ghost" data-act="wClear">Change my mind</button></div>` : `<div class="tiny mute mt">Choose a match first if you want one: the line-up window can close as soon as everybody has picked their main thing.</div>`}
    ${!W.match && ["content", "party", "business"].includes(act) ? `<div class="small mt">⏱️ No match? During the matches you will get two quick choices (one each half) that change your brand, money, followers and relationships.</div>` : ""}
    ${lastLine(S, W)}</div>${u.dateOpen || act === "date" ? datePool(S, W) : ""}`;
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
// Every team's players as cards, so a WAG can see who is worth a number. Cards you can open for the full stats.
function rosters(S, W) {
  const u = ui(), sel = u.rosterTeam != null && S.teams[u.rosterTeam] ? u.rosterTeam : (S.teams.find((t) => t.name === W.support) || S.teams[0] || {}).id ?? 0, t = team(sel), ps = (t.players || []).map((id) => pl(id)).filter(Boolean);
  const mark = new Map(); for (const c of W.contacts) if (c.ready && c.pid != null) mark.set(c.pid, "📞 your contact"); for (const x of W.scene) mark.set(x.pid, "on the scene"); for (const x of W.seeing) if (x.id.startsWith("f:") || x.id.startsWith("u:")) mark.set(+x.id.slice(2), "💘 seeing");
  const list = ps.slice().sort((a, b) => (a.pos === "GK") - (b.pos === "GK") || b.ovr - a.ovr);
  return `<div class="card"><h4 class="shh">📋 Team rosters</h4><div class="row wrap" style="gap:6px">${S.teams.map((x) => `<button class="btn sm ${x.id === sel ? "pri" : ""}" data-act="wRoster" data-i="${x.id}">${crest(x, 16)} ${esc(x.name)}</button>`).join("")}</div></div>
    <div class="card"><div class="row wrap" style="gap:10px;align-items:center">${crest(t, 36)}<b style="font-size:18px">${esc(t.name)}</b><span class="small mute">${t.owner ? "Managed by " + esc(t.owner) : "CPU manager"}</span></div>
    <div class="rost mt">${list.map((p) => `<div class="rostc">${card(p.id, { size: "sm", info: true, tag: mark.get(p.id) || undefined })}</div>`).join("") || `<p class="small mute">No players yet.</p>`}</div>
    <p class="tiny mute mt">${W.cost ? "Players you have a number for, or who are on the scene, are marked. Open a card with the i button for the full stats." : ""}</p></div>`;
}
const TABS = [["week", "🏠 This week"], ["people", "👥 People and gifts"], ["rosters", "📋 Team rosters"]];
// What a WAG sees in every phase. During the draft and market there is no weekly choice: just the profile, the people and the league.
export function wagScreen(S, ctx) {
  const W = S.wag;
  if (!W) return { main: `<div class="card"><h3>WAG</h3><p class="small mute">Your profile is being set up…</p></div>`, side: ctx.chatCard(S) };
  const pre = /^(draft|market)\./.test(S.step) || S.step === "season.intro", u = ui(), tab = TABS.some((x) => x[0] === u.tab) ? u.tab : "week";
  const intro = pre ? `<div class="card"><h4 class="shh">${S.step.startsWith("draft.") ? "The managers are drafting" : S.step.startsWith("market.") ? "The pre-season market" : "The season is about to start"}</h4><p class="small mute">You have no squad to build. Finish your profile and have a look at the league: your weekly choices open once the season is under way.</p></div>` : "";
  const tabs = `<div class="row wrap wtabs" style="gap:6px">${TABS.map(([id, name]) => `<button class="btn sm ${tab === id ? "pri" : ""}" data-act="wTab" data-tab="${id}">${name}</button>`).join("")}${(W.incoming || []).length ? `<span class="pill bad">${W.incoming.length} request${W.incoming.length === 1 ? "" : "s"}</span>` : ""}</div>`;
  const body = tab === "rosters" ? rosters(S, W) : tab === "people" ? people(S, W) + memory(W) : intro + (pre ? "" : choice(S, W) + requests(S, W)) + (pre ? requests(S, W) : "") + (W.edit ? wagCreator(S, "Your profile") : "");
  return { main: head(S, W) + tabs + body, side: ctx.teamsList(S) + ctx.chatCard(S) };
}
// While the matches are on: a big menu of things to do, with the match as a small tile. Picks resolve at once; nothing is chosen for you.
function menuCard(S, W) {
  const q = W.seq; if (!q) return "";
  const half = { "md.half1": "First half", "md.half": "Half-time", "md.half2": "Second half" }[S.step] || "", last = q.log[q.log.length - 1];
  const head = `<div class="row wrap" style="gap:8px;align-items:center"><h3 style="margin:0">🎛️ Matchday menu</h3><span class="pill">${esc(half)}</span><span class="pill ${q.left ? "good" : ""}">${q.left} pick${q.left === 1 ? "" : "s"} left this half</span><span class="grow"></span><span class="tiny mute">${q.at ? "You are at the match, so one pick a half." : `${q.per} picks a half. Each can be done once per match.`}</span></div>`;
  const latest = last ? `<div class="wlast ${last.ok ? "ok" : "bad"}"><span class="wi">${esc(last.icon || "")}</span><div><b>${esc(last.name)}</b>${last.ok ? "" : ' <span class="tiny mute">(it flopped)</span>'}<div class="small">${esc(last.text)}</div>${last.fx ? `<div class="tiny mute">${esc(last.fx)}</div>` : ""}</div></div>` : "";
  const groups = q.cats.map((c) => { const l = q.menu.filter((m) => m.cat === c.id); return `<h4 class="shh mt">${c.icon} ${esc(c.name)}${q.focus === c.id ? ' <span class="pill good">your focus this week: a bit more from these</span>' : ""}</h4><div class="wmenu">${l.map((m) => `<button class="wopt big ${m.used ? "used" : ""} ${m.focus ? "foc" : ""}" data-act="wSeq" data-id="${esc(m.id)}" ${m.can ? "" : "disabled"}><span class="wi">${esc(m.icon)}</span><b>${esc(m.name)}</b><span class="tiny mute">${esc(m.desc)}</span><span class="tiny">${m.used ? "Done ✓" : m.cost ? `${m.cost} coins` : "free"}</span></button>`).join("")}</div>`; }).join("");
  return `<div class="card wseq">${head}${latest}${q.done ? `<p class="small mute mt">The match is over. That is your matchday done: you are back in the menu when everyone else is.</p>` : groups}${q.log.length > 1 ? `<h4 class="shh mt">Your matchday so far</h4>${seqLog(q)}` : ""}</div>`;
}
// The match the WAG is watching, as a small tile that can be opened out.
function miniMatch(S, html) {
  const big = !!ui().wBig;
  return `<div class="wmini ${big ? "" : "small"}"><div class="row" style="gap:8px;align-items:center;margin-bottom:6px"><b>📺 Watching the match</b><span class="grow"></span><button class="btn sm" data-act="wBig">${big ? "Make it small" : "Open the match"}</button></div>${html}</div>`;
}
// Drawn above the match screens so the full-time view still tells a WAG what their day was.
export function wagStrip(S) {
  const W = S.wag; if (!W) return "";
  return `<div class="card wagh"><div class="row wrap" style="gap:10px;align-items:center"><span class="facebox">${faceOf(W.img, 36, W.g)}</span><b>${esc(W.name)}</b>${pill(`💰 ${W.coins}`)}${pill(`👥 ${W.fol.toLocaleString()}`)}${pill(`⭐ ${W.brand}`)}${W.biz.lvl ? pill(`💼 L${W.biz.lvl}`) : ""}${W.attending ? pill(`🎟️ at the ${esc(W.attending.team)} match`, "good") : ""}<span class="grow"></span>${W.note ? `<span class="small">${esc(W.note)}</span>` : ""}</div>${S.step === "md.result" ? lastLine(S, W) : ""}</div>`;
}
// During the first half, half-time and the second half: the strip, the match in a small tile (so the score is always in view), then the big menu.
export function wagLive(S, matchHtml) { return wagStrip(S) + miniMatch(S, matchHtml) + menuCard(S, S.wag || {}); }

// ---------- the footballer's side ----------
export function wagBox(S) {
  const pm = S.pm, lf = pm && pm.life, X = lf && lf.wag; if (!X || (!X.list.length && !X.incoming.length)) return "";
  const reqs = X.incoming.map((r) => `<div class="relbox req"><b>${esc(r.who.name)}</b> <span class="pill">WAG</span> ${r.kind === "gift" ? `wants to give you ${r.pub ? "a public gift" : "a gift"}.` : `asks you out. They pay: it costs you nothing.`}<div class="row wrap mt" style="gap:6px"><button class="btn sm pri" data-act="wYes" data-id="${r.id}">${r.kind === "gift" ? "Accept" : "Yes"}</button><button class="btn sm" data-act="wNo" data-id="${r.id}">${r.kind === "gift" ? "Return it" : "No thanks"}</button></div></div>`).join("");
  const book = X.booked ? `<div class="relbox"><b>💘 Booked:</b> a date with ${esc(X.booked.name || "a WAG")} at kick-off. Choosing something else cancels it.</div>` : "";
  const list = X.list.map((w) => `<div class="row" style="gap:8px;justify-content:space-between;padding:3px 0"><span class="small"><span class="facebox" style="display:inline-block;vertical-align:middle">${faceOf(w.img, 26, w.g)}</span> <b>${esc(w.name)}</b> <span class="mute">${w.fol.toLocaleString()} followers</span> ${w.seeing ? '<span class="pill good">seeing</span>' : ""}${w.asked ? '<span class="pill">asked</span>' : ""}</span><button class="btn sm" data-act="wAsk" data-to="${esc(w.id)}" data-kind="date" ${w.can && !w.asked ? "" : "disabled"}>Ask out · ${X.cost}</button></div>`).join("");
  return `<h4 class="shh mt">WAGs in the room</h4>${reqs}${book}${list || ""}<div class="tiny mute">A WAG is not a footballer: no squad place or wages. They say yes or no. Your invitation costs you a date; theirs costs you nothing.</div>`;
}
