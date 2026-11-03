// Relationships between footballers and the people they date, shared across the room (see ensureRom in life.js):
// asking another footballer out, going exclusive, thrupples, breaking up, weddings as events, and answering online beef.
// Every function returns { ok, why?, notes? }. `notes` are messages for other footballers: [{ pid, text }].
import { makeRng } from "./rng.js";
import { ensureLife, ensureRom, npcState, otherSuitors, isHuman, personOf, leave, leaveThr, thrMembers, canMarry, actCost, mk, applyFx } from "./life.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hid = (id) => +String(id).slice(2);
const uid = (p) => "u:" + p.id;
const fail = (why) => ({ ok: false, why });
const user = (game, pid) => { const q = game.players[pid]; return q && q.user && !q.retired ? q : null; };
const cap = (a) => (a ? a[0].toUpperCase() + a.slice(1) : "");

// ---------- little facts ----------
export const avgQ = (L, id) => { const D = (L.dq || {})[id]; return D && D.n ? D.sum / D.n : 0; };
export const goodDates = (L, id) => ((L.dq || {})[id] || { good: 0 }).good;
// "How do I stand with this person": what the exclusive button needs to know.
export function exclusiveState(game, p) {
  const L = ensureLife(game, p), R = ensureRom(game), P = game.P.life.rom, q = L.partner;
  if (!q || q.excl || L.married) return { can: false, why: q && (q.excl || L.married) ? "Already exclusive" : "Date someone first" };
  if ((L.dated[q.id] || 0) < P.exclDates) return { can: false, why: `${P.exclDates - (L.dated[q.id] || 0)} more date${P.exclDates - (L.dated[q.id] || 0) === 1 ? "" : "s"} first` };
  if (goodDates(L, q.id) < P.exclGood) return { can: false, why: `Needs ${P.exclGood} good dates (you have ${goodDates(L, q.id)})` };
  if (!isHuman(q.id) && ((L.exclNo || {})[q.id] || 0) > R.week) return { can: false, why: "They need a little time" };
  return { can: true };
}

// ---------- requests between footballers ----------
const open = (R) => R.req.filter((r) => r.status === "open");
export function sendRequest(game, p, toPid, kind) {
  const R = ensureRom(game), P = game.P.life.rom, L = ensureLife(game, p), q = user(game, toPid);
  if (!q || q.id === p.id) return fail("Not a player");
  const QL = ensureLife(game, q);
  if (open(R).some((r) => r.from === p.id && r.to === q.id && r.kind === kind)) return fail("Already asked");
  if (kind === "date") {
    if (L.married || QL.married) return fail("Married footballers go on dates with their spouses");
    if (L.partner && L.partner.excl && L.partner.id !== uid(q)) return fail("You are exclusive with someone else");
    if ((p.coins || 0) < actCost(game, p, "date") * P.dateMult) return fail("You cannot afford it");
  } else if (kind === "excl") {
    if (!L.partner || L.partner.id !== uid(q) || !QL.partner || QL.partner.id !== uid(p)) return fail("Go on a date together first");
    if (L.partner.excl || L.married) return fail("Already exclusive");
    const s = exclusiveState(game, p); if (!s.can) return fail(s.why);
  } else if (kind === "thr") {
    if (L.thr || QL.thr) return fail("Already in a thrupple");
    if (L.married || (L.partner && L.partner.excl)) return fail("You are in a relationship already");
    if (!QL.partner || !(QL.partner.excl || QL.married)) return fail(`${q.name} is not in a relationship`);
  } else if (kind === "wed") {
    if (!L.partner || L.partner.id !== uid(q) || !QL.partner || QL.partner.id !== uid(p) || !L.partner.excl || !QL.partner.excl) return fail("You both need to be exclusive");
    if (L.married || L.wed || QL.wed) return fail("A wedding is already on");
    if ((L.dated[uid(q)] || 0) < game.P.life.wedding.dates) return fail(`${game.P.life.wedding.dates} dates first`);
  } else return fail("unknown");
  const r = { id: ++R.reqSeq, kind, from: p.id, to: q.id, status: "open", season: game.season, week: R.week };
  R.req.push(r); if (R.req.length > 60) R.req.splice(0, R.req.length - 60);
  return { ok: true, req: r, notes: [{ pid: q.id, text: `${p.name} ${{ date: "asks you out on a date", excl: "asks you to go exclusive", thr: "asks to be in a thrupple with you", wed: "asks you to marry them" }[kind]}.` }] };
}

