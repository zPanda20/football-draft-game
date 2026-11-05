// WAG mode, stage 1: a third kind of person in the room. A WAG is not a footballer: no squad place, no contract, no wages, no match stats.
// Identities (all strings, all stable): "w1" a WAG, "f:12" a named roster footballer (an ordinary player record, simulated), "u:5" a human-created footballer.
// State lives in game.wag (saved with the game; old saves simply have none). Couples live in ONE registry (wag.pairs) that both sides read.
// Weekly loop: choices are made in md.lineup; kickoff() settles them once; afterMatch() resolves a match attendance once, after full time.
import { makeRng, shuffle } from "./rng.js";
import { ensureSoc, memOf, remember, fondOf, addFond, variant, deskStory, openThread } from "./social.js";
import { ensureLife, ensureRom, applyFx, PARTNER_LIST, partnerById } from "./life.js";
import { SEQ } from "./wagseq.js";

const up = (s) => String(s).toUpperCase();
const fail = (why) => ({ ok: false, why });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isWag = (id) => typeof id === "string" && /^w\d+$/.test(id);
export const isFb = (id) => typeof id === "string" && id.startsWith("f:");
export const isHumanFb = (id) => typeof id === "string" && id.startsWith("u:");
export const pidOf = (id) => +String(id).slice(2);
export const fbId = (pid) => "f:" + pid;
export const isNpc = (id) => typeof id === "string" && id.startsWith("n:");        // "n:sofia-marquez": a dating partner who is not a player (the same people footballers meet)
export const npcSlug = (id) => String(id).slice(2);

export function ensureWag(game) {
  if (!game.wag) game.wag = {};
  const W = game.wag; W.seq = W.seq || 0; W.list = W.list || {}; W.pairs = W.pairs || {}; W.req = W.req || []; W.reqSeq = W.reqSeq || 0; W.ledger = W.ledger || []; W.kick = W.kick || "";
  return W;
}
// Older records (saved before the WAG week) get the new fields the first time they are looked at.
function norm(game, w) {
  if (w && w.brand === undefined) { const P = game.P.social.wag; w.brand = P.startBrand; w.rapport = P.startRapport; w.biz = { lvl: 0, prog: 0 }; w.match = null; w.sq = null; w.cnt = { attend: 0, date: 0, content: 0, quiet: 0, ...(w.cnt || {}), party: 0, business: 0 }; }
  return w;
}
export const wagOf = (game, id) => norm(game, (game.wag && game.wag.list[id]) || null);
export const wagList = (game) => (game.wag ? Object.values(game.wag.list).map((w) => norm(game, w)) : []);
const day0 = (game) => game.weekDay ?? 0;
const K = (game) => game.P.social.wag;
const spend = (game, w, n, why) => { n = Math.max(0, Math.round(n)); w.coins = Math.max(0, w.coins - n); const W = ensureWag(game); W.ledger.push({ s: game.season, d: day0(game), w: w.id, n: -n, why }); if (W.ledger.length > 60) W.ledger.shift(); return n; };
const earn = (game, w, n, why) => { n = Math.max(0, Math.round(n)); w.coins += n; const W = ensureWag(game); W.ledger.push({ s: game.season, d: day0(game), w: w.id, n, why }); if (W.ledger.length > 60) W.ledger.shift(); return n; };

// ---------- creating a WAG ----------
// An adult with a profile and a small purse. The record has no football fields at all.
export function createWag(game, { token = null, name, gender, img }) {
  const W = ensureWag(game), id = "w" + ++W.seq, P = K(game);
  const w = { id, name: String(name || "WAG").trim().slice(0, 22) || "WAG", g: gender === "M" ? "M" : "F", img: img || null, age: P.age, coins: P.startCoins, fol: P.startFol, act: null, attending: null, contacts: [], last: null,
    cnt: { attend: 0, date: 0, content: 0, quiet: 0, party: 0, business: 0 }, brand: P.startBrand, rapport: P.startRapport, biz: { lvl: 0, prog: 0 }, match: null, sq: null, content: { season: game.season, n: 0 }, gifts: { week: -1, n: 0, by: {} }, life: { fav: {}, giftAt: {} }, since: { season: game.season, day: day0(game) }, support: null };
  W.list[id] = w; return w;
}

// ---------- people: who a WAG can meet ----------
// A named roster footballer (an ordinary player record): social life follows the real player. Human footballers answer for themselves.
export function fbOk(game, pid) { const p = game.players[pid]; return !!p && !p.user && !p.retired && (p.age || 20) >= 18; }
export function humanOk(game, pid) { const p = game.players[pid]; return !!p && !!p.user && !p.retired; }
export function personOf(game, id) {
  if (isFb(id)) { const p = game.players[pidOf(id)]; return p ? { id, name: p.name, team: p.team ?? null, pos: p.pos, ovr: p.ovr, g: p.gender === "F" ? "F" : "M", human: false, ok: fbOk(game, p.id) } : null; }
  if (isHumanFb(id)) { const p = game.players[pidOf(id)]; return p ? { id, name: p.name, team: p.team ?? null, pos: p.pos, ovr: p.ovr, g: p.gender === "F" ? "F" : "M", human: true, ok: humanOk(game, p.id), img: p.img } : null; }
  if (isNpc(id)) { const x = partnerById(npcSlug(id)); return x ? { id, name: x.name, team: null, g: x.g, human: false, ok: true, npc: true, slug: x.id } : null; }
  if (isWag(id)) { const w = wagOf(game, id); return w ? { id, name: w.name, team: null, g: w.g, human: true, ok: true, img: w.img, wag: true } : null; }
  return null;
}
// Taken: a human footballer who is exclusive or married is not dating anyone else. A roster footballer already seeing a WAG is taken by that WAG.
export function committed(game, id) {
  if (isHumanFb(id)) { const p = game.players[pidOf(id)], L = p && p.life; return !!(L && (L.married || (L.partner && L.partner.excl))); }
  return false;
}
// A couple is one record, whoever looks at it.
export const pairKey = (w, o) => w + "|" + o;
export const pairOf = (game, w, o) => ensureWag(game).pairs[pairKey(w, o)] || null;
export function seeingOf(game, id) {        // who is a person currently seeing: [{w, pair}]
  const out = []; for (const pr of Object.values(ensureWag(game).pairs)) if (pr.status === "seeing" && (pr.o === id || pr.w === id)) out.push(pr); return out;
}
export const takenBy = (game, id) => { if (!isFb(id)) return null; const s = seeingOf(game, id)[0]; return s ? s.w : null; };

