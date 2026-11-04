// The footballers' market, deepened: dinner invitations (several footballers can ask the same person, who chooses),
// gifts (private or a public gesture, capped, and able to be discovered), and the memory the league keeps of it all.
// Managers are not part of any of this: every entry point needs a footballer. Nothing here is guaranteed to work: a person who
// is asked can say no, and gifts only nudge. Costs, caps and odds live in params.social.
import { makeRng } from "./rng.js";
import { ensureSoc, memOf, remember, fondOf, addFond, deskStory, openThread, addHist, variant, nid } from "./social.js";
import { ensureLife, ensureRom, npcState, isHuman, personOf, actCost, applyFx, partnerById } from "./life.js";
import { bondOf } from "./affair.js";

const up = (s) => String(s).toUpperCase();
export const GIFT_TIERS = { flowers: "Flowers", watch: "A watch", jewel: "Jewellery" };
const fail = (why) => ({ ok: false, why });
const uid = (p) => "u:" + p.id;
export const socialOnFor = (game) => game.socialOn !== false;

// ---------- dinner invitations to a listed person ----------
// How a listed person weighs one footballer's invitation: history together, how things went, fame, gifts, past rejections, and a seeded wobble.
export function dinnerScore(game, p, id, week) {
  const L = ensureLife(game, p), K = game.P.social, n = npcState(game, id), D = (L.dq || {})[id] || { n: 0, good: 0 };
  const m = memOf(game, p.id), exOf = m.ex.some((x) => x.id === id), turned = m.rej.filter((x) => x.id === id).length;
  let s = 0.32 + Math.min(0.2, (L.dated[id] || 0) * 0.04) + (D.n ? (D.good / D.n) * 0.15 : 0) + (L.partner && L.partner.id === id ? 0.15 : 0) + Math.min(0.15, L.fol / 400000) + (L.love - 50) / 500
    + fondOf(game, p, id) / K.gift.fondQ - (L.rej[id] || 0) * 0.08 - turned * 0.05 - (exOf ? 0.08 : 0) + (n.loyalty > 70 && n.excl != null && n.excl !== p.id ? -0.2 : 0);
  s += (makeRng(game.seed, "dinner", p.id, id, week)() - 0.5) * 0.3;
  return +s.toFixed(3);
}
// Everyone's chosen dinners for this matchday: each listed person accepts at most one invitation (or none). entries = [{ p, partner }].
// Returns { [pid]: { ok, why?, rivals?: [names], winner?: name } } plus private notes.
export function settleDinners(game, entries) {
  const R = ensureRom(game), out = {}, notes = [], by = new Map();
  for (const e of entries) { if (!by.has(e.partner)) by.set(e.partner, []); by.get(e.partner).push(e); }
  for (const [id, list] of by) {
    const info = partnerById(id), name = info ? info.name : "They", scored = list.map((e) => ({ ...e, s: dinnerScore(game, e.p, id, R.week) })).sort((a, b) => b.s - a.s || a.p.id - b.p.id), best = scored[0];
    const yes = best.s >= game.P.social.gift.accept;
    for (const e of scored) {
      if (yes && e === best) { out[e.p.id] = { ok: true, rivals: scored.filter((x) => x !== e).map((x) => x.p.name) }; if (scored.length > 1) notes.push({ pid: e.p.id, text: `${name} chose your invitation over ${scored.filter((x) => x !== e).map((x) => x.p.name).join(" and ")}.` }); continue; }
      out[e.p.id] = { ok: false, why: yes ? `${name} had a better offer: ${best.p.name} got the table.` : `${name} politely turned down your dinner invitation.`, winner: yes ? best.p.name : null };
      remember(game, e.p.id, "rej", { id, name, what: "dinner", by: yes ? best.p.name : null });
      if (yes) remember(game, e.p.id, "rival", { id, name: best.p.name, over: name, pid: best.p.id });
      notes.push({ pid: e.p.id, text: out[e.p.id].why + " You were not charged." });
    }
    if (yes && scored.length > 1) {                                           // two footballers, one table: the staff talk
      remember(game, best.p.id, "rival", { id, name: scored[1].p.name, over: name, pid: scored[1].p.id });
      const r = makeRng(game.seed, "dinnerStory", id, R.week);
      if (r() < 0.4) {
        const th = openThread(game, "dinner", [best.p.id, scored[1].p.id], `${best.p.name} and ${scored[1].p.name} both asked ${name} to dinner. ${name} chose ${best.p.name}.`);
        deskStory(game, { thread: th.id, kind: "league", icon: "🍽️", pid: best.p.id, prio: 3, tag: "rumour", src: "sun",
          head: variant(game, "dinner2", [`${up(best.p.name)} BEATS ${up(scored[1].p.name)} TO A TABLE FOR TWO WITH ${up(name)}`, `DOUBLE-BOOKED: ${up(name)} HAD TWO DINNER INVITATIONS AND ONE APPETITE`, `${up(name)} PICKS ${up(best.p.name)} OVER ${up(scored[1].p.name)}`]),
          sub: `A waiter says two footballers each tried to book ${name}'s evening. ${best.p.name} got the corner table. ${scored[1].p.name} got a kind message and a lot of free time.` });
      }
    }
  }
  return { out, notes };
}