// Two footballers' joint date: the one who asked pays (double), the other comes along for free.
function setJoint(game, a, b) {
  const L = ensureLife(game, a), M = ensureLife(game, b);
  cancelJoint(game, a); cancelJoint(game, b);
  L.act = { act: "date", partner: uid(b), joint: { pay: true } };
  M.act = { act: "date", partner: uid(a), joint: { pay: false } };
}
// Whoever changes their mind frees the other one as well.
export function cancelJoint(game, p) {
  const L = p.life; if (!L || !L.act || !L.act.joint) return;
  const other = game.players[hid(L.act.partner)]; L.act = null;
  if (other && other.life && other.life.act && other.life.act.joint && other.life.act.partner === uid(p)) other.life.act = null;
}

export function replyRequest(game, p, reqId, yes) {
  const R = ensureRom(game), r = R.req.find((x) => x.id === reqId && x.to === p.id && x.status === "open"); if (!r) return fail("Gone");
  const a = user(game, r.from), L = ensureLife(game, p); if (!a) { r.status = "lapsed"; return fail("Gone"); }
  const AL = ensureLife(game, a), P = game.P.life.rom, notes = [];
  if (!yes) { r.status = "declined"; return { ok: true, kind: r.kind, yes: false, notes: [{ pid: a.id, text: `${p.name} said no.` }] }; }
  if (r.kind === "date") {
    if ((a.coins || 0) < actCost(game, a, "date") * P.dateMult) { r.status = "lapsed"; return fail(`${a.name} can no longer afford it`); }
    setJoint(game, a, p); r.status = "accepted";
    notes.push({ pid: a.id, text: `${p.name} said yes. You pay, they come. See you at kick-off!` });
  } else if (r.kind === "excl") {
    r.status = "accepted";
    for (const [x, y] of [[a, p], [p, a]]) { const XL = ensureLife(game, x); XL.partner = { ...(XL.partner || { id: uid(y), name: y.name, g: y.gender === "F" ? "F" : "M", human: y.id, partier: false }), excl: true }; XL.love = clamp(XL.love + 10, 0, 100); }
    mk(game, a, { prio: 3, abs: true, kind: "wedding", icon: "💞", head: `${a.name.toUpperCase()} AND ${p.name.toUpperCase()} GO EXCLUSIVE`, sub: `They have told their followers, then each other, then their agents. The wedding page of the paper has cleared some room.`, fx: { fol: 1500 } });
    notes.push({ pid: a.id, text: `${p.name} said yes: you are exclusive.` });
  } else if (r.kind === "wed") {
    r.status = "accepted";
    AL.wed = { status: "planning", partner: uid(p), organiser: true }; L.wed = { status: "planning", partner: uid(a), organiser: false };
    notes.push({ pid: a.id, text: `${p.name} said YES! Plan the wedding from your Relationships panel.` });
  } else if (r.kind === "thr") {
    // the footballer asked is in a relationship: his partner has a say too
    const q = L.partner, qid = q && q.id;
    r.status = "accepted";
    if (!q) return fail("Not in a relationship any more");
    if (isHuman(qid)) {
      const c = user(game, hid(qid));
      if (!c) return fail("Their partner has gone");
      if (!open(R).some((x) => x.kind === "thr2" && x.from === a.id && x.to === c.id)) {
        R.req.push({ id: ++R.reqSeq, kind: "thr2", from: a.id, to: c.id, mate: p.id, status: "open", season: game.season, week: R.week });
        notes.push({ pid: c.id, text: `${a.name} wants to join you and ${p.name} in a thrupple. ${p.name} is up for it: your call.` });
      }
      notes.push({ pid: a.id, text: `${p.name} agreed. Now ${c.name} has to say yes too.` });
    } else {
      const n = npcState(game, qid), chance = clamp(P.thrAsk + P.thrOpen * (1 - n.loyalty / 100), 0.05, 0.9);
      if (makeRng(game.seed, "thr", a.id, p.id, R.week)() < chance) { formThr(game, [uid(a), uid(p), qid]); notes.push({ pid: a.id, text: `${q.name} is fine with it. You are in a thrupple with ${p.name} and ${q.name}!` }); }
      else notes.push({ pid: a.id, text: `${p.name} agreed, but ${q.name} said no. It's off.` });
    }
  } else if (r.kind === "thr2") {
    r.status = "accepted";
    const mate = user(game, r.mate); if (!mate) return fail("Gone");
    formThr(game, [uid(a), uid(mate), uid(p)]);
    notes.push({ pid: a.id, text: `${p.name} agreed too: it's a thrupple!` }, { pid: mate.id, text: `${p.name} and ${a.name} are in. Welcome to the thrupple.` });
  }
  return { ok: true, kind: r.kind, yes: true, notes };
}

