// Relationships between footballers and the people they date, shared across the room (see ensureRom in life.js):
// asking another footballer out, going exclusive, thrupples, breaking up, weddings as events, and answering online beef.
// Every function returns { ok, why?, notes? }. `notes` are messages for other footballers: [{ pid, text }].
import { makeRng } from "./rng.js";
import { beefRel } from "./clubrel.js";
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
export const TOGETHER = { party: "go out partying", train: "train", rest: "have a quiet night in", date: "go on a date" };
export function sendRequest(game, p, toPid, kind, act) {
  const R = ensureRom(game), P = game.P.life.rom, L = ensureLife(game, p), q = user(game, toPid);
  if (!q || q.id === p.id) return fail("Not a player");
  const QL = ensureLife(game, q);
  if (open(R).some((r) => r.from === p.id && r.to === q.id && r.kind === kind && (kind !== "act" || r.act === act))) return fail("Already asked");
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
    if (QL.wed || QL.married) return fail("A wedding is already on");
    const s = proposalState(game, p); if (!s.can) return fail(s.why);
  } else if (kind === "act") {                                              // an activity together: only partners who are both footballers
    if (!TOGETHER[act]) return fail("unknown");
    if (!L.partner || L.partner.id !== uid(q) || !QL.partner || QL.partner.id !== uid(p)) return fail("You can only do this with your partner");
    if (act === "party" && (p.susp > 0 || q.susp > 0)) return fail("Someone is suspended");
    if ((p.coins || 0) < actCost(game, p, act) * (act === "date" ? P.dateMult : 1)) return fail("You cannot afford it");
  } else return fail("unknown");
  const r = { id: ++R.reqSeq, kind, from: p.id, to: q.id, status: "open", season: game.season, week: R.week, ...(kind === "act" ? { act } : {}) };
  R.req.push(r); if (R.req.length > 60) R.req.splice(0, R.req.length - 60);
  return { ok: true, req: r, notes: [{ pid: q.id, text: `${p.name} ${kind === "act" ? `asks you to ${TOGETHER[act]} together` : { date: "asks you out on a date", excl: "asks you to go exclusive", thr: "asks to be in a thrupple with you", wed: "asks you to marry them" }[kind]}.` }] };
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
  } else if (r.kind === "act") {
    const q = L.partner, QA = AL.partner;
    if (!q || q.id !== uid(a) || !QA || QA.id !== uid(p)) { r.status = "lapsed"; return fail("You are not together any more"); }
    if (r.act === "party" && (p.susp > 0 || a.susp > 0)) { r.status = "lapsed"; return fail("Someone is suspended"); }
    if (r.act === "date") {
      if ((a.coins || 0) < actCost(game, a, "date") * P.dateMult) { r.status = "lapsed"; return fail(`${a.name} can no longer afford it`); }
      setJoint(game, a, p);
    } else {
      if ((a.coins || 0) < actCost(game, a, r.act)) { r.status = "lapsed"; return fail(`${a.name} can no longer afford it`); }
      if ((p.coins || 0) < actCost(game, p, r.act)) return fail("You cannot afford it");
      cancelJoint(game, a); cancelJoint(game, p);
      L.act = { act: r.act, partner: uid(a), joint: { together: true } };
      AL.act = { act: r.act, partner: uid(p), joint: { together: true } };
    }
    r.status = "accepted";
    notes.push({ pid: a.id, text: `${p.name} said yes: you ${TOGETHER[r.act]} together this week.` });
  } else if (r.kind === "excl") {
    r.status = "accepted";
    for (const [x, y] of [[a, p], [p, a]]) { const XL = ensureLife(game, x); XL.partner = { ...(XL.partner || { id: uid(y), name: y.name, g: y.gender === "F" ? "F" : "M", human: y.id, partier: false }), excl: true }; XL.love = clamp(XL.love + 10, 0, 100); }
    mk(game, a, { prio: 3, abs: true, kind: "wedding", icon: "💞", head: `${a.name.toUpperCase()} AND ${p.name.toUpperCase()} GO EXCLUSIVE`, sub: `They have told their followers, then each other, then their agents. The wedding page of the paper has cleared some room.`, fx: { fol: 1500 } });
    notes.push({ pid: a.id, text: `${p.name} said yes: you are exclusive.` });
  } else if (r.kind === "wed") {
    r.status = "accepted";
    AL.wed = { status: "planning", partner: uid(p), organiser: true }; L.wed = { status: "planning", partner: uid(a), organiser: false };
    AL.love = clamp(AL.love + 8, 0, 100); L.love = clamp(L.love + 8, 0, 100);
    mk(game, a, engagedStory(a, p));
    notes.push({ pid: a.id, text: `${p.name} said YES! You are engaged. Agree the wedding together in your Relationships panel: type, date and guest list. You pay.` });
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
  if (L.wed) { const c = cancelWedding(game, p); notes.push(...(c.notes || [])); }
  leave(game, p, id, { cool: true });
  L.love = clamp(L.love - 8, 0, 100);
  if (isHuman(id)) notes.push({ pid: hid(id), text: `${p.name} ended it with you.` });
  mk(game, p, { prio: 2, abs: true, kind: "trouble", icon: "💔", head: `${p.name.toUpperCase()} AND ${name.toUpperCase()} CALL IT QUITS`, sub: `A short statement asking for "privacy at this difficult time". The long version is in the group chat.`, fx: { fol: 800 } });
  return { ok: true, name, notes };
}

