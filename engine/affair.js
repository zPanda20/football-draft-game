// Looking after a relationship, and what happens when you do not: the bond with your partner (decays when you ignore them, so they may leave),
// the affair (a second, secret dating track with a danger meter that fills up the more you see them), divorce, and leaked DMs.
// Pure and seeded like the rest of the life engine. Every number lives in params.life.upkeep / affair / divorce / dm.
import { makeRng, clamp } from "./rng.js";
import { ensureLife, ensureRom, npcState, isHuman, personOf, leave, applyFx, mk } from "./life.js";

const hid = (id) => +String(id).slice(2);
const fem = (p) => p.gender === "F" || p.gender === "Female";
const he = (p) => (fem(p) ? "she" : "he"), his = (p) => (fem(p) ? "her" : "his");
const pick = (r, a) => a[Math.floor(r() * a.length)];
const club = (game, p) => (p.team != null ? game.teams[p.team].name : "the club");

// ---------- what a listed partner enjoys ----------
const FEEL = [["train", "training hard"], ["party", "a good party"], ["rest", "a quiet night in"]];
const likeIdx = (game, id) => Math.floor(makeRng(game.seed, "likes", id)() * FEEL.length);
export const likeOf = (game, id) => (isHuman(id) ? null : FEEL[likeIdx(game, id)][0]);
export const likeText = (game, id) => (isHuman(id) ? null : FEEL[likeIdx(game, id)][1]);

// ---------- the bond ----------
export const committed = (L) => !!(L.partner && (L.partner.excl || L.married));
export function bondOf(game, L) {
  const q = L.partner; if (!q) return null;
  if (q.bond == null) { q.bond = game.P.life.upkeep.start; q.cold = 0; }
  return q.bond;
}
export const bondWord = (b) => (b >= 75 ? "thriving" : b >= 55 ? "solid" : b >= 40 ? "cooling" : b >= 25 ? "on the rocks" : "about to break");
export const heatWord = (h) => (h < 25 ? "low" : h < 50 ? "risky" : h < 75 ? "dangerous" : "about to blow");

// Half of what was paid for a booked wedding goes back to whoever paid when it falls through.
function refundWedding(game, p) {
  const L = p.life, w = L && L.wed; if (!w || w.status !== "planned") return;
  if (w.organiser) p.coins = (p.coins || 0) + Math.round((w.paid || 0) * 0.5);
  else if (isHuman(w.partner)) { const o = game.players[hid(w.partner)]; if (o && o.life && o.life.wed && o.life.wed.paid) o.coins = (o.coins || 0) + Math.round(o.life.wed.paid * 0.5); }
}