// A thrupple of three: members are ids ("u:<id>" or a listed person). The footballer who asked becomes exclusive with the one he asked.
function formThr(game, members) {
  const R = ensureRom(game), t = { id: ++R.thrSeq, members: members.slice(), season: game.season };
  R.thr.push(t);
  const [first, second] = members;
  for (const m of members) if (isHuman(m)) { const q = game.players[hid(m)]; if (q) ensureLife(game, q).thr = t.id; }
  const a = game.players[hid(first)], b = game.players[hid(second)];
  if (a && b) { const AL = ensureLife(game, a); AL.partner = { id: uid(b), name: b.name, g: b.gender === "F" ? "F" : "M", human: b.id, partier: false, excl: true, dates: AL.dated[uid(b)] || 0 }; }
  const names = members.map((m) => (personOf(game, m) || { name: "?" }).name);
  if (a) mk(game, a, { prio: 4, abs: true, kind: "wedding", icon: "🔺", head: `${names[0].toUpperCase()}, ${names[1].toUpperCase()} AND ${names[2].toUpperCase()}: A THRUPPLE`, sub: `Three people, one sofa and a group chat with a very long name. The tabloids have run out of puns and are "monitoring the situation".`, fx: { fol: 5000 } });
}

// ---------- asking a listed person to go exclusive ----------
export function askExclusive(game, p) {
  const L = ensureLife(game, p), R = ensureRom(game), P = game.P.life.rom, q = L.partner;
  if (!q || isHuman(q.id)) return fail("Ask a footballer with a request");
  const s = exclusiveState(game, p); if (!s.can) return fail(s.why);
  const n = npcState(game, q.id), D = (L.dq || {})[q.id] || { n: 0, sum: 0 }, rivals = otherSuitors(game, q.id, p.id).length;
  const chance = clamp(P.exclBase + P.exclQ * (D.n ? D.sum / D.n : 0) + P.exclLoyal * (n.loyalty / 100) - P.exclRival * rivals, 0.05, 0.95);
  const yes = makeRng(game.seed, "excl", p.id, q.id, R.week)() < chance;
  if (!yes) { (L.exclNo = L.exclNo || {})[q.id] = R.week + P.exclCool; L.love = clamp(L.love - 6, 0, 100); return { ok: true, yes: false }; }
  q.excl = true; n.excl = p.id; L.love = clamp(L.love + 12, 0, 100);
  const story = mk(game, p, { prio: 3, abs: true, kind: "wedding", icon: "💞", head: `${p.name.toUpperCase()} AND ${q.name.toUpperCase()} GO EXCLUSIVE`, sub: `${q.name} said yes after ${L.dated[q.id]} dates. ${p.name} told the dressing room by posting a single heart. Nobody has asked what the heart means.`, fx: { fol: 1500 } });
  return { ok: true, yes: true, story };
}

// ---------- breaking up ----------
export function breakUp(game, p) {
  const L = ensureLife(game, p), q = L.partner;
  if (!q || !q.excl || L.married) return fail("Nothing to end");
  const id = q.id, name = q.name, notes = [];
  leave(game, p, id, { cool: true });
  L.love = clamp(L.love - 8, 0, 100);
  if (isHuman(id)) notes.push({ pid: hid(id), text: `${p.name} ended it with you.` });
  mk(game, p, { prio: 2, abs: true, kind: "trouble", icon: "💔", head: `${p.name.toUpperCase()} AND ${name.toUpperCase()} CALL IT QUITS`, sub: `A short statement asking for "privacy at this difficult time". The long version is in the group chat.`, fx: { fol: 800 } });
  return { ok: true, name, notes };
}