// ---------- proposals ----------
const engagedStory = (a, b) => ({ prio: 3, abs: true, kind: "wedding", icon: "💍", head: `${a.name.toUpperCase()} AND ${b.name.toUpperCase()} ARE ENGAGED`, sub: `The ring has been photographed from four angles. The group chat has been told first, then the agents, then, eventually, the families.`, fx: { fol: 2500 } });
// Unlocked once you are exclusive and have been out often enough (P.life.wedding.dates). A listed person also needs time after a no.
export function proposalState(game, p) {
  const L = ensureLife(game, p), R = ensureRom(game), q = L.partner;
  if (L.married) return { can: false, why: "Already married" };
  if (!q) return { can: false, why: "Date someone first" };
  if (L.wed) return { can: false, why: "Already engaged" };
  if (!q.excl) return { can: false, why: "Go exclusive first" };
  const need = game.P.life.wedding.dates, have = L.dated[q.id] || 0;
  if (have < need) return { can: false, why: `${need - have} more date${need - have === 1 ? "" : "s"} together first` };
  const wait = ((L.propNo || {})[q.id] || 0) - R.week;
  if (!isHuman(q.id) && wait > 0) return { can: false, why: `${q.name} needs more time (about ${wait} more week${wait === 1 ? "" : "s"})`, wait };
  return { can: true };
}
// How it has been going: the dates, love, loyalty and cheating all count.
export function proposalChance(game, p, id) {
  const L = ensureLife(game, p), P = game.P.life.rom, D = (L.dq || {})[id] || { n: 0, good: 0, sum: 0 }, n = isHuman(id) ? null : npcState(game, id);
  const q = D.n ? D.sum / D.n : 0.4, goodShare = D.n ? D.good / D.n : 0, loyal = n ? n.loyalty / 100 : 0.6, cheated = ((L.partner && L.partner.id === id && L.partner.cheated) || 0) > 0 ? 1 : 0;
  return clamp(P.propBase + P.propQ * q + P.propLove * (L.love / 100) + P.propLoyal * loyal + P.propGood * goodShare - P.propCheat * cheated, 0.05, 0.95);
}
export const oddsWord = (c) => (c >= 0.75 ? "very likely" : c >= 0.55 ? "a good chance" : c >= 0.35 ? "uncertain" : "unlikely");
// Propose to a listed person. A yes means you are engaged and can plan the wedding. A no may end the relationship, otherwise they need more time.
export function propose(game, p) {
  const L = ensureLife(game, p), R = ensureRom(game), P = game.P.life.rom, q = L.partner;
  if (q && isHuman(q.id)) return fail("Ask them with a request");
  const s = proposalState(game, p); if (!s.can) return fail(s.why);
  const chance = proposalChance(game, p, q.id), rng = makeRng(game.seed, "prop", p.id, q.id, R.week);
  if (rng() < chance) {
    L.wed = { status: "planning", partner: q.id, organiser: true }; L.love = clamp(L.love + 8, 0, 100);
    const story = mk(game, p, engagedStory(p, q));
    return { ok: true, yes: true, story };
  }
  const dumped = rng() < clamp(P.propDump + P.propDumpLow * (1 - chance), 0, 0.9), name = q.name;
  if (dumped) {
    leave(game, p, q.id, { cool: true }); L.love = clamp(L.love - 14, 0, 100);
    const story = mk(game, p, { force: true, prio: 3, abs: true, kind: "trouble", icon: "💔", head: `${p.name.toUpperCase()} PROPOSES. ${name.toUpperCase()} LEAVES`, sub: `The ring stayed in its box. ${name} left the restaurant before the main course and the waiter has been asked not to talk about it.`, fx: { fol: 1200 } });
    return { ok: true, yes: false, dumped: true, name, story };
  }
  (L.propNo = L.propNo || {})[q.id] = R.week + P.propCool; L.love = clamp(L.love - 4, 0, 100);
  return { ok: true, yes: false, dumped: false, name, weeks: P.propCool };
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
const cleanGuests = (guests) => (Array.isArray(guests) ? guests : []).slice(0, 40).map((g) => ({ pub: String(g.pub || "").slice(0, 12), name: String(g.name || "").slice(0, 24) }));
// The person who proposed pays; with a listed partner the wedding is booked at once, with another footballer the plan must be agreed first.
const payerOf = (game, p) => { const L = ensureLife(game, p), w = L.wed; if (!w) return null; return w.organiser ? p : user(game, hid(w.partner)); };
function book(game, payer, plan) {
  const L = ensureLife(game, payer), t = tierOf(game, plan.tier), q = L.partner, notes = [];
  payer.coins -= t.cost;
  L.wed = { status: "planned", partner: q.id, organiser: true, tier: t.id, day: plan.day, season: game.season, guests: plan.guests, paid: t.cost };
  if (isHuman(q.id)) { const o = user(game, hid(q.id)); if (o) { ensureLife(game, o).wed = { status: "planned", partner: uid(payer), organiser: false, tier: t.id, day: plan.day, season: game.season, guests: plan.guests, paid: 0 }; notes.push({ pid: o.id, text: `Your wedding is booked: a ${t.name.toLowerCase()} on matchday ${plan.day + 1}, paid for by ${payer.name}.` }); } }
  return notes;
}
// A footballer picks the type, matchday and guests. NPC partner: booked and paid. Footballer partner: sent to them to agree.
export function planWedding(game, p, { tier, day, guests = [] }, { next = 0, total = 0 } = {}) {
  const L = ensureLife(game, p), t = tierOf(game, tier), q = L.partner;
  if (!t) return fail("Pick a ceremony");
  if (L.married) return fail("Already married");
  if (!L.wed) return fail("Propose first");
  if (L.wed.status === "planned") return fail("A wedding is already booked");
  if (L.wed.status === "agreeing") return fail("A plan is already waiting for an answer");
  if (!q || !q.excl) return fail("You need to be exclusive first");
  day = day | 0; if (day < next || day >= total) return fail("Pick a matchday still to come");
  const list = cleanGuests(guests), payer = payerOf(game, p);
  if (!payer || (payer.coins || 0) < t.cost) return fail(payer === p ? "Not enough money" : `${payer ? payer.name : "Your partner"} cannot afford that one`);
  if (isHuman(q.id)) {
    const o = user(game, hid(q.id)); if (!o) return fail("They are gone");
    const plan = { tier: t.id, day, guests: list, by: p.id };
    L.wed.status = "agreeing"; L.wed.plan = plan; const OL = ensureLife(game, o); OL.wed = OL.wed || { status: "planning", partner: uid(p), organiser: !L.wed.organiser }; OL.wed.status = "agreeing"; OL.wed.plan = plan;
    return { ok: true, sent: true, notes: [{ pid: o.id, text: `${p.name} suggests a ${t.name.toLowerCase()} on matchday ${day + 1}${list.length ? ` with ${list.length} guest${list.length === 1 ? "" : "s"}` : ""}. Agree to it, or suggest changes, in your Relationships panel.` }] };
  }
  return { ok: true, notes: book(game, p, { tier: t.id, day, guests: list }), booked: true };
}
// The other footballer answers a plan: yes books and pays; no sends it back to planning.
export function answerPlan(game, p, yes, { next = 0, total = 0 } = {}) {
  const L = ensureLife(game, p), w = L.wed; if (!w || w.status !== "agreeing" || !w.plan) return fail("Nothing to agree");
  if (w.plan.by === p.id) return fail("Wait for their answer");
  const o = user(game, hid(w.partner)), pl = w.plan;
  const reset = () => { for (const x of [p, o]) if (x && x.life && x.life.wed) { x.life.wed.status = "planning"; x.life.wed.plan = null; } };
  if (!o) { L.wed = null; return fail("They are gone"); }
  if (!yes) { reset(); return { ok: true, yes: false, notes: [{ pid: o.id, text: `${p.name} wants the wedding planned differently. Try again.` }] }; }
  const t = tierOf(game, pl.tier), payer = payerOf(game, p);
  if (pl.day < next || pl.day >= total) { reset(); return fail("That matchday has gone. Plan it again."); }
  if (!t || !payer || (payer.coins || 0) < t.cost) { reset(); return fail(`${payer ? payer.name : "Nobody"} cannot afford it now. Plan it again.`); }
  const notes = book(game, payer, { tier: t.id, day: pl.day, guests: pl.guests });
  notes.push({ pid: o.id, text: `${p.name} agreed: your wedding is booked for matchday ${pl.day + 1}!` });
  return { ok: true, yes: true, notes, booked: true, plan: pl };
}
// Take back a plan nobody has answered yet.
export function withdrawPlan(game, p) {
  const L = ensureLife(game, p), w = L.wed; if (!w || w.status !== "agreeing" || !w.plan || w.plan.by !== p.id) return fail("Nothing to take back");
  const o = user(game, hid(w.partner));
  for (const x of [p, o]) if (x && x.life && x.life.wed) { x.life.wed.status = "planning"; x.life.wed.plan = null; }
  return { ok: true };
}
export function cancelWedding(game, p) {
  const L = ensureLife(game, p); if (!L.wed) return fail("Nothing planned");
  const w = L.wed, notes = [];
  if (w.status === "planned") {                                  // half the money comes back to whoever paid
    const payer = w.organiser ? p : user(game, hid(w.partner)), paid = w.organiser ? w.paid : payer && payer.life && payer.life.wed ? payer.life.wed.paid : 0;
    if (payer) payer.coins = (payer.coins || 0) + Math.round((paid || 0) * 0.5);
  }
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
// What the papers print when a footballer answers a club's trolling. Each way of answering has a few versions (picked by the seed); the replies are quoted.
const BEEF_STORY = {
  high: [
    { icon: "🕊️", head: (p, t) => `${p} RISES ABOVE IT: A CALM REPLY TO ${t}`, sub: (p, t) => `${t}'s social team asked for a reaction. ${p} sent a short, classy message and went back to training. The comments call it "painfully mature". Several ${t} fans are, apparently, in therapy.` },
    { icon: "🕊️", head: (p, t) => `${p} KILLS ${t} WITH KINDNESS`, sub: (p, t) => `"Wishing everyone at ${t} a lovely week and a better offside trap." Thirty thousand likes, one pair of very tight jaws at ${t}'s head office, and a pointed "thanks for the exposure".` },
    { icon: "🕊️", head: (p, t) => `${p} DROPS THE MIC, THEN PICKS IT UP AND APOLOGISES TO IT`, sub: (p, t) => `The reply to ${t} was so polite that it is being studied by diplomats. "It is a little concerning how much they care," says one fan. "It is a lot concerning how little we do."` },
  ],
  funny: [
    { icon: "😂", head: (p, t) => `${p} HITS BACK AT ${t} WITH A JOKE ABOUT THEIR BACK LINE`, sub: (p, t) => `"Your defence has more gaps than a teenager's CV and less coverage than a nudist beach. See you next season." ${t}'s original post has been quietly deleted. The deletion has been screenshotted.` },
    { icon: "😂", head: (p, t) => `"WE ALL SAW WHAT ${p} DID TO ${t}'S BACK LINE": REPLY GOES VIRAL`, sub: (p, t) => `"Funny coming from a club whose attack has been finishing earlier than my last ex. Wasn't bad, though. For the first thirty seconds." The post has more shares than ${t}'s season ticket sales.` },
    { icon: "😂", head: (p, t) => `${p} SLIDES INTO ${t}'S REPLIES WITH A BANGER`, sub: (p, t) => `The one-liner: "Thanks for the roast. I'd offer you some ointment, but I see you've already got the burn." ${t}'s admin has replied "😐". ${p} has replied "🧯". The internet has declared a winner.` },
  ],
  petty: [
    { icon: "🙄", head: (p, t) => `${p} GETS PETTY WITH ${t} ONLINE`, sub: (p, t) => `A sarcastic reply, a screenshot of an old result and a very specific peach emoji. ${t}'s social team has "noted" it. Both dressing rooms have seen it. One of them is giggling.` },
    { icon: "🙄", head: (p, t) => `${p} DIGS UP ${t}'S OLDEST TWEETS, AND THEIR WORST SEASON`, sub: (p, t) => `"Remind me when ${t} last scored from open play. I'll wait. I've got all night, which is more than your striker's got." The thread runs to eighty-one posts and a spreadsheet.` },
    { icon: "🙄", head: (p, t) => `${p} LIKES EVERY POST CALLING ${t} A DISGRACE`, sub: (p, t) => `No reply, no quote, just four hundred likes in a row and a thumbs-up on a meme of ${t}'s goalkeeper. A spokesperson says ${p} "has no idea how his thumb did that". It did.` },
  ],
  rude: [
    { icon: "🔥", head: (p, t) => `${p} ROASTS ${t}: THE INTERNET IS ON FIRE`, sub: (p, t) => `"Your midfield is like a sauna: lots of steam, no cover and everyone leaves sweaty and disappointed." Shared a million times before lunch. Somebody at ${t} has "gone for a walk". Possibly a long one.` },
    { icon: "🔥", head: (p, t) => `${p} TO ${t}: "THAT WAS ABOUT AS EFFECTIVE AS A ONE-MINUTE MAN AT A NINETY-MINUTE PARTY"`, sub: (p, t) => `The reply, which cannot be printed in full in this newspaper, ran to four paragraphs and a gif of a bin. ${t} have answered with a single "mate". The league has asked everyone to calm down. Nobody has.` },
    { icon: "🔥", head: (p, t) => `NO MERCY: ${p} FRIES ${t} IN TWO SENTENCES`, sub: (p, t) => `"You've got more people on your payroll than fans in your stadium, and the fans are still the better strikers. Cheers, hope the sausage roll was worth it." ${t} have reportedly "turned off the phone and the lights".` },
  ],
};
// The footballer answers a club that trolled him. Any answer except ignoring it makes the news for the whole lobby.
export function replyBeef(game, p, mode) {
  const L = ensureLife(game, p), R = ensureRom(game), b = L.beef, P = game.P.life.beef;
  if (!b || !BEEF_MODES.includes(mode)) return fail("Nothing to answer");
  const rep = P.replies[mode], t = game.teams[b.team]; L.beef = null;
  applyFx(game, p, { fol: rep.fol, love: rep.love });
  let feud = false;
  if (rep.feud && t && p.team !== b.team && !R.feuds.some((f) => f.pid === p.id && f.team === b.team) && makeRng(game.seed, "beef", p.id, b.id, mode)() < rep.feud) { R.feuds.push({ pid: p.id, team: b.team }); feud = true; }
  L.beefLast = { mode, team: b.team, feud, rel: t ? beefRel(game, p, b.team, mode, feud) : 0 };
  let story = null;
  if (mode !== "ignore" && t) {
    const P_ = p.name.toUpperCase(), T_ = t.name.toUpperCase(), list = BEEF_STORY[mode], bs = list[Math.floor(makeRng(game.seed, "beefq", p.id, b.id, mode)() * list.length)];
    const FEUD = [`${p.name} answered ${t.name}'s social team with a ${mode === "rude" ? "very rude" : "very petty"} reply and the replies have not stopped. Both sides say they "don't care". Both sides have checked the fixture list, the group chat and, in one case, a lawyer.`,
      `It started with a post, continued with a gif and has now reached the stage where ${t.name}'s kit man has been tagged. ${p.name} says "I'm not angry, I'm just thorough". The next meeting between the clubs has been described as "must-see, must-record, must-not-attend".`];
    story = feud
      ? mk(game, p, { force: true, prio: 3, abs: true, kind: "troll", icon: "🔥", head: `${P_} V ${T_}: IT'S PERSONAL NOW`, sub: FEUD[Math.floor(makeRng(game.seed, "feudq", p.id, b.id)() * FEUD.length)] })
      : mk(game, p, { force: true, prio: 2, abs: true, kind: "troll", icon: bs.icon, head: bs.head(P_, T_), sub: bs.sub(p.name, t.name) });
  }
  return { ok: true, feud, team: b.team, mode, story, notes: [] };
}
export const feudsOf = (game) => ensureRom(game).feuds;

// ---------- a new matchday ----------
export function newWeek(game) {
  const R = ensureRom(game); R.week++;
  for (const r of R.req) if (r.status === "open" && R.week - r.week >= (r.kind === "date" ? game.P.life.rom.reqWeeks : 4)) r.status = "lapsed";   // a date lapses at kick-off; bigger questions wait a few weeks
  return R.week;
}
export { cap as _cap, thrMembers, leaveThr };