// ---------- divorce ----------
// by: "me" (you file: nobody pays), "partner" (they walk out) or "scandal" (the affair came out): the footballer at fault pays the settlement.
export function divorce(game, p, { by = "me" } = {}) {
  const L = ensureLife(game, p), q = L.partner, D = game.P.life.divorce;
  if (!L.married || !q) return { ok: false, why: "You are not married" };
  const id = q.id, name = q.name, notes = [], r = makeRng(game.seed, "divorce", p.id, ensureRom(game).week);
  const pay = by === "me" ? 0 : Math.round((p.coins || 0) * D.share);
  if (pay) { p.coins -= pay; if (isHuman(id)) { const o = game.players[hid(id)]; if (o) o.coins = (o.coins || 0) + pay; } }
  L.married = false; L.hit.wedLeft = 0;
  if (isHuman(id)) {
    const o = game.players[hid(id)];
    if (o && o.life) { o.life.married = false; o.life.hit.wedLeft = 0; notes.push({ pid: o.id, text: by === "me" ? `${p.name} filed for divorce.` : `${p.name} is divorced from you.${pay ? ` You receive ${pay} coins in the settlement.` : ""}` }); }
  } else { const n = npcState(game, id); if (n.married === p.id) n.married = null; }
  leave(game, p, id, { cool: true }); L.love = clamp(L.love - 15, 0, 100);
  const P_ = p.name.toUpperCase(), Q_ = name.toUpperCase();
  const head = by === "me" ? pick(r, [`${P_} FILES FOR DIVORCE FROM ${Q_}`, `${P_} CALLS TIME ON THE MARRIAGE TO ${Q_}`]) : by === "scandal" ? pick(r, [`${Q_} DIVORCES ${P_} AFTER THE SCANDAL`, `MARRIAGE OVER: ${Q_} WALKS OUT ON ${P_}`]) : pick(r, [`${Q_} DIVORCES ${P_}: "YOU NEVER HAD TIME FOR ME"`, `${Q_} FILES FOR DIVORCE FROM ${P_}`]);
  const sub = by === "me" ? `A joint statement thanks everyone for "respecting their privacy". The group chat, the dog and the second-best sofa have been divided up.`
    : pick(r, [`The settlement runs to ${pay} coins and one very expensive sofa. Lawyers on both sides describe the mood as "frosty". The dog has not been told.`, `${name} has moved out, taken the good duvet and changed the wifi password. ${p.name}'s agent says ${he(p)} is "taking time to reflect".`, `Sources close to ${name} say "it was not one thing, it was everything". ${p.name} is ${by === "scandal" ? "writing a very long apology" : "learning how a dishwasher works"}.`]);
  const story = mk(game, p, { force: true, prio: 4, abs: true, kind: "wedding", src: "tmz", icon: "💔", head, sub, fx: { fol: 1800 } });
  return { ok: true, name, pay, story, notes, by };
}

// A listed partner (or the scandal) ends it: a divorce when married, otherwise a break-up. Returns { story, notes }.
export function partnerLeaves(game, p, cause) {
  const L = ensureLife(game, p), q = L.partner; if (!q) return { notes: [] };
  if (L.married) return divorce(game, p, { by: cause === "scandal" ? "scandal" : "partner" });
  const id = q.id, name = q.name, notes = [], r = makeRng(game.seed, "leaves", p.id, ensureRom(game).week);
  refundWedding(game, p);
  if (isHuman(id)) notes.push({ pid: hid(id), text: `${p.name} and you are over.` });
  leave(game, p, id, { cool: true }); L.love = clamp(L.love - 12, 0, 100);
  const P_ = p.name.toUpperCase(), Q_ = name.toUpperCase();
  const head = cause === "scandal" ? pick(r, [`${Q_} DUMPS ${P_} AFTER THE PICTURES`, `${P_} SINGLE AGAIN: ${Q_} SAW THE PHOTOS`]) : pick(r, [`${Q_} DUMPS ${P_}: "I FELT LIKE A SUBSTITUTE"`, `${P_} IS SINGLE: ${Q_} WALKS OUT`, `"NEVER AROUND": ${Q_} ENDS IT WITH ${P_}`]);
  const sub = cause === "scandal" ? `${name} has unfollowed, unfriended and, according to one source, "un-hugged". ${p.name} has a lot of free evenings now.`
    : pick(r, [`${name} says ${p.name} ${he(p)} "spent more time with the training ground than with me". The ${club(game, p)} ${p.pos} has been spotted eating cereal for dinner.`, `A cold shoulder, three unanswered texts and a pointed Instagram quote about "people who show up". ${p.name} is "looking at the calendar".`, `${name}'s friends describe it as "overdue". ${p.name}'s mates describe it as "a bit harsh". The dog has not picked a side yet.`]);
  const story = mk(game, p, { force: true, prio: 3, abs: true, kind: "trouble", src: "tmz", icon: "💔", head, sub, fx: { fol: 1200 } });
  return { story, notes };
}