// A listed person's hidden loyalty is something you can find out after a few dates.
export function revealLoyalty(game, p, id) {
  const L = ensureLife(game, p), P = game.P.life.rom;
  if (isHuman(id) || (L.dated[id] || 0) < P.revealAt) return fail("Not yet");
  (L.know = L.know || {})[id] = true; return { ok: true };
}
export const loyaltyWord = (n) => (n >= 80 ? "devoted" : n >= 60 ? "loyal" : n >= 40 ? "wandering" : n >= 20 ? "unreliable" : "a flight risk");

// ---------- weddings ----------
export const tierOf = (game, id) => game.P.life.rom.tiers.find((t) => t.id === id) || null;
// Start (NPC) or finish (footballer) the planning: tier, matchday, guests, paid up front.
export function planWedding(game, p, { tier, day, guests = [] }, { next = 0, total = 0 } = {}) {
  const L = ensureLife(game, p), t = tierOf(game, tier), q = L.partner;
  if (!t) return fail("Pick a ceremony");
  if (L.married) return fail("Already married");
  const humanPlan = L.wed && L.wed.status === "planning" && L.wed.organiser;
  if (L.wed && !humanPlan) return fail("A wedding is already planned");
  if (!q || !q.excl) return fail("You need to be exclusive first");
  if (!humanPlan && !canMarry(game, p, q.id)) return fail(`${game.P.life.wedding.dates} dates first`);
  if (!humanPlan && isHuman(q.id)) return fail("Propose first");
  day = day | 0; if (day < next || day >= total) return fail("Pick a matchday still to come");
  if ((p.coins || 0) < t.cost) return fail("Not enough money");
  const list = (Array.isArray(guests) ? guests : []).slice(0, 40).map((g) => ({ pub: String(g.pub || "").slice(0, 12), name: String(g.name || "").slice(0, 24) }));
  p.coins -= t.cost;
  L.wed = { status: "planned", partner: q.id, organiser: true, tier: t.id, day, season: game.season, guests: list, paid: t.cost };
  const notes = [];
  if (isHuman(q.id)) { const o = user(game, hid(q.id)); if (o) { ensureLife(game, o).wed = { status: "planned", partner: uid(p), organiser: false, tier: t.id, day, season: game.season, guests: list, paid: 0 }; notes.push({ pid: o.id, text: `${p.name} has planned your wedding: a ${t.name.toLowerCase()} on matchday ${day + 1}.` }); } }
  return { ok: true, notes };
}
export function cancelWedding(game, p) {
  const L = ensureLife(game, p); if (!L.wed) return fail("Nothing planned");
  const w = L.wed, notes = [];
  if (w.status === "planned" && w.organiser) p.coins = (p.coins || 0) + Math.round((w.paid || 0) * 0.5);   // half comes back
  if (isHuman(w.partner)) { const o = user(game, hid(w.partner)); if (o && o.life) { o.life.wed = null; notes.push({ pid: o.id, text: `${p.name} called off the wedding.` }); } }
  L.wed = null; return { ok: true, notes };
}
// A new matchday starts: weddings planned for it take place. Returns the ceremonies (for the popup) and who was invited.
export function holdWeddings(game, day) {
  const R = ensureRom(game), out = []; game.weekDay = day;
  for (const p of Object.values(game.players)) {
    if (!p.user || !p.life || !p.life.wed) continue;
    const L = p.life, w = L.wed; if (w.status !== "planned" || !w.organiser || w.season !== game.season || w.day > day) continue;
    const t = tierOf(game, w.tier) || game.P.life.rom.tiers[0], q = personOf(game, w.partner);
    L.wed = null;
    if (!q || L.married) continue;
    L.married = true; L.hit.wedLeft = game.P.life.leakWeeks + 1; L.opts = null; L.love = clamp(L.love + t.love, 10, 100);
    L.partner = { ...(L.partner || { id: w.partner, name: q.name, g: q.g, partier: false }), id: w.partner, name: q.name, excl: true, dates: L.dated[w.partner] || 0, ...(q.human ? { human: q.human } : {}) };
    if (q.human) { const o = game.players[q.human], OL = ensureLife(game, o); OL.wed = null; OL.married = true; OL.hit.wedLeft = L.hit.wedLeft; OL.opts = null; OL.love = clamp(OL.love + t.love, 10, 100); OL.partner = { ...(OL.partner || {}), id: uid(p), name: p.name, g: p.gender === "F" ? "F" : "M", human: p.id, excl: true, dates: OL.dated[uid(p)] || 0 }; OL.fol += Math.round(t.fol / 2); }
    else { const n = npcState(game, w.partner); n.married = p.id; n.excl = p.id; }
    applyFx(game, p, { fol: t.fol });
    const names = (w.guests || []).map((g) => g.name).filter(Boolean);
    const ev = { id: ++R.evSeq, kind: "wedding", season: game.season, day, tier: { id: t.id, name: t.name }, at: Date.now(),
      a: { name: p.name, img: p.img, g: p.gender === "F" ? "F" : "M", pid: p.id }, b: { name: q.name, g: q.g, ...(q.human ? { img: q.img, pid: q.human } : { npc: q.id }) }, guests: names };
    R.events.push(ev); if (R.events.length > 8) R.events.shift();
    mk(game, p, { prio: 4, abs: true, kind: "wedding", icon: "💍", head: `WEDDING BELLS: ${p.name.toUpperCase()} SAYS "I DO"`, sub: `${p.name} and ${q.name} are married in a ${t.name.toLowerCase()}${names.length ? `, with ${names.length} guest${names.length === 1 ? "" : "s"} from the league` : ""}. The ${p.team != null ? game.teams[p.team].name : "club"} dressing room is "emotional". The cake has its own agent.` });
    out.push({ ev, guests: (w.guests || []).map((g) => g.pub).filter(Boolean), pids: [p.id, q.human].filter((x) => x != null) });
  }
  return out;
}