// Two roster footballers "on the scene" each matchday: the market is never empty because attendance did not pay off.
export function scene(game, w, day) {
  const r = makeRng(game.seed, "wagScene", w.id, game.season, day);
  const pool = Object.values(game.players).filter((p) => fbOk(game, p.id) && p.team != null && !takenBy(game, fbId(p.id)) && !(w.contacts || []).some((c) => c.id === fbId(p.id)));
  pool.sort((a, b) => b.ovr - a.ovr || a.id - b.id);
  const top = pool.slice(0, 60); return shuffle(top, r).slice(0, K(game).attend.scene).map((p) => fbId(p.id));
}
export const activeContacts = (w, day) => (w.contacts || []).filter((c) => c.from <= day && c.until >= day);
// Who a WAG may invite this matchday: contacts, the scene, and anyone they are already seeing.
export function reachable(game, w, id, day) {
  if (!id) return false;
  if (pairOf(game, w.id, id) && pairOf(game, w.id, id).status === "seeing") return true;
  if (activeContacts(w, day).some((c) => c.id === id)) return true;
  return isFb(id) && scene(game, w, day).includes(id);
}

// ---------- the weekly choice ----------
// Two separate choices. (1) What you do this week: a date, a night out, a quiet night in, content or your business. (2) Optionally, a match to go to and who to support.
// Content, a night out and business become a short sequence while the matches are on, unless you chose to go to a match (then they are a quick version).
export const ACTS = { date: "Go on a date", party: "Go out partying", quiet: "A quiet night in", content: "Shoot content", business: "Build a business" };
export const costOf = (game, act) => ({ date: K(game).cost.date, party: K(game).cost.party }[act] || 0);
export function contentPay(game, w) { const P = K(game).content; return Math.min(P.maxPay, P.base + Math.floor(w.fol / P.folDiv) + Math.floor(w.brand * P.brandPay)); }
function contentLeft(game, w) { const P = K(game).content; if (w.content.season !== game.season) w.content = { season: game.season, n: 0 }; return Math.max(0, P.perSeason - w.content.n); }
// Free the human footballer a WAG had booked a date with (and the other way round).
export function releaseBooking(game, w, why) {
  const notes = []; const a = w.act; if (!a || a.act !== "date" || !isHumanFb(a.partner)) { return notes; }
  const p = game.players[pidOf(a.partner)];
  if (p && p.life && p.life.act && p.life.act.wag === w.id) { p.life.act = null; if (why) notes.push({ pid: p.id, text: why }); }
  return notes;
}
// The week's people who are not players: three, both genders, the same every time the same WAG looks that matchday.
export function npcOpts(game, w, day) {
  const r = makeRng(game.seed, "wagNpc", w.id, game.season, day), n = K(game).npc.pool, all = shuffle(PARTNER_LIST.slice(), r), out = all.slice(0, n);
  if (n >= 2 && out.every((x) => x.g === out[0].g)) { const o = all.slice(n).find((x) => x.g !== out[0].g); if (o) out[n - 1] = o; }
  return out;
}
export function setAct(game, w, c, { day }) {
  const P = K(game), act = c && c.act;
  if (!ACTS[act]) return fail("Pick something to do.");
  const notes = [];
  if (act !== "date") {
    if (act === "content" && contentLeft(game, w) <= 0) return fail(`You have made all ${P.content.perSeason} pieces of content you can for this season.`);
    if (act === "party" && w.coins < P.cost.party) return fail(`A night out costs ${P.cost.party} coins.`);
    notes.push(...releaseBooking(game, w, `${w.name} cancelled your date.`)); w.act = { act }; return { ok: true, notes };
  }
  // date: someone from the pool who is not a player (settled at kick-off), a roster footballer (settled at kick-off, rivals compete) or a human footballer who has already said yes (set by the request, not here)
  const id = String(c.partner || "");
  if (isHumanFb(id)) { if (w.act && w.act.act === "date" && w.act.partner === id) return { ok: true, notes }; return fail("Ask them first: a human footballer has to say yes."); }
  if (isNpc(id)) {
    if (!npcOpts(game, w, day).some((x) => x.id === npcSlug(id))) return fail("They are not in your pool this week.");
    if (w.coins < P.cost.dateNpc) return fail(`A date costs ${P.cost.dateNpc} coins.`);
    notes.push(...releaseBooking(game, w, `${w.name} cancelled your date.`)); w.act = { act: "date", partner: id }; return { ok: true, notes };
  }
  const pe = personOf(game, id); if (!pe || !pe.ok || !isFb(id)) return fail("Pick someone you can invite.");
  if (!reachable(game, w, id, day)) return fail("You have not met them: invite someone you have a contact with, or from the scene.");
  const t = takenBy(game, id); if (t && t !== w.id) return fail(`${pe.name} is seeing someone.`);
  if (w.coins < P.cost.date) return fail(`A date costs ${P.cost.date} coins.`);
  notes.push(...releaseBooking(game, w, `${w.name} cancelled your date.`));
  w.act = { act: "date", partner: id }; return { ok: true, notes };
}
export const clearAct = (game, w) => { const notes = releaseBooking(game, w, `${w.name} cancelled your date.`); w.act = null; return notes; };
// The match is its own choice: a ticket (paid once, at kick-off), a team to support and, if you like, a player you hope to meet.
export function setMatch(game, w, c, { fixtures }) {
  const P = K(game), f = (fixtures || [])[c && c.fixture | 0]; if (!f) return fail("Pick a match.");
  const team = c.team | 0; if (team !== f[0] && team !== f[1]) return fail("Pick one of the two teams.");
  if (w.coins < P.cost.attend) return fail(`A ticket costs ${P.cost.attend} coins.`);
  let target = c.target || null;
  if (target) { const pe = personOf(game, target); if (!pe || !pe.ok || pe.team !== team || pe.npc) return fail("They do not play for that team."); if (isHumanFb(target) && committed(game, target)) target = null; }
  w.match = { fixture: c.fixture | 0, match: [f[0], f[1]], team, target }; return { ok: true };
}
export const clearMatch = (w) => { w.match = null; };