// ---------- the affair ----------
export const affairView = (game, p) => {
  const L = ensureLife(game, p), a = L.affair, A = game.P.life.affair; if (!a) return null;
  return { id: a.id, name: a.name, g: a.g, dates: a.dates, love: Math.round(a.love), heat: Math.round(a.heat), word: heatWord(a.heat), active: !!a.active, chance: Math.round(catchChance(game, a.heat) * 100), canPublic: !!(a.active && a.dates >= A.publicDates && a.love >= A.publicLove) };
};
export const catchChance = (game, heat) => { const A = game.P.life.affair; return heat > A.catchFrom ? clamp(((heat - A.catchFrom) / 100) * A.catchK, 0, A.catchMax) : 0; };
// A secret date has just happened (called from runActivity): start or refresh the affair and raise the danger.
export function secretDate(game, p, date, r) {
  const L = ensureLife(game, p), A = game.P.life.affair, now = L.affair;
  const a = (L.affair = now && now.id === date.id ? now : { id: date.id, name: date.name, g: date.g, dates: 0, love: 0, heat: now ? now.heat : 0, active: true, rum: false });
  a.active = true; a.dates++; a.love = clamp(a.love + A.love + (date.good ? 6 : 0), 0, 100); a.today = true;
  a.heat = clamp(a.heat + A.heatDate + Math.floor(r() * A.heatRand) + Math.min(A.heatFame, L.fol / 50000), 0, 100);
  return a;
}
export function endAffair(game, p) {
  const L = ensureLife(game, p), a = L.affair; if (!a || !a.active) return { ok: false, why: "No affair to end" };
  a.active = false; return { ok: true, name: a.name };
}
// Caught: the tabloids get it. A partner may leave (or divorce you); if not, trust is badly hurt. The affair is over either way.
function caught(game, p, out) {
  const L = ensureLife(game, p), a = L.affair, q = L.partner, A = game.P.life.affair, R = ensureRom(game);
  const r = makeRng(game.seed, "caught", p.id, R.week), P_ = p.name.toUpperCase(), X_ = a.name.toUpperCase(), Q_ = q.name.toUpperCase(), married = L.married;
  const leaves = r() < (married ? A.leaveMarried : A.leaveExcl);
  L.affair = null; q.cheated = (q.cheated || 0) + 1;
  const head = married
    ? pick(r, [`${P_} CAUGHT WITH ${X_}: ${Q_} "DEVASTATED"`, `AFFAIR EXPOSED: ${P_} AND ${X_} ON CAMERA WHILE MARRIED TO ${Q_}`, `${P_}, ${X_} AND A VERY LONG "BUSINESS MEETING"`])
    : pick(r, [`${P_} CAUGHT WITH ${X_}: ${Q_} IS NOT AMUSED`, `${P_} SEEN WITH ${X_}. ${Q_} HAS SEEN THE PICTURES`, `SECRET FLING: ${P_} AND ${X_} CAUGHT ON CAMERA`]);
  const sub = pick(r, [`A zoom lens, a hotel corridor and a coat held up to a face that was very obviously ${p.name}'s. ${q.name} saw the pictures before breakfast. The ${club(game, p)} dressing room has gone very quiet.`, `Photographer's note: "the least subtle thing I've ever shot, and I shoot seagulls". ${p.name} says ${he(p)} was "helping ${X_.split(" ")[0][0] + X_.split(" ")[0].slice(1).toLowerCase()} with ${his(p)} tax return". Nobody is helped.`, `Fans on social media have gone through the pictures frame by frame. Verdict: guilty. ${q.name}'s only comment: "I will be speaking to my lawyer. And my mum."`, `The pictures show a restaurant, a car park and a hand that is not ${q.name}'s on ${p.name}'s back. The hand has since been identified. So has everything else.`]);
  const story = mk(game, p, { force: true, prio: 5, abs: true, kind: "camera", src: "tmz", icon: "📸", head, sub, fx: { fol: -Math.round(L.fol * 0.03) + 3500, love: -20 } });
  out.events.push({ kind: "caught", name: a.name });
  out.notes.push({ pid: p.id, text: `You were caught with ${a.name}. The papers have it.` });
  if (isHuman(q.id)) out.notes.push({ pid: hid(q.id), text: `${p.name} was caught with ${a.name} while ${married ? "married to" : "exclusive with"} you.` });
  if (leaves) { const res = partnerLeaves(game, p, "scandal"); out.notes.push(...(res.notes || [])); out.events.push({ kind: married ? "divorce" : "breakup", name: q.name }); out.notes.push({ pid: p.id, text: married ? `${q.name} divorced you.` : `${q.name} ended it with you.` }); }
  else { q.bond = Math.max(0, bondOf(game, L) - A.bondHit); out.notes.push({ pid: p.id, text: `${q.name} stays, for now. The bond between you has taken a huge hit.` }); }
  return story;
}