// ---------- gifts ----------
export function giftPrice(game, tier) { const t = game.P.social.gift.tiers[tier]; return t ? t.price : 0; }
function giftLog(game, p, week) { const L = ensureLife(game, p), g = (L.gifts = L.gifts || { week, n: 0, by: {} }); if (g.week !== week) { g.week = week; g.n = 0; } return g; }
// Can he give this tier to this person now? A person who already has an open gift request from him cannot be sent another.
export function giftState(game, p, targetId, tier) {
  const K = game.P.social.gift, L = ensureLife(game, p), R = ensureRom(game), g = giftLog(game, p, R.week);
  if (!socialOnFor(game)) return { can: false, why: "Social events are switched off." };
  if (!K.tiers[tier]) return { can: false, why: "Pick a gift." };
  if ((p.coins || 0) < K.tiers[tier].price) return { can: false, why: "You cannot afford it." };
  if (g.n >= K.perWeek) return { can: false, why: `At most ${K.perWeek} gifts a matchday.` };
  const k = targetId + ":" + game.season; if ((g.by[k] || 0) >= K.perTarget) return { can: false, why: `That is enough gifts for one season (${K.perTarget}). Anything more is not romance, it is a bribe.` };
  if (isHuman(targetId)) {
    const q = game.players[+targetId.slice(2)]; if (!q || q.id === p.id) return { can: false, why: "Not a footballer." };
    if (R.req.some((r) => r.kind === "gift" && r.status === "open" && r.from === p.id && r.to === q.id)) return { can: false, why: "They have not answered your last gift." };
  } else {
    const info = partnerById(targetId); if (!info) return { can: false, why: "Unknown person." };
    const n = npcState(game, targetId); if (n.cool > R.week) return { can: false, why: `${info.name} is heartbroken and not accepting gifts.` };
    if (!(L.opts && L.opts.ids.includes(targetId)) && !(L.partner && L.partner.id === targetId)) return { can: false, why: "They are not on your list this week." };
  }
  return { can: true };
}
// A gift's pull shrinks if you give the same person gifts again within a few matchdays.
function pull(game, p, targetId, tier) {
  const K = game.P.social.gift, L = ensureLife(game, p), g = giftLog(game, p, ensureRom(game).week), recent = (L.giftAt && L.giftAt[targetId]) || -99, wk = ensureRom(game).week;
  return K.tiers[tier].like * (wk - recent <= 3 ? K.fade : 1);
}
// Send to a listed person: takes effect at once. `pub` is a public gesture (followers, and the whole league knows).
export function sendGift(game, p, targetId, tier, pub) {
  const st = giftState(game, p, targetId, tier); if (!st.can) return fail(st.why);
  if (isHuman(targetId)) return requestGift(game, p, targetId, tier, pub);
  const K = game.P.social.gift, L = ensureLife(game, p), R = ensureRom(game), info = partnerById(targetId), notes = [], g = giftLog(game, p, R.week), like = pull(game, p, targetId, tier);
  p.coins = Math.max(0, (p.coins || 0) - K.tiers[tier].price); g.n++; g.by[targetId + ":" + game.season] = (g.by[targetId + ":" + game.season] || 0) + 1; (L.giftAt = L.giftAt || {})[targetId] = R.week;
  addFond(game, p, targetId, like);
  if (L.partner && L.partner.id === targetId) { bondOf(game, L); L.partner.bond = Math.min(100, (L.partner.bond || 0) + Math.round(like / 2)); }
  remember(game, p.id, "gift", { id: targetId, name: info.name, tier, pub: !!pub });
  const res = { ok: true, name: info.name, notes, pub: !!pub, like, targetId };
  if (pub) publicGesture(game, p, info.name, tier, notes, res); else discover(game, p, targetId, info.name, tier, notes, res);
  return res;
}
const WHAT = { flowers: "a bouquet", watch: "a watch", jewel: "jewellery" };
function publicGesture(game, p, name, tier, notes, res) {
  const K = game.P.social.gift, L = ensureLife(game, p), P = up(p.name), th = openThread(game, "gift", [p.id], `${p.name} sent ${name} ${WHAT[tier]} in public.`);
  applyFx(game, p, { fol: K.publicFol });
  const other = committedTo(L) && L.partner.id !== res.targetId ? L.partner : null;
  deskStory(game, { thread: th.id, kind: "league", icon: "🎁", pid: p.id, prio: other ? 4 : 2, tag: "confirmed", src: "sun",
    head: other ? variant(game, "giftScandal", [`${P} SENDS ${up(name)} ${up(WHAT[tier])}. ${up(other.name)} HAS QUESTIONS`, `${P}'S PUBLIC GIFT TO ${up(name)} DID NOT GO DOWN WELL AT HOME`]) : variant(game, "giftPub", [`${P} MAKES A GRAND GESTURE: ${up(WHAT[tier])} FOR ${up(name)}`, `${P} PUTS ${up(name)} ON THE FRONT PAGE WITH ${up(WHAT[tier])}`, `ROMANCE WATCH: ${P} TO ${up(name)}, WITH ${up(WHAT[tier])}`]),
    sub: other ? `${p.name} is ${L.married ? "married to" : "exclusive with"} ${other.name}. The gift went to ${name}, with a camera nearby and a note that did not mention ${other.name}.` : `${p.name} arranged the delivery, the photographer and the caption. ${name} has "seen it" and has not yet replied, which is the most powerful reply.` });
  if (other) {                                                                // a public gift to someone else is no secret from a partner
    L.partner.bond = Math.max(0, (L.partner.bond || 0) - K.jealous * 2); L.love = Math.max(L.married ? 10 : 0, L.love - 6);
    if (isHuman(other.id)) notes.push({ pid: +other.id.slice(2), text: `${p.name} publicly gave ${name} ${WHAT[tier]}. You read it in the paper.` });
    notes.push({ pid: p.id, text: `${other.name} saw it in public and is not happy (bond down).` });
    remember(game, p.id, "affair", { name, with: name, known: true, what: "public gift" });
  }
}
const committedTo = (L) => !!(L.partner && (L.partner.excl || L.married));
// A private gift is private until a cause reveals it: the partner of either side may find out, and the florist may talk.
const CAUSES = ["found the receipt in a coat pocket", "saw the delivery notification on a shared phone", "heard it from a florist who talks too much", "spotted the box in the boot of the car"];
function discover(game, p, targetId, name, tier, notes, res) {
  const K = game.P.social.gift, L = ensureLife(game, p), R = ensureRom(game), r = makeRng(game.seed, "gdisc", p.id, targetId, R.week, tier);
  const mine = committedTo(L) && L.partner.id !== targetId ? L.partner : null;
  const n = !isHuman(targetId) ? npcState(game, targetId) : null, theirs = n && n.excl != null && n.excl !== p.id ? game.players[n.excl] : null;
  const tierW = { flowers: 0.7, watch: 1, jewel: 1.3 }[tier];
  const cause = CAUSES[Math.floor(r() * CAUSES.length)];
  if (mine && r() < Math.min(0.9, K.noticeChance * tierW)) {
    mine.bond = Math.max(0, (mine.bond || 0) - K.jealous); res.found = { by: mine.name, cause };
    notes.push({ pid: p.id, text: `${mine.name} ${cause} and knows you sent ${name} ${WHAT[tier]}. The bond takes a hit.` });
    if (isHuman(mine.id)) notes.push({ pid: +mine.id.slice(2), text: `You ${cause}: ${p.name} sent ${name} ${WHAT[tier]}.` });
    remember(game, p.id, "affair", { name, with: name, known: true, what: "private gift found" });
    if (r() < 0.25) { const th = openThread(game, "gift", [p.id], `${p.name} sent ${name} ${WHAT[tier]} in private, and ${mine.name} ${cause}.`, { priv: true }); deskStory(game, { thread: th.id, kind: "league", icon: "🕵️", pid: p.id, prio: 3, tag: "rumour", src: "tmz", head: variant(game, "giftLeak", [`WHO IS ${up(p.name)}'S SECRET ADMIRER... AND WHO IS THE ADMIRED?`, `${up(p.name)} AND ${up(name)}: A GIFT, A RECEIPT AND A VERY QUIET HOUSE`]), sub: `Sources say ${mine.name} ${cause}. ${p.name} says it was "just a gift". ${name} says nothing, thoughtfully.` }); }
  } else if (theirs && theirs.life && r() < K.noticeChance * tierW) {
    notes.push({ pid: theirs.id, text: `Rumour: someone sent your partner ${name} ${WHAT[tier]}. You ${cause}. It was ${p.name}.` }); res.found = { by: theirs.name, cause };
    remember(game, theirs.id, "rival", { id: targetId, name: p.name, over: name, pid: p.id });
    remember(game, p.id, "rej", { id: targetId, name: theirs.name, what: "gift found", by: theirs.name });
  }
}
// To another footballer: a request that they accept or return. Nothing is paid until they accept.
function requestGift(game, p, targetId, tier, pub) {
  const R = ensureRom(game), q = game.players[+targetId.slice(2)];
  const r = { id: ++R.reqSeq, kind: "gift", from: p.id, to: q.id, status: "open", season: game.season, week: R.week, tier, pub: !!pub };
  R.req.push(r); if (R.req.length > 60) R.req.splice(0, R.req.length - 60);
  return { ok: true, req: r, pending: true, name: q.name, notes: [{ pid: q.id, text: `${p.name} wants to give you ${WHAT[tier]}${pub ? " as a public gesture" : ""}. Accept or return it (Relationships).` }] };
}
export function replyGift(game, q, reqId, yes) {
  const R = ensureRom(game), r = R.req.find((x) => x.id === reqId && x.to === q.id && x.kind === "gift" && x.status === "open"); if (!r) return fail("Gone");
  const p = game.players[r.from]; if (!p) { r.status = "lapsed"; return fail("Gone"); }
  if (!yes) { r.status = "declined"; remember(game, p.id, "rej", { id: uid(q), name: q.name, what: "gift" }); return { ok: true, yes: false, notes: [{ pid: p.id, text: `${q.name} returned your gift.` }] }; }
  r.status = "accepted"; const st = giftState(game, p, uid(q), r.tier); if (!st.can) { r.status = "lapsed"; return fail(st.why); }
  const K = game.P.social.gift, L = ensureLife(game, p), g = giftLog(game, p, R.week), like = pull(game, p, uid(q), r.tier), notes = [];
  p.coins = Math.max(0, (p.coins || 0) - K.tiers[r.tier].price); g.n++; g.by[uid(q) + ":" + game.season] = (g.by[uid(q) + ":" + game.season] || 0) + 1; (L.giftAt = L.giftAt || {})[uid(q)] = R.week;
  remember(game, p.id, "gift", { id: uid(q), name: q.name, tier: r.tier, pub: r.pub }); remember(game, q.id, "gift", { id: uid(p), name: p.name, tier: r.tier, pub: r.pub, got: true });
  if (L.partner && L.partner.id === uid(q)) { L.partner.bond = Math.min(100, (L.partner.bond || 0) + Math.round(like / 2)); const QL = ensureLife(game, q); if (QL.partner && QL.partner.id === uid(p)) QL.partner.bond = Math.min(100, (QL.partner.bond || 0) + Math.round(like / 2)); }
  notes.push({ pid: p.id, text: `${q.name} accepted ${WHAT[r.tier]} from you.` });
  const res = { ok: true, yes: true, notes, targetId: uid(q) };
  if (r.pub) { res.targetId = uid(q); publicGesture(game, p, q.name, r.tier, notes, res); } else discover(game, p, uid(q), q.name, r.tier, notes, res);
  return res;
}

// ---------- what the league remembers, for the screens and for later articles ----------
export function memoryView(game, p) {
  const m = memOf(game, p.id), L = ensureLife(game, p);
  return { exes: m.ex.slice(-4).map((x) => x.name), rejected: m.rej.slice(-4).map((x) => ({ name: x.name, what: x.what, by: x.by || null })), rivals: [...new Set(m.rival.slice(-6).map((x) => x.name))].slice(0, 4), gifts: m.gift.slice(-4).map((x) => ({ name: x.name, tier: x.tier, pub: x.pub, got: !!x.got })), known: m.affair.slice(-3).map((x) => x.what) };
}
export const giftTiers = (game) => Object.entries(game.P.social.gift.tiers).map(([id, t]) => ({ id, name: GIFT_TIERS[id], price: t.price }));