// ---------- date quality, bonds ----------
function dateScore(game, w, id, day) {
  const P = K(game), pr = pairOf(game, w.id, id), D = (w.life.dq || {})[id] || { n: 0, good: 0 }, m = memOf(game, w.id), turned = m.rej.filter((x) => x.id === id && game.season - x.season <= 0 && day - (x.day ?? 0) <= P.date.rejRecover).length;
  let s = 0.3 + Math.min(0.15, w.fol / 400000) + Math.min(0.1, w.brand * 0.001) + Math.min(0.1, w.rapport * 0.001) + (activeContacts(w, day).some((c) => c.id === id) ? P.date.contactBonus : 0) + Math.min(0.12, fondOf(game, w, id) / game.P.social.gift.fondQ) + Math.min(0.15, D.good * 0.05) + (pr && pr.status === "seeing" ? 0.1 : 0) - turned * 0.08;
  s += (makeRng(game.seed, "wagDate", w.id, id, game.season, day)() - 0.5) * 0.3;
  return +s.toFixed(3);
}
function bumpPair(game, w, id, { good, day }) {
  const W = ensureWag(game), P = K(game).date, k = pairKey(w.id, id);
  let pr = W.pairs[k]; if (!pr || pr.status !== "seeing") pr = W.pairs[k] = { w: w.id, o: id, status: "seeing", dates: 0, good: 0, bond: P.bondStart, since: { season: game.season, day }, last: day };
  pr.dates++; if (good) pr.good++; pr.bond = clamp(pr.bond + (good ? P.bondGood : P.bondBad), 0, 100); pr.last = day; return pr;
}
function endPair(game, pr, why, notes) {
  if (pr.status !== "seeing") return; pr.status = "ended"; pr.ended = { season: game.season, why };
  const w = wagOf(game, pr.w), pe = personOf(game, pr.o);
  if (w && pe) { remember(game, w.id, "ex", { id: pr.o, name: pe.name, why }); if (isHumanFb(pr.o)) remember(game, pidOf(pr.o), "ex", { id: w.id, name: w.name, why }); }
  if (w && pe) { notes.push({ wag: w.id, text: `It is over between you and ${pe.name}${why ? ` (${why})` : ""}.` }); if (isHumanFb(pr.o)) notes.push({ pid: pidOf(pr.o), text: `${w.name} and you are no longer seeing each other${why ? ` (${why})` : ""}.` }); }
}
// One date, once: quality, bond, followers, memory, and a (capped) gossip item the first time.
function runDate(game, w, id, day, { payer, notes, stories }) {
  const P = K(game), pe = personOf(game, id), W = ensureWag(game);
  const cost = P.cost.date;
  if (payer === w.id) spend(game, w, cost, "date"); else { const p = game.players[pidOf(payer)]; if (p) p.coins = Math.max(0, (p.coins || 0) - cost); }
  w.cnt.date++;
  let q = 0.4 + makeRng(game.seed, "wagDq", w.id, id, game.season, day)() * 0.45 + Math.min(0.12, fondOf(game, w, id) / game.P.social.gift.fondQ) + (activeContacts(w, day).some((c) => c.id === id) ? 0.05 : 0);
  q = clamp(q, 0.05, 1); const good = q >= P.date.good, D = ((w.life.dq = w.life.dq || {})[id] = (w.life.dq || {})[id] || { n: 0, good: 0, sum: 0 }); D.n++; D.sum += q; if (good) D.good++;
  const first = !pairOf(game, w.id, id) || pairOf(game, w.id, id).dates === 0, pr = bumpPair(game, w, id, { good, day });
  w.contacts = (w.contacts || []).filter((c) => c.id !== id);
  if (good) w.brand = clamp(w.brand + P.date.brand, 0, K(game).brand.max);
  w.fol += Math.round(P.date.fol * (good ? 1.5 : 0.5)); if (isHumanFb(id)) applyFx(game, game.players[pidOf(id)], { fol: Math.round(P.date.fol * (good ? 1 : 0.3)) });
  notes.push({ wag: w.id, text: `Your date with ${pe.name} ${good ? "went well" : "was awkward"}.${pr.dates >= 2 ? ` Bond ${pr.bond}.` : ""}` });
  if (isHumanFb(id) && payer !== id) notes.push({ pid: pidOf(id), text: `Your date with ${w.name} ${good ? "went well" : "was awkward"}.` });
  W.last = { w: w.id, o: id, day };
  // gossip: a rumour the first time a roster footballer is seen out, a confirmation later. One slot, never forced.
  if (isFb(id) && (pr.dates === 3 || (first && good && makeRng(game.seed, "wagStory", w.id, id, game.season, day)() < P.story.firstDate))) {
    const confirmed = pr.dates >= 3, nm = pe.name, wn = w.name;
    const th = openThread(game, "wagdate", [], `${wn} and ${nm}${confirmed ? " are an item" : " were seen together"}.`);
    stories.push({ thread: th.id, kind: "league", icon: "💘", pid: pidOf(id), prio: confirmed ? 3 : 2, tag: confirmed ? "confirmed" : "rumour", src: "sun",
      head: confirmed ? variant(game, "wagItem", [`${up(wn)} AND ${up(nm)}: IT IS OFFICIAL, SAY BOTH PHONES`, `${up(nm)} AND ${up(wn)} ARE AN ITEM`]) : variant(game, "wagSeen", [`WHO WAS ${up(nm)} HAVING DINNER WITH? WITNESSES SAY ${up(wn)}`, `${up(wn)} SPOTTED WITH ${up(nm)}. NEITHER WILL COMMENT`]),
      sub: confirmed ? `Three dates in, ${wn} and ${nm} have stopped pretending. Their friends say it is "very normal" and have already booked a table.` : `A waiter, a window and a very visible coat. ${wn} and ${nm} were seen at dinner. This is not confirmed, just a lot of people saying it quietly at once.` });
  }
  return { good, pr, q };
}

// A date with someone from the pool who is not a player: cheaper, and it hardly moves your status (a share of the followers, no brand, a little warmth).
function runNpcDate(game, w, id, day, notes) {
  const P = K(game), pe = personOf(game, id);
  spend(game, w, P.cost.dateNpc, "date"); w.cnt.date++;
  const q = 0.4 + makeRng(game.seed, "wagNdq", w.id, id, game.season, day)() * 0.45 + Math.min(0.1, w.brand * 0.001), good = q >= P.date.good;
  w.fol += Math.round(P.date.fol * P.npc.mult * (good ? 1.5 : 0.5)); if (good) w.rapport = clamp(w.rapport + P.npc.rapport, 0, 100);
  notes.push({ wag: w.id, text: `Your date with ${pe.name} ${good ? "went well" : "was awkward"}. It was a nice evening and nothing the papers will print.` });
  return { good };
}
// Warmth goes to whoever you are seeing; with nobody, it goes to your standing with the scene (which helps when you invite someone later).
function warm(game, w, n, scene = n) {
  const mine = Object.values(ensureWag(game).pairs).filter((pr) => pr.w === w.id && pr.status === "seeing");
  if (mine.length) for (const pr of mine) pr.bond = clamp(pr.bond + n, 0, 100); else w.rapport = clamp(w.rapport + scene, 0, 100);
}
function addProg(game, w, n, notes) {
  const B = K(game).biz; if (w.biz.lvl >= B.max) { w.biz.prog = 0; return; }
  w.biz.prog = Math.max(0, +(w.biz.prog + n).toFixed(2));
  while (w.biz.lvl < B.max && w.biz.prog >= B.perLevel) { w.biz.prog = +(w.biz.prog - B.perLevel).toFixed(2); w.biz.lvl++; if (notes) notes.push({ wag: w.id, text: w.biz.lvl === 1 ? "Your business is open: it will bring in coins every matchday." : `Your business grew to level ${w.biz.lvl}.` }); }
  if (w.biz.lvl >= B.max) w.biz.prog = 0;
}
export const bizIncome = (game, w) => (w.biz.lvl ? Math.round(w.biz.lvl * K(game).biz.income * (1 + w.brand * K(game).biz.brandMult)) : 0);