// A footballer leaves their partner for the affair. Needs a few secret dates and real feelings.
export function leaveForAffair(game, p) {
  const L = ensureLife(game, p), a = L.affair, A = game.P.life.affair, view = affairView(game, p), q = L.partner;
  if (!view || !view.canPublic || !q || !committed(L)) return { ok: false, why: "Not ready" };
  const r = makeRng(game.seed, "public", p.id, ensureRom(game).week), notes = [], oldName = q.name, married = L.married;
  const ended = married ? divorce(game, p, { by: "scandal" }) : partnerLeaves(game, p, "scandal");
  notes.push(...(ended.notes || []));
  const info = personOf(game, a.id) || { name: a.name, g: a.g };
  L.partner = { id: a.id, name: info.name, g: info.g, partier: false, dates: a.dates, bond: game.P.life.upkeep.start, cold: 0, ...(isHuman(a.id) ? { human: hid(a.id) } : {}) };
  L.dated[a.id] = Math.max(L.dated[a.id] || 0, a.dates); L.affair = null;
  const P_ = p.name.toUpperCase();
  const story = mk(game, p, { force: true, prio: 5, abs: true, kind: "camera", src: "tmz", icon: "🔥", head: `${P_} LEAVES ${oldName.toUpperCase()} FOR ${a.name.toUpperCase()}`, sub: pick(r, [`It is official, public and slightly unbearable. ${p.name} and ${a.name} walked into a restaurant holding hands; ${oldName} was, reportedly, "already in the car park".`, `Paparazzi call it "the cleanest exit since the 94th-minute winner". ${oldName} has changed the locks. ${a.name} has brought a toothbrush.`]), fx: { fol: 4000 } });
  return { ok: true, name: a.name, oldName, story, notes };
}

// ---------- the week ----------
// Runs after every user player's week: the bond with the partner, the affair's danger and its cooling off.
// Returns { notes: [{ pid, text }], events: [{ kind, name }] }.
export function loveWeek(game, p, { act, date, secret, together, r }) {
  const L = ensureLife(game, p), R = ensureRom(game), P = game.P.life, U = P.upkeep, A = P.affair, out = { notes: [], events: [] }, q = L.partner;
  if (q) {
    bondOf(game, L);
    const comm = committed(L); let gain = 0, touched = false;
    if (act === "date" && date && !date.secret && date.id === q.id) { gain = (date.good ? U.date.good : date.q >= 0.4 ? U.date.ok : U.date.bad) + (date.dinner ? game.P.social.invite.bond : 0); touched = true; }
    else if (together) { gain = game.P.life.rom.together.bond; touched = true; }
    else if (!isHuman(q.id) && act === likeOf(game, q.id)) { gain = U.like; touched = true; }
    if (touched) { q.bond = Math.min(100, q.bond + gain); q.cold = 0; }
    else { q.cold = (q.cold || 0) + 1; if (comm && q.cold > U.grace) q.bond = Math.max(0, q.bond - (L.married ? U.decayMarried : U.decayExcl)); }
    if (comm && q.bond < U.warnAt) {
      if (!q.warned || R.week - q.warned >= 3) { q.warned = R.week; const lk = likeText(game, q.id); out.notes.push({ pid: p.id, text: `${q.name} feels ignored (bond ${Math.round(q.bond)}). Take them on a date${lk ? ` or do something they enjoy (${lk})` : ""} soon, or this may end.` }); }
      if (q.bond < U.leaveAt && !isHuman(q.id) && makeRng(game.seed, "neglect", p.id, R.week)() < (L.married ? U.leaveMarried : U.leaveExcl)) {
        const res = partnerLeaves(game, p, "neglect"); out.notes.push(...(res.notes || [])); out.events.push({ kind: L.married ? "divorce" : "breakup", name: q.name, cause: "neglect" });
        out.notes.push({ pid: p.id, text: `${q.name} has ended it. You let the relationship fade.` });
      }
    }
  }
  let a = L.affair;
  if (!committed(L)) { if (a && !secret) L.affair = null; a = L.affair; }          // nobody to be unfaithful to
  if (a && !secret) a.heat = Math.max(0, a.heat - A.cool);
  if (a && !a.active && a.heat <= 0) { L.affair = null; a = null; }
  if (a) a.today = false;
  if (a && committed(L)) {
    if (a.heat >= A.rumourAt && !a.rum) {
      a.rum = true; const P_ = p.name.toUpperCase(), rr = makeRng(game.seed, "rum", p.id, R.week);
      mk(game, p, { force: true, prio: 3, abs: true, kind: "camera", src: "tmz", icon: "🕵️", head: pick(rr, [`WHO IS ${P_}'S MYSTERY COMPANION?`, `${P_} SPOTTED LEAVING A HOTEL BY THE BACK DOOR`, `"JUST A FRIEND"? ${P_} AND A VERY CLOSE FRIEND`]), sub: pick(rr, [`A sunglasses-at-night sighting, a taxi that did not go home and a coat held over a face. ${p.name}'s camp says it was "a work thing". Which work, they did not say.`, `Neighbours report "two sets of footsteps and one very suspicious laugh". The ${club(game, p)} ${p.pos} has "no comment", delivered at length.`]), fx: { fol: 1500 } });
      out.events.push({ kind: "rumour", name: a.name });
    }
    if (a.heat < 20) a.rum = false;
    if (a.heat > A.catchFrom && makeRng(game.seed, "catch", p.id, R.week)() < catchChance(game, a.heat)) caught(game, p, out);
  }
  return out;
}