// ---------- online beef ----------
export const BEEF_MODES = ["high", "funny", "petty", "rude", "ignore"];
// A club trolled the footballer: he can answer. Called from the troll story.
export function offerBeef(game, p, team, text) {
  const L = ensureLife(game, p), R = ensureRom(game);
  if (L.beef) return null;
  L.beef = { id: (R.beefSeq = (R.beefSeq || 0) + 1), team, text: String(text || "").slice(0, 160), season: game.season };
  return L.beef;
}
export function replyBeef(game, p, mode) {
  const L = ensureLife(game, p), R = ensureRom(game), b = L.beef, P = game.P.life.beef;
  if (!b || !BEEF_MODES.includes(mode)) return fail("Nothing to answer");
  const rep = P.replies[mode], t = game.teams[b.team]; L.beef = null;
  applyFx(game, p, { fol: rep.fol, love: rep.love });
  let feud = false;
  if (rep.feud && t && p.team !== b.team && !R.feuds.some((f) => f.pid === p.id && f.team === b.team) && makeRng(game.seed, "beef", p.id, b.id, mode)() < rep.feud) { R.feuds.push({ pid: p.id, team: b.team }); feud = true; }
  L.beefLast = { mode, team: b.team, feud };
  const notes = [];
  if (feud) {
    mk(game, p, { prio: 3, abs: true, kind: "troll", icon: "🔥", head: `${p.name.toUpperCase()} V ${t.name.toUpperCase()}: IT'S PERSONAL NOW`, sub: `${p.name} answered ${t.name}'s social team with a ${mode === "rude" ? "very rude" : "very petty"} reply and the replies have not stopped. Both sides say they "don't care". Both sides have checked the fixture list.` });
  }
  return { ok: true, feud, team: b.team, notes };
}
export const feudsOf = (game) => ensureRom(game).feuds;

// ---------- a new matchday ----------
export function newWeek(game) {
  const R = ensureRom(game); R.week++;
  for (const r of R.req) if (r.status === "open" && R.week - r.week >= (r.kind === "date" ? game.P.life.rom.reqWeeks : 4)) r.status = "lapsed";   // a date lapses at kick-off; bigger questions wait a few weeks
  return R.week;
}
export { cap as _cap, thrMembers, leaveThr };