// ---------- while the matches are on: two choices, one in each half ----------
// Opened at kick-off for a content, night-out or business week with no match to go to. The first choice is open in the first half; whatever is not chosen
// is decided for you (the safe option) at half-time and again before full time, so a WAG who is away, idle or on Auto never holds anything up.
const seqCfg = (game, kind) => K(game).seqs[kind];
const fxText = (e) => [e.c ? `${e.c > 0 ? "+" : ""}${e.c} coins` : "", e.f ? `${e.f > 0 ? "+" : ""}${e.f} followers` : "", e.b ? `${e.b > 0 ? "+" : ""}${e.b} brand` : "", e.r ? `${e.r > 0 ? "+" : ""}${e.r} relationships` : "", e.prog ? `${e.prog > 0 ? "+" : ""}${e.prog} business` : ""].filter(Boolean).join(", ");
function openSeq(game, w, kind, day) { w.sq = { day, kind, beat: 0, picks: [null, null], log: [], done: false }; }
const optsOf = (game, w, beat) => (w.sq && seqCfg(game, w.sq.kind) ? seqCfg(game, w.sq.kind)[beat] : []);
function autoIdx(game, w, beat) {
  const list = optsOf(game, w, beat), ok = list.map((o, i) => ({ o, i })).filter((x) => (x.o.cost || 0) <= w.coins);
  const def = ok.find((x) => x.o.def); if (def) return def.i;
  return ok.sort((x, y) => (x.o.cost || 0) - (y.o.cost || 0) || x.i - y.i)[0]?.i ?? -1;
}
function seqApply(game, w, idx, beat, auto, notes) {
  const P = K(game), sq = w.sq, o = optsOf(game, w, beat)[idx], t = SEQ[sq.kind].opts[o.id], r = makeRng(game.seed, "wagSeq", w.id, game.season, sq.day, beat);
  if (o.cost) spend(game, w, o.cost, sq.kind);
  const ok = r() < clamp(o.p + Math.min(P.seq.cap, w.brand * P.seq.chance), 0, 1), e = ok ? o : o.x || {}, got = {};
  if (e.c) { earn(game, w, e.c, sq.kind); got.c = e.c; }
  if (e.f) { w.fol = Math.max(0, w.fol + e.f); got.f = e.f; }
  if (e.b) { w.brand = clamp(w.brand + e.b, 0, P.brand.max); got.b = e.b; }
  if (e.r) { warm(game, w, e.r); got.r = e.r; }
  if (e.prog) { addProg(game, w, e.prog, notes); got.prog = e.prog; }
  let met = null;
  if (ok && o.meet) {
    const have = new Set((w.contacts || []).map((c) => c.id)), pool = scene(game, w, sq.day).filter((id) => !have.has(id));
    if (pool.length) { const id = pool[Math.floor(r() * pool.length)], pe = personOf(game, id); w.contacts = w.contacts || []; w.contacts.push({ id, name: pe.name, team: pe.team, made: sq.day, from: sq.day + 1, until: sq.day + P.attend.contactDays, via: "party" }); met = pe.name; }
  }
  const text = (ok ? t.ok : t.bad || t.ok) + (met ? ` You met ${met}: you can invite them from next matchday.` : "");
  const entry = { beat, id: o.id, name: t.name, ok, auto: !!auto, text, fx: fxText(got), cost: o.cost || 0 };
  sq.picks[beat] = idx; sq.log.push(entry);
  if (auto && notes) notes.push({ wag: w.id, text: `${SEQ[sq.kind].title}: you were busy, so "${t.name}" was chosen for you. ${text}${entry.fx ? ` (${entry.fx})` : ""}` });
  return entry;
}
// A WAG chooses an option for the current beat (the one that is open right now).
export function seqChoose(game, w, idx) {
  const sq = w.sq; if (!sq || sq.done) return fail("Nothing to choose right now.");
  const beat = sq.beat; if (sq.picks[beat] != null) return fail("You have already chosen.");
  const o = optsOf(game, w, beat)[idx | 0]; if (!o) return fail("Pick one of the options.");
  if ((o.cost || 0) > w.coins) return fail(`That costs ${o.cost} coins.`);
  const notes = [], entry = seqApply(game, w, idx | 0, beat, false, notes); if (beat === 1) sq.done = true;
  return { ok: true, entry, notes };
}
// Half-time: any first choice left open is made for the WAG, and the second one opens.
export function seqHalf(game, { day }) {
  const notes = [];
  for (const w of wagList(game)) { const sq = w.sq; if (!sq || sq.day !== day || sq.done || sq.beat !== 0) continue; if (sq.picks[0] == null) { const i = autoIdx(game, w, 0); if (i >= 0) seqApply(game, w, i, 0, true, notes); } sq.beat = 1; }
  return { notes };
}
// Before the result is public: whatever is still open is decided, so the choices are always finished by full time.
export function seqFinish(game, { day }) {
  const notes = [];
  for (const w of wagList(game)) {
    const sq = w.sq; if (!sq || sq.day !== day || sq.done) continue;
    if (sq.picks[0] == null) { const i = autoIdx(game, w, 0); if (i >= 0) seqApply(game, w, i, 0, true, notes); }
    sq.beat = 1; if (sq.picks[1] == null) { const i = autoIdx(game, w, 1); if (i >= 0) seqApply(game, w, i, 1, true, notes); }
    sq.done = true;
  }
  return { notes };
}
export function seqView(game, w) {
  const sq = w.sq; if (!sq) return null; const T = SEQ[sq.kind], cur = sq.done ? null : sq.beat;
  return { kind: sq.kind, title: T.title, icon: T.icon, beat: sq.beat, done: sq.done, log: sq.log.map((x) => ({ ...x })),
    open: cur == null || sq.picks[cur] != null ? null : { beat: cur, prompt: T.beats[cur], options: optsOf(game, w, cur).map((o, i) => { const t = T.opts[o.id]; return { i, id: o.id, name: t.name, desc: t.desc, cost: o.cost || 0, can: (o.cost || 0) <= w.coins }; }) } };
}