// ---------- leaked DMs ----------
// A footballer shows the press a DM they received. `from` is the footballer who wrote it, or null when a manager did. Returns { ok, story, notes }.
export function leakDM(game, leaker, from, text, fromName) {
  const D = game.P.life.dm, quote = String(text || "").slice(0, D.max), r = makeRng(game.seed, "leak", leaker.id, quote.length, ensureRom(game).week);
  const notes = [];
  if (from) {
    const FL = ensureLife(game, from), L_ = leaker.name.toUpperCase(), F_ = from.name.toUpperCase();
    applyFx(game, leaker, { fol: D.leakFol }); applyFx(game, from, { fol: D.subjectFol, love: D.subjectLove });
    const q = FL.partner; if (q && committed(FL)) { bondOf(game, FL); q.bond = Math.max(0, q.bond - D.bondHit); }
    notes.push({ pid: from.id, text: `Your DM to ${leaker.name} was leaked to the press.` });
    const story = mk(game, from, { force: true, prio: 4, abs: true, kind: "dm", src: "tmz", icon: "📱", head: pick(r, [`LEAKED: ${F_}'S DMs HIT THE PRESS`, `${F_}'S PRIVATE MESSAGES: THE SCREENSHOTS`, `SLIDING INTO THE DMs: ${F_} CAUGHT OUT`]), sub: `A screenshot shows ${from.name} writing: "${quote}". ${leaker.name} says ${he(leaker)} "has no idea how it got out". The ${club(game, from)} press officer has gone for a lie-down.${q && committed(FL) ? ` ${q.name} has been shown the pictures.` : ""}` });
    return { ok: true, story, notes };
  }
  applyFx(game, leaker, { fol: D.leakFol });
  const story = mk(game, leaker, { force: true, prio: 3, abs: true, kind: "dm", src: "tmz", icon: "📱", head: `LEAKED: ${String(fromName || "A MANAGER").toUpperCase()}'S MESSAGE TO ${leaker.name.toUpperCase()}`, sub: `The message reads: "${quote}". ${leaker.name} insists ${he(leaker)} was "just keeping the paper informed". The paper, for its part, has never been better informed.` });
  return { ok: true, story, notes };
}