// ---------- kick-off: everything chosen is settled once ----------
// Returns { notes: [{wag|pid, text}], stories: [] } (stories are printed by the caller through the capped league desk).
export function kickoff(game, { day, fixtures }) {
  const W = ensureWag(game), key = game.season + ":" + day, P = K(game), notes = [], stories = [];
  if (W.kick === key) return { notes, stories, again: true };
  W.kick = key;
  for (const r of W.req) if (r.status === "open") r.status = "lapsed";                       // requests live in the lineup window only
  const ws = wagList(game), byFb = new Map();
  for (const w of ws) {
    w.contacts = (w.contacts || []).filter((c) => c.until >= day);
    if (!w.act) w.act = { act: "quiet" };
    const a = w.act;
    if (a.act === "date" && isFb(a.partner)) { if (!byFb.has(a.partner)) byFb.set(a.partner, []); byFb.get(a.partner).push(w); }
  }
  // listed roster footballers: each accepts at most one invitation (best score wins; losers are not charged and are told)
  for (const [id, list] of byFb) {
    const pe = personOf(game, id), sc = list.map((w) => ({ w, s: dateScore(game, w, id, day) })).sort((x, y) => y.s - x.s || (x.w.id < y.w.id ? -1 : 1)), taken = takenBy(game, id), win = pe && pe.ok && sc[0].s >= P.date.accept && (!taken || taken === sc[0].w.id) ? sc[0] : null;
    for (const x of sc) {
      if (win && x === win) continue;
      x.w.act = { act: "quiet", failed: true }; x.w.last = { act: "date", failed: true };
      const why = !pe || !pe.ok ? "is not available" : taken && taken !== x.w.id ? "is seeing someone" : win ? `is going out with ${win.w.name} instead` : "politely declined";
      notes.push({ wag: x.w.id, text: `${pe ? pe.name : "They"} ${why}. You were not charged.` });
      if (pe) { remember(game, x.w.id, "rej", { id, name: pe.name, what: "date", by: win ? win.w.name : null }); if (win) remember(game, x.w.id, "rival", { id, name: win.w.name, over: pe.name, wag: win.w.id }); }
    }
    if (win && sc.length > 1) { notes.push({ wag: win.w.id, text: `${pe.name} chose your invitation over ${sc.filter((x) => x !== win).map((x) => x.w.name).join(" and ")}.` }); remember(game, win.w.id, "rival", { id, name: sc[1].w.name, over: pe.name, wag: sc[1].w.id }); }
  }
  for (const w of ws) {
    const a = w.act; w.last = null; w.sq = null;
    // money that comes in by itself: a little for the brand, more for a business that is open
    const pass = Math.floor(w.brand / P.brand.passiveDiv) + bizIncome(game, w);
    if (pass > 0) { earn(game, w, pass, "brand"); notes.push({ wag: w.id, text: `Your brand${w.biz.lvl ? " and your business" : ""} brought in ${pass} coins.` }); }
    // the match (a ticket, paid once) is separate from the week's activity
    const m = w.match; let atMatch = false; w.match = null;
    if (m) {
      if (w.coins >= P.cost.attend) { spend(game, w, P.cost.attend, "ticket"); w.attending = { day, match: m.match, team: m.team, target: m.target || null, done: false }; w.cnt.attend++; atMatch = true; }
      else notes.push({ wag: w.id, text: "You could not afford the ticket, so you did not go to the match." });
    }
    const k = atMatch ? P.atMatch : 1, show = (act, extra = {}) => { w.last = { act, ...extra, ...(atMatch ? { attend: m.team } : {}) }; };
    if (a.act === "content") {
      if (contentLeft(game, w) > 0) {
        const n = earn(game, w, Math.round(contentPay(game, w) * k), "content"), f = Math.round(P.content.fol * k); w.content.n++; w.fol += f; w.brand = clamp(w.brand + P.content.brand * k, 0, P.brand.max); w.cnt.content++;
        show("content", { earned: n }); notes.push({ wag: w.id, text: `Your content did numbers${atMatch ? " (a quick one, between the match and the stands)" : ""}: +${n} coins, +${f} followers.` });
        if (!atMatch) openSeq(game, w, "content", day);
      } else show("quiet");
    } else if (a.act === "party") {
      if (w.coins >= P.cost.party) {
        spend(game, w, P.cost.party, "party"); const f = Math.round(P.party.fol * k); w.fol += f; w.brand = clamp(w.brand + P.party.brand * k, 0, P.brand.max); w.cnt.party++;
        show("party"); notes.push({ wag: w.id, text: `You went out${atMatch ? " after the match" : ""}: -${P.cost.party} coins, +${f} followers.` });
        if (!atMatch) openSeq(game, w, "party", day);
      } else { show("quiet"); notes.push({ wag: w.id, text: "You could not afford a night out, so you stayed in." }); }
    } else if (a.act === "business") {
      addProg(game, w, P.biz.base * k, notes); w.cnt.business++; show("business"); notes.push({ wag: w.id, text: `You worked on your business${atMatch ? " (a quick visit)" : ""}.` });
      if (!atMatch) openSeq(game, w, "business", day);
    } else if (a.act === "date" && isNpc(a.partner)) {
      if (w.coins >= P.cost.dateNpc) { const res = runNpcDate(game, w, a.partner, day, notes); show("date", { with: a.partner, good: res.good }); }
      else { show("quiet"); notes.push({ wag: w.id, text: "You could not afford the date, so you stayed in." }); }
    } else if (a.act === "date" && isHumanFb(a.partner)) {
      const q = game.players[pidOf(a.partner)], L = q && q.life, booked = L && L.act && L.act.wag === w.id, payer = a.payer || w.id, pay = payer === w.id ? w.coins : (q ? q.coins || 0 : 0);
      if (!q || !humanOk(game, q.id) || !booked || committed(game, a.partner) || pay < P.cost.date) { show("quiet", { failed: true }); notes.push({ wag: w.id, text: `Your date with ${q ? q.name : "them"} did not happen. You were not charged.` }); if (L && L.act && L.act.wag === w.id) L.act = null; }
      else { const res = runDate(game, w, a.partner, day, { payer, notes, stories }); show("date", { with: a.partner, good: res.good }); }
    } else if (a.act === "date" && isFb(a.partner) && !a.failed) {
      const pe = personOf(game, a.partner); if (pe && pe.ok) { const res = runDate(game, w, a.partner, day, { payer: w.id, notes, stories }); show("date", { with: a.partner, good: res.good }); } else show("quiet");
    } else {
      w.cnt.quiet++; warm(game, w, P.quiet.bond, P.quiet.rapport); show("quiet", a.failed ? { failed: true } : {});
    }
    w.act = null;
  }
  // human footballers' bookings that no WAG kept are cleared (and never charged)
  for (const p of Object.values(game.players)) if (p.user && p.life && p.life.act && p.life.act.wag && !(wagOf(game, p.life.act.wag) && wagOf(game, p.life.act.wag).last && wagOf(game, p.life.act.wag).last.with === "u:" + p.id)) p.life.act = null;
  // upkeep: one tick per matchday. A bond fades when it is neglected; a partner who retired ends it.
  for (const pr of Object.values(W.pairs)) {
    if (pr.status !== "seeing" || pr.upkeepDay === key) continue; pr.upkeepDay = key;
    const pe = personOf(game, pr.o); if (!pe || !pe.ok) { endPair(game, pr, "no longer playing", notes); continue; }
    if (pr.last !== day && day - pr.last > P.date.decayAfter) { pr.bond = Math.max(0, pr.bond - P.date.decay); if (pr.bond <= P.date.end) endPair(game, pr, "drifted apart", notes); }
  }
  return { notes, stories };
}

// ---------- full time: an attendance becomes an encounter, once ----------
export function afterMatch(game, { day, results }) {
  const notes = [], P = K(game).attend;
  for (const w of wagList(game)) {
    const at = w.attending; if (!at || at.done || at.day !== day) continue; at.done = true;
    const res = (results || []).find((m) => (m.a === at.match[0] && m.b === at.match[1]) || (m.a === at.match[1] && m.b === at.match[0])); if (!res) continue;
    const mine = at.team === res.a ? [res.ga, res.gb] : [res.gb, res.ga], won = mine[0] > mine[1], r = makeRng(game.seed, "wagAttend", w.id, game.season, day);
    w.fol += P.fol + (won ? 100 : 0); w.support = at.team;
    const squad = Object.values(game.players).filter((p) => p.team === at.team && !p.retired && (fbOk(game, p.id) || humanOk(game, p.id)));
    let target = at.target && personOf(game, at.target) && personOf(game, at.target).ok && personOf(game, at.target).team === at.team ? at.target : null;
    const chance = clamp(P.meet + (target ? P.target : 0) + Math.min(P.fameCap, w.fol * P.fame) + (won ? P.win : 0), 0, 0.85);
    const hit = r() < chance;
    if (!hit) { notes.push({ wag: w.id, text: `You watched ${(game.teams[at.team] || {}).name || "your team"} ${won ? "win" : mine[0] === mine[1] ? "draw" : "lose"} ${mine[0]}-${mine[1]}. You did not get near the players. (+followers from the day out)` }); continue; }
    if (!target) { const cand = squad.filter((p) => !committed(game, p.user ? "u:" + p.id : fbId(p.id))).sort((a, b) => a.id - b.id); if (!cand.length) { notes.push({ wag: w.id, text: "The players were all taken for the evening." }); continue; } const p = cand[Math.floor(r() * cand.length)]; target = p.user ? "u:" + p.id : fbId(p.id); }
    const pe = personOf(game, target); if (!pe) continue;
    w.contacts = (w.contacts || []).filter((c) => c.id !== target); w.contacts.push({ id: target, name: pe.name, team: at.team, made: day, from: day + 1, until: day + K(game).attend.contactDays, via: "match" });
    notes.push({ wag: w.id, text: `After the match you got talking to ${pe.name}. You can invite them from next matchday (your contact lasts ${K(game).attend.contactDays} matchdays).` });
    if (pe.human) notes.push({ pid: pidOf(target), text: `${w.name}, who was at your match, got talking to you afterwards. She may get in touch.`.replace("She", w.g === "M" ? "He" : "She") });
  }
  return { notes };
}

// ---------- requests between a WAG and a human footballer ----------
// Nothing is paid and nothing is booked until a person says yes. One yes counts: the other open invitations are closed and told.
const openReq = (W) => W.req.filter((r) => r.status === "open");
const nameOf = (game, id) => (personOf(game, id) || { name: "Someone" }).name;
export function sendRequest(game, fromId, toId, kind, { tier, pub, day } = {}) {
  const W = ensureWag(game), P = K(game);
  const wagSide = isWag(fromId) ? fromId : isWag(toId) ? toId : null, humanSide = isHumanFb(fromId) ? fromId : isHumanFb(toId) ? toId : null;
  if (!wagSide || !humanSide) return fail("Only a WAG and a footballer can do this.");
  const w = wagOf(game, wagSide), q = game.players[pidOf(humanSide)]; if (!w || !q || !humanOk(game, q.id)) return fail("Not available.");
  if (committed(game, humanSide)) return fail(`${q.name} is in a relationship.`);
  if (openReq(W).some((r) => r.from === fromId && r.to === toId && r.kind === kind)) return fail("Already asked.");
  if (openReq(W).filter((r) => r.from === fromId).length >= P.date.maxOpen) return fail(`You can have ${P.date.maxOpen} requests out at once.`);
  if (kind === "date") {
    const payer = fromId; if ((isWag(payer) ? w.coins : q.coins || 0) < P.cost.date) return fail(`A date costs ${P.cost.date} coins.`);
  } else if (kind === "gift") {
    if (!isWag(fromId)) return fail("Only a WAG sends gifts here.");
    const st = giftState(game, w, toId, tier); if (!st.can) return fail(st.why);
  } else return fail("Unknown request.");
  const r = { id: ++W.reqSeq, kind, from: fromId, to: toId, status: "open", season: game.season, day: day ?? day0(game), ...(kind === "gift" ? { tier, pub: !!pub } : {}) };
  W.req.push(r); if (W.req.length > 60) W.req.splice(0, W.req.length - 60);
  const text = kind === "gift" ? `${w.name} wants to give you ${WHAT[tier]}${pub ? " as a public gesture" : ""}.` : isWag(fromId) ? `${w.name} asks you out on a date. You come for free.` : `${q.name} asks you out on a date.`;
  return { ok: true, req: r, notes: [isWag(toId) ? { wag: toId, text: `${q.name} asks you out on a date. They pay.` } : { pid: q.id, text }] };
}
export function replyRequest(game, whoId, reqId, yes, { day } = {}) {
  const W = ensureWag(game), r = W.req.find((x) => x.id === reqId && x.to === whoId && x.status === "open"); if (!r) return fail("Gone");
  const wagId = isWag(r.from) ? r.from : r.to, hid = isWag(r.from) ? r.to : r.from, w = wagOf(game, wagId), q = game.players[pidOf(hid)], P = K(game), notes = [];
  if (!w || !q || !humanOk(game, q.id)) { r.status = "lapsed"; return fail("Gone"); }
  const asker = r.from, askerName = nameOf(game, asker), meName = nameOf(game, whoId);
  if (!yes) { r.status = "declined"; remember(game, isWag(asker) ? asker : pidOf(asker), "rej", { id: whoId, name: meName, what: r.kind === "gift" ? "gift" : "date" }); return { ok: true, yes: false, notes: [{ ...(isWag(asker) ? { wag: asker } : { pid: pidOf(asker) }), text: `${meName} ${r.kind === "gift" ? "returned your gift" : "said no"}.` }] }; }
  if (committed(game, hid)) { r.status = "lapsed"; return fail("Not available any more."); }
  if (r.kind === "gift") {
    const st = giftState(game, w, hid, r.tier, r.id); if (!st.can) { r.status = "lapsed"; return fail(st.why); }
    r.status = "accepted"; payGift(game, w, hid, r.tier, !!r.pub, notes);
    notes.push({ wag: w.id, text: `${q.name} accepted ${WHAT[r.tier]} from you.` }); return { ok: true, yes: true, notes };
  }
  const payer = asker; if ((isWag(payer) ? w.coins : q.coins || 0) < P.cost.date) { r.status = "lapsed"; return fail(`${askerName} can no longer afford it.`); }
  // one yes counts: everybody else who asked this person is told, and an earlier booking of theirs is released
  for (const o of W.req) if (o !== r && o.status === "open" && o.to === whoId && o.kind === "date") {
    o.status = "closed"; notes.push({ ...(isWag(o.from) ? { wag: o.from } : { pid: pidOf(o.from) }), text: `${meName} accepted another invitation instead of yours.` });
    remember(game, isWag(o.from) ? o.from : pidOf(o.from), "rej", { id: whoId, name: meName, what: "date", by: askerName }); remember(game, isWag(o.from) ? o.from : pidOf(o.from), "rival", { id: whoId, name: askerName, over: meName });
  }
  const held = [w, ...[]]; const hl = q.life && q.life.act;
  if (isWag(whoId)) { const prior = w.act && w.act.act === "date" ? w.act : null; if (prior && prior.partner !== hid) { if (isHumanFb(prior.partner)) notes.push(...releaseBooking(game, w, `${w.name} accepted another invitation and cancelled your date.`)); else notes.push({ wag: w.id, text: "Your earlier invitation was replaced by this date." }); } }
  else if (hl && hl.wag && hl.wag !== wagId) { const other = wagOf(game, hl.wag); if (other && other.act && other.act.partner === "u:" + q.id) { other.act = null; notes.push({ wag: other.id, text: `${q.name} accepted another invitation and cancelled your date.` }); } }
  const L = ensureLife(game, q); if (L.act && L.act.joint) { /* a joint date with another footballer is replaced by this one */ L.act = null; }
  w.act = { act: "date", partner: hid, payer }; L.act = { act: "rest", partner: null, wag: w.id };
  r.status = "accepted"; notes.push({ ...(isWag(asker) ? { wag: asker } : { pid: pidOf(asker) }), text: `${meName} said yes. See you at kick-off.` });
  return { ok: true, yes: true, notes };
}
// A human footballer who changes their own week frees the WAG they had booked.
export function footballerChangedWeek(game, pid) {
  const notes = []; for (const w of wagList(game)) if (w.act && w.act.act === "date" && w.act.partner === "u:" + pid) { const p = game.players[pid], keeps = p && p.life && p.life.act && p.life.act.wag === w.id; if (!keeps) { w.act = null; notes.push({ wag: w.id, text: `${p ? p.name : "They"} changed their plans: your date is off.` }); } }
  return notes;
}

// ---------- gifts ----------
const WHAT = { flowers: "a bouquet", watch: "a watch", jewel: "jewellery" };
function glog(game, w) { const wk = ensureRom(game).week; if (w.gifts.week !== wk) { w.gifts.week = wk; w.gifts.n = 0; } return w.gifts; }
export function giftState(game, w, targetId, tier, skipReq = 0) {
  const G = game.P.social.gift, P = K(game), g = glog(game, w);
  if (game.socialOn === false) return { can: false, why: "Social events are switched off." };
  if (!G.tiers[tier]) return { can: false, why: "Pick a gift." };
  if (w.coins < G.tiers[tier].price) return { can: false, why: "You cannot afford it." };
  if (g.n >= Math.min(P.gift.maxPerWeek, G.perWeek)) return { can: false, why: `At most ${Math.min(P.gift.maxPerWeek, G.perWeek)} gifts a matchday.` };
  if ((g.by[targetId + ":" + game.season] || 0) >= G.perTarget) return { can: false, why: `That is enough gifts for one season (${G.perTarget}).` };
  const pe = personOf(game, targetId); if (!pe || !pe.ok) return { can: false, why: "Not available." };
  if (isHumanFb(targetId) && ensureWag(game).req.some((r) => r.kind === "gift" && r.status === "open" && r.from === w.id && r.to === targetId && r.id !== skipReq)) return { can: false, why: "They have not answered your last gift." };
  if (isFb(targetId) && !reachable(game, w, targetId, day0(game))) return { can: false, why: "You have not met them." };
  return { can: true };
}
function payGift(game, w, targetId, tier, pub, notes) {
  const G = game.P.social.gift, R = ensureRom(game), g = glog(game, w), recent = w.life.giftAt[targetId] ?? -99, like = G.tiers[tier].like * (R.week - recent <= 3 ? G.fade : 1), pe = personOf(game, targetId);
  spend(game, w, G.tiers[tier].price, "gift"); g.n++; g.by[targetId + ":" + game.season] = (g.by[targetId + ":" + game.season] || 0) + 1; w.life.giftAt[targetId] = R.week;
  addFond(game, w, targetId, like);
  const pr = pairOf(game, w.id, targetId); if (pr && pr.status === "seeing") pr.bond = clamp(pr.bond + Math.round(like / 2), 0, 100);
  remember(game, w.id, "gift", { id: targetId, name: pe.name, tier, pub: !!pub }); if (isHumanFb(targetId)) remember(game, pidOf(targetId), "gift", { id: w.id, name: w.name, tier, pub: !!pub, got: true });
  if (pub) { w.fol += G.publicFol; const th = openThread(game, "wag", [], `${w.name} sent ${pe.name} ${WHAT[tier]} in public.`);
    deskStory(game, { thread: th.id, kind: "league", icon: "🎁", pid: isHumanFb(targetId) || isFb(targetId) ? pidOf(targetId) : null, prio: 2, tag: "confirmed", src: "sun", head: `${up(w.name)} MAKES A GRAND GESTURE: ${up(WHAT[tier])} FOR ${up(pe.name)}`, sub: `${w.name} arranged the delivery, the photographer and the caption. ${pe.name} has "seen it". Nothing else is confirmed.` }); }
  return like;
}
// To a roster footballer: takes effect at once (private by default). To a human footballer: a request they accept or return.
export function sendGift(game, w, targetId, tier, pub, opts = {}) {
  const st = giftState(game, w, targetId, tier); if (!st.can) return fail(st.why);
  if (isHumanFb(targetId)) return sendRequest(game, w.id, targetId, "gift", { tier, pub, day: opts.day });
  const notes = [], like = payGift(game, w, targetId, tier, pub, notes);
  return { ok: true, name: personOf(game, targetId).name, like, notes };
}

// ---------- views (a person's own record only) ----------
export function memoryOf(game, w) {
  const m = memOf(game, w.id);
  return { exes: m.ex.slice(-4).map((x) => x.name), rejected: m.rej.slice(-4).map((x) => ({ name: x.name, by: x.by || null })), rivals: [...new Set(m.rival.slice(-6).map((x) => x.name))].slice(0, 4), gifts: m.gift.slice(-4).map((x) => ({ name: x.name, tier: x.tier, pub: x.pub })) };
}
export function pairsView(game, w) {
  return Object.values(ensureWag(game).pairs).filter((pr) => pr.w === w.id && pr.status === "seeing").map((pr) => { const pe = personOf(game, pr.o); return pe ? { id: pr.o, name: pe.name, team: pe.team != null ? (game.teams[pe.team] || {}).name : null, dates: pr.dates, good: pr.good, bond: Math.round(pr.bond), human: pe.human } : null; }).filter(Boolean);
}
// Requests as the footballer sees them (their payload only carries their own).
export function requestsFor(game, whoId) {
  const W = ensureWag(game), mk = (r, side) => { const other = side === "in" ? r.from : r.to, pe = personOf(game, other); return pe ? { id: r.id, kind: r.kind, tier: r.tier || null, pub: !!r.pub, who: { id: other, name: pe.name, g: pe.g, img: pe.img || null, wag: isWag(other) }, cost: K(game).cost.date, payer: r.from } : null; };
  return { incoming: W.req.filter((r) => r.status === "open" && r.to === whoId).map((r) => mk(r, "in")).filter(Boolean), outgoing: W.req.filter((r) => r.status === "open" && r.from === whoId).map((r) => mk(r, "out")).filter(Boolean) };
}
export const wagPeople = (game) => wagList(game).map((w) => ({ id: w.id, name: w.name, g: w.g, img: w.img }));
export function viewFor(game, w, { day, fixtures, open }) {
  const P = K(game), G = game.P.social.gift;
  const sc = scene(game, w, day), pe = (id) => personOf(game, id), tn = (x) => (x.team != null ? (game.teams[x.team] || {}).name : "Free agent");
  const people = (list, via) => list.map((id) => { const x = pe(id); if (!x || !x.ok) return null; const pr = pairOf(game, w.id, id), tk = takenBy(game, id); return { id, pid: pidOf(id), name: x.name, g: x.g, team: tn(x), pos: x.pos, ovr: x.ovr, human: x.human, via, seeing: !!(pr && pr.status === "seeing"), taken: !!(tk && tk !== w.id), can: via === "scene" || reachable(game, w, id, day) }; }).filter(Boolean);
  const contacts = (w.contacts || []).map((c) => { const x = pe(c.id); return x && x.ok ? { id: c.id, pid: pidOf(c.id), name: x.name, g: x.g, team: tn(x), pos: x.pos, ovr: x.ovr, human: x.human, from: c.from, until: c.until, ready: c.from <= day } : null; }).filter(Boolean);
  const attendFx = (fixtures || []).map((f, i) => ({ i, a: f[0], b: f[1], an: (game.teams[f[0]] || {}).name, bn: (game.teams[f[1]] || {}).name }));
  const roster = {}; for (const f of fixtures || []) for (const t of f) roster[t] = Object.values(game.players).filter((p) => p.team === t && !p.retired && (fbOk(game, p.id) || humanOk(game, p.id))).sort((a, b) => b.ovr - a.ovr).slice(0, 12).map((p) => ({ id: p.user ? "u:" + p.id : fbId(p.id), pid: p.id, name: p.name, pos: p.pos, human: !!p.user, taken: p.user ? committed(game, "u:" + p.id) : !!takenBy(game, fbId(p.id)) }));
  const rq = requestsFor(game, w.id), humans = Object.values(game.players).filter((p) => p.user && !p.retired).map((p) => ({ id: "u:" + p.id, pid: p.id, name: p.name, g: p.gender === "F" ? "F" : "M", img: p.img, team: p.team != null ? (game.teams[p.team] || {}).name : "Free agent", pos: p.pos, ovr: p.ovr, taken: committed(game, "u:" + p.id) }));
  // The date pool: everyone you can invite this matchday, with a picture. Footballers show up once you have their number (a contact), or from the scene, or because you are seeing them.
  const seeing = pairsView(game, w), asked = new Set(rq.outgoing.map((r) => r.who.id));
  const pool = [
    ...seeing.filter((x) => !x.human).map((x) => ({ id: x.id, kind: "seeing", pid: pidOf(x.id), name: x.name, team: x.team, bond: x.bond, can: true })),
    ...contacts.filter((c) => c.ready && !c.human).map((c) => ({ ...c, kind: "contact", can: true, until: c.until })),
    ...people(sc, "scene").filter((x) => !seeing.some((s) => s.id === x.id) && !contacts.some((c) => c.id === x.id && c.ready)).map((x) => ({ ...x, kind: "scene", can: !x.taken })),
    ...npcOpts(game, w, day).map((x) => ({ id: "n:" + x.id, kind: "npc", slug: x.id, name: x.name, g: x.g, cost: P.cost.dateNpc, can: true })),
    ...humans.map((h) => ({ ...h, kind: "human", asked: asked.has(h.id), can: !h.taken, seeing: seeing.some((s) => s.id === h.id), ready: contacts.some((c) => c.id === h.id && c.ready) })),
  ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  return { id: w.id, name: w.name, g: w.g, img: w.img, coins: Math.round(w.coins), fol: w.fol, brand: Math.round(w.brand), rapport: Math.round(w.rapport), biz: { lvl: w.biz.lvl, prog: w.biz.prog, per: P.biz.perLevel, max: P.biz.max, income: bizIncome(game, w), next: Math.round((w.biz.lvl + 1) * P.biz.income * (1 + w.brand * P.biz.brandMult)) }, passive: Math.floor(w.brand / P.brand.passiveDiv) + bizIncome(game, w),
    support: w.support != null ? (game.teams[w.support] || {}).name : null, act: w.act ? { ...w.act } : null, match: w.match ? { ...w.match } : null, last: w.last, seq: seqView(game, w),
    cost: P.cost, atMatch: P.atMatch, contentLeft: contentLeft(game, w), contentPay: contentPay(game, w), meet: { base: P.attend.meet, target: P.attend.target }, contacts, scene: people(sc, "scene"), pool, fixtures: attendFx, roster, seeing, humans,
    incoming: rq.incoming, outgoing: rq.outgoing, gifts: Object.entries(G.tiers).map(([id, t]) => ({ id, name: { flowers: "Flowers", watch: "Watch", jewel: "Jewellery" }[id], price: t.price, can: w.coins >= t.price })), mem: memoryOf(game, w), attending: w.attending && !w.attending.done ? { team: (game.teams[w.attending.team] || {}).name } : null, open: !!open, cnt: w.cnt };
}
