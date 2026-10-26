// Player mode: a human-owned footballer. Created from rolled numbers, grown by career cards, offered to teams in the market.
import { makeRng, gauss, shuffle, clamp } from "./rng.js";
import { rate } from "./roster.js";
import { marketValue, feeFor, rosterRoom, maxLen } from "./market.js";

export const STAT_KEYS = ["pac", "sho", "pas", "dri", "def", "phy"];
export const OUTFIELD_POS = ["ST", "CAM", "CM", "CDM", "CB", "RB", "LB", "RM", "LM", "LW", "RW"];
export const ALL_POS = [...OUTFIELD_POS, "GK"];
// The six numbers a new player gets to hand out: start + spread, jittered, sorted high to low. Same seed, same numbers.
export function rollNumbers(P, seed, label, n = 0) {
  const r = makeRng(seed, "pmroll", label, n), [lo, hi] = P.player.start;
  const ovr = lo + Math.floor(r() * (hi - lo + 1));
  const nums = P.player.spread.map((d) => clamp(Math.round(ovr + d + gauss(r) * 1.5), 45, 97)).sort((a, b) => b - a);
  return { ovr, nums };
}
// assign[i] = which number (index into nums) goes into stat STAT_KEYS[i]. Anything invalid falls back to sorted order.
export function cleanAssign(assign, n = 6) {
  const a = Array.isArray(assign) ? assign.map((x) => x | 0) : [];
  if (a.length === n && new Set(a).size === n && a.every((x) => x >= 0 && x < n)) return a;
  return [...Array(n).keys()];
}
// Sensible default assignment for a position: the biggest numbers go where the position cares most.
const FOCUS = {
  ST: ["sho", "pac", "dri", "pas", "phy", "def"], CAM: ["pas", "dri", "sho", "pac", "phy", "def"], CM: ["pas", "dri", "def", "phy", "sho", "pac"],
  CDM: ["def", "pas", "phy", "dri", "pac", "sho"], CB: ["def", "phy", "pac", "pas", "dri", "sho"], RB: ["def", "pac", "pas", "phy", "dri", "sho"], LB: ["def", "pac", "pas", "phy", "dri", "sho"],
  RM: ["pac", "dri", "pas", "sho", "phy", "def"], LM: ["pac", "dri", "pas", "sho", "phy", "def"], LW: ["pac", "dri", "sho", "pas", "phy", "def"], RW: ["pac", "dri", "sho", "pas", "phy", "def"],
  GK: ["pac", "sho", "dri", "phy", "pas", "def"], // keepers store DIV HAN KIC REF SPE POS in pac sho pas dri def phy
};
export function defaultAssign(pos) {
  const order = FOCUS[pos] || FOCUS.CM;
  return STAT_KEYS.map((k) => order.indexOf(k));      // stat k gets the number at rank = its priority
}

let nextId = 100000;   // clear of the data files (rookie classes use 1000 * class + n)
export function createUserPlayer(game, { token, name, pos, nums, ovr, assign, nat, gender, img }) {
  const P = game.P;
  pos = ALL_POS.includes(pos) ? pos : "CM";
  const a = cleanAssign(assign);
  let id = nextId++; while (game.players[id]) id = nextId++;
  const p = {
    id, slug: "user-" + id, name: String(name || "Player").slice(0, 22), gender: gender === "F" ? "F" : "M", img: String(img || "0-0-0").slice(0, 40), age: 21, nat: nat || "", club: "Free Agent", pos,
    ovr, pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, sta: 80, tier: ovr >= 90 ? "ruby" : ovr >= 85 ? "gold" : "silver",
    stam: 100, team: null, contract: 0, user: true, owner: token, ovrf: ovr, career: { pending: [], log: [], n: 0 }, coins: P.player.startCoins, items: {}, equip: [], packs: P.player.packs, packLog: [],
  };
  STAT_KEYS.forEach((k, i) => { p[k] = nums[a[i]]; });
  game.players[p.id] = rate(p, P);
  game.userPool = game.userPool || []; game.userPool.push(p.id);
  return p;
}

// While the others are still drafting, a footballer can still change his look, position and stats (nothing has been offered yet).
export function reviseUserPlayer(game, p, { name, pos, nums, ovr, assign, nat, gender, img }) {
  if (name) p.name = String(name).slice(0, 22);
  if (nat != null) p.nat = nat;
  if (gender) p.gender = gender === "F" ? "F" : "M";
  if (img) p.img = String(img).slice(0, 40);
  if (ALL_POS.includes(pos)) p.pos = pos;
  if (nums && assign) { const a = cleanAssign(assign); STAT_KEYS.forEach((k, i) => { p[k] = nums[a[i]]; }); p.ovr = ovr; p.ovrf = ovr; p.tier = ovr >= 90 ? "ruby" : ovr >= 85 ? "gold" : "silver"; }
  rate(p, game.P);
  return p;
}

// ---------- career cards ----------
// Each option: odds of the good result, the gain on success, the loss on failure (OVR points), and which stats move.
const CARDS = [
  { id: "gym", kind: "training", title: "Extra gym sessions", text: "The fitness coach offers extra strength work before the next block of games.",
    opts: [{ label: "Do the extra work", p: 0.8, win: { ovr: 1, focus: ["phy", "pac"] }, lose: { ovr: 0 } }, { label: "Keep a normal week", p: 1, win: { ovr: 0 } }] },
  { id: "finishing", kind: "training", title: "Finishing practice", text: "Stay behind after training and work on your shot.",
    opts: [{ label: "Stay behind", p: 0.75, win: { ovr: 1, focus: ["sho", "dri"] }, lose: { ovr: 0 } }, { label: "Rest instead", p: 1, win: { ovr: 0 } }] },
  { id: "passing", kind: "training", title: "Passing drills", text: "The assistant coach runs a long session on short and long passing.",
    opts: [{ label: "Join in", p: 0.8, win: { ovr: 1, focus: ["pas", "dri"] }, lose: { ovr: 0 } }, { label: "Sit it out", p: 1, win: { ovr: 0 } }] },
  { id: "defend", kind: "training", title: "Defensive shape", text: "A film session on positioning and tackling.",
    opts: [{ label: "Study hard", p: 0.8, win: { ovr: 1, focus: ["def", "phy"] }, lose: { ovr: 0 } }, { label: "Skip it", p: 1, win: { ovr: 0 } }] },
  { id: "sprint", kind: "training", title: "Sprint camp", text: "A specialist runs an acceleration camp.",
    opts: [{ label: "Sign up", p: 0.7, win: { ovr: 1, focus: ["pac"] }, lose: { ovr: -1, focus: ["pac"] } }, { label: "No thanks", p: 1, win: { ovr: 0 } }] },
  { id: "diet", kind: "life", title: "New diet plan", text: "A nutritionist offers a strict plan for the season.",
    opts: [{ label: "Follow it", p: 0.7, win: { ovr: 1, focus: ["phy", "pac"] }, lose: { ovr: -1, focus: ["phy"] } }, { label: "Eat how you like", p: 1, win: { ovr: 0 } }] },
  { id: "party", kind: "life", title: "Big night out", text: "Teammates are going out the night before a training block.",
    opts: [{ label: "Go along", p: 0.4, win: { ovr: 1, focus: ["pas", "dri"] }, lose: { ovr: -1, focus: ["phy", "pac"] } }, { label: "Stay home", p: 1, win: { ovr: 0 } }] },
  { id: "sponsor", kind: "life", title: "Sponsor photo shoot", text: "A boot sponsor wants you for a week of appearances.",
    opts: [{ label: "Take the deal", p: 0.5, win: { ovr: 1, focus: ["sho", "pas"] }, lose: { ovr: -1, focus: ["dri"] } }, { label: "Decline", p: 1, win: { ovr: 0 } }] },
  { id: "mentor", kind: "life", title: "A veteran offers advice", text: "An old pro wants to take you under his wing.",
    opts: [{ label: "Listen closely", p: 0.85, win: { ovr: 1, focus: ["pas", "def"] }, lose: { ovr: 0 } }, { label: "Do it your way", p: 0.5, win: { ovr: 1, focus: ["dri", "sho"] }, lose: { ovr: -1, focus: ["pas"] } }] },
  { id: "gamble1", kind: "gamble", title: "The trick-shot challenge", text: "The squad bets on who can pull off a rabona in training.",
    opts: [{ label: "Attempt it", p: 0.35, win: { ovr: 2, focus: ["dri", "sho"] }, lose: { ovr: -1, focus: ["phy"] } }, { label: "Watch", p: 1, win: { ovr: 0 } }] },
  { id: "gamble2", kind: "gamble", title: "Switch your game", text: "The coach suggests a different style of play, a big change.",
    opts: [{ label: "Go for it", p: 0.45, win: { ovr: 2, focus: ["pas", "dri", "sho"] }, lose: { ovr: -2, focus: ["pas", "dri"] } }, { label: "Stay the same", p: 1, win: { ovr: 0 } }] },
  { id: "gamble3", kind: "gamble", title: "Double or nothing", text: "A rival dares you to a one-on-one challenge after training.",
    opts: [{ label: "Accept", p: 0.5, win: { ovr: 2, focus: ["pac", "sho"] }, lose: { ovr: -1, focus: ["pac"] } }, { label: "Walk away", p: 1, win: { ovr: 0 } }] },
];
export const CARD_IDS = CARDS.map((c) => c.id);
export const cardById = (id) => CARDS.find((c) => c.id === id);
const pubCard = (c, n) => ({ n, id: c.id, kind: c.kind, title: c.title, text: c.text, opts: c.opts.map((o) => ({ label: o.label, p: o.p, win: o.win.ovr, lose: o.lose ? o.lose.ovr : 0 })) });

// A new card for this player (seeded). Returns false when there is no room in the queue and the oldest has been dropped.
export function dealCard(game, p, tag) {
  const r = makeRng(game.seed, "pmcard", p.id, game.season, tag), c = p.career;
  const recent = new Set(c.log.slice(-4).map((x) => x.id).concat(c.pending.map((x) => x.id)));
  const pool = CARDS.filter((x) => !recent.has(x.id));
  const card = (pool.length ? pool : CARDS)[Math.floor(r() * (pool.length || CARDS.length))];
  c.n++;
  c.pending.push(pubCard(card, c.n));
  while (c.pending.length > game.P.player.maxQueue) { const old = c.pending.shift(); c.log.push({ n: old.n, id: old.id, title: old.title, lapsed: true, season: game.season }); }
  c.log = c.log.slice(-30);
  return pubCard(card, c.n);
}
// Apply a choice. Returns the result record, or null if there is no such card/option.
export function answerCard(game, p, n, optIdx) {
  const c = p.career, k = c.pending.findIndex((x) => x.n === n); if (k < 0) return null;
  const card = c.pending[k], def = cardById(card.id), opt = def.opts[optIdx | 0]; if (!opt) return null;
  const r = makeRng(game.seed, "pmroll2", p.id, game.season, n, optIdx | 0);
  const ok = r() < opt.p, eff = ok ? opt.win : opt.lose || { ovr: 0 };
  grow(game, p, eff);
  c.pending.splice(k, 1);
  const res = { n, id: card.id, title: card.title, choice: opt.label, p: opt.p, ok, ovr: eff.ovr || 0, season: game.season, risky: opt.p < 1 };
  c.log.push(res);
  return res;
}
function grow(game, p, eff) {
  const d = eff.ovr || 0; if (!d) return;
  const foc = (eff.focus && eff.focus.length ? eff.focus : STAT_KEYS);
  for (const k of foc) p[k] = clamp(p[k] + Math.sign(d) * (Math.abs(d) >= 2 ? 3 : 2), 30, 99);
  p.ovrf = (p.ovrf ?? p.ovr) + d; p.ovr = clamp(Math.round(p.ovrf), 40, 99);
  p.tier = p.ovr >= 90 ? "ruby" : p.ovr >= 85 ? "gold" : "silver";
  rate(p, game.P);
}
// An unanswered card is forgotten at season end.
export function lapseCards(game, p) { const c = p.career; for (const x of c.pending) c.log.push({ n: x.n, id: x.id, title: x.title, lapsed: true, season: game.season }); c.pending = []; }

// ---------- a created player's own wallet and items ----------
export function buyForUser(game, p, itemId, { store = false } = {}) {
  const it = game.items.find((i) => i.id === itemId);
  if (!it || it.scope !== "player" || it.supply != null || (it.storeOnly && !store) || p.coins < it.price) return false;
  p.coins -= it.price; p.items[it.id] = (p.items[it.id] || 0) + it.uses; return true;
}
export function setEquip(game, p, ids) {
  const ok = (Array.isArray(ids) ? ids : []).filter((id, i, a) => a.indexOf(id) === i && (p.items[id] || 0) > 0 && game.items.find((x) => x.id === id && x.scope === "player"));
  p.equip = ok.slice(0, game.P.player.itemCap);
}
// A manager hands one use of a player item to the created player on his roster.
export function giftItem(game, ti, pid, itemId) {
  const t = game.teams[ti], p = game.players[pid], it = game.items.find((i) => i.id === itemId);
  if (!t || !p || !p.user || p.team !== ti || !it || it.scope !== "player" || !((t.items[itemId] || 0) > 0)) return false;
  t.items[itemId]--; if (t.items[itemId] <= 0) delete t.items[itemId];
  p.items[itemId] = (p.items[itemId] || 0) + 1; return true;
}

// ---------- teams and offers ----------
export const unsigned = (game) => (game.userPool || []).map((id) => game.players[id]).filter((p) => p && !p.retired && p.team == null);
// A signed player joins a team at the market price, or at the price agreed in an offer (a manager pays; a CPU gift is free).
export function signUser(game, p, ti, len, free = false, agreed = null) {
  const t = game.teams[ti], P = game.P;
  if (p.team != null || p.retired || rosterRoom(t, P) <= 0) return false;
  len = Math.max(1, Math.min(maxLen(game, !!game.marketAhead), len | 0 || 1));
  const fee = free ? 0 : agreed ?? feeFor(p, len, P);
  if (t.coins < fee) return false;
  t.coins -= fee; p.team = ti; p.contract = len; t.players.push(p.id);
  game.userPool = (game.userPool || []).filter((x) => x !== p.id);
  return fee;
}
// Squeeze one more player into a squad: the weakest outfielder (never the only keeper, never a created player) goes to the free-agent pool.
export function makeRoom(game, ti) {
  const t = game.teams[ti], P = game.P; if (rosterRoom(t, P) > 0) return true;
  const gks = t.players.filter((id) => game.players[id].pos === "GK").length;
  const out = t.players.map((id) => game.players[id]).filter((q) => !q.user && !(q.pos === "GK" && gks <= 1)).sort((a, b) => a.ovr - b.ovr || b.contract - a.contract)[0];
  if (!out) return false;
  t.players = t.players.filter((id) => id !== out.id); out.team = null; out.contract = 0; game.pool.push(out.id);
  return true;
}
// A CPU team stands by its offer even if it has since spent the money or filled the squad: it makes room and pays what it can.
export function signUserCpu(game, p, ti, len, fee) {
  const t = game.teams[ti];
  if (!makeRoom(game, ti)) return false;
  return signUser(game, p, ti, len, false, Math.min(fee, Math.max(0, Math.floor(t.coins))));
}
// CPU teams that make an offer when a market opens: those with room and coins, weaker rosters a bit more often.
export function cpuOffers(game, p, tag) {
  const P = game.P, r = makeRng(game.seed, "pmoffer", p.id, game.season, tag), out = [];
  const cands = game.teams.filter((t) => !t.human && rosterRoom(t, P) > 0).map((t) => {
    const len = Math.min(maxLen(game, !!game.marketAhead), p.age >= 33 ? 1 : 1 + Math.floor(r() * 3)), fee = feeFor(p, len, P);
    return { t, len, fee, w: t.coins >= fee ? 0.3 + r() + (1 - t.players.length / P.money.rosterMax) : 0 };
  }).filter((c) => c.w > 0).sort((a, b) => b.w - a.w);
  for (const c of cands.slice(0, P.player.offersPerMarket)) out.push({ team: c.t.id, len: c.len, fee: c.fee });
  return out;
}
// Nobody signed him: a CPU team takes him on a free contract (the weakest roster with room), else any team with room, else a CPU team makes room.
export function cpuTakes(game, p) {
  const P = game.P, by = (a, b) => a.players.length - b.players.length || a.coins - b.coins;
  const t = game.teams.filter((x) => !x.human && rosterRoom(x, P) > 0).sort(by)[0] || game.teams.filter((x) => rosterRoom(x, P) > 0).sort(by)[0];
  if (t) return signUser(game, p, t.id, P.player.cpuContract, true) !== false;
  const cpu = game.teams.filter((x) => !x.human).sort((a, b) => a.players.length - b.players.length || a.coins - b.coins)[0] || game.teams[0];
  return makeRoom(game, cpu.id) && signUser(game, p, cpu.id, P.player.cpuContract, true) !== false;
}

// ---------- item packs (opened during the pack draft) ----------
// Each pack holds one thing: a low or mid pair of boots, an ice bath, or a small purse of coins. Same seed, same packs.
export function packOdds(game) {
  const own = game.items.filter((i) => i.scope === "player" && i.supply == null && !i.storeOnly);
  const lows = own.filter((i) => i.tier === "low"), mids = own.filter((i) => i.tier === "mid"), rest = own.filter((i) => !i.tier);
  return [...lows.map((i) => ({ w: 30 / Math.max(1, lows.length), id: i.id })), ...mids.map((i) => ({ w: 22 / Math.max(1, mids.length), id: i.id })), ...rest.map((i) => ({ w: 18 / Math.max(1, rest.length), id: i.id })), { w: 12, coins: true }];
}
export function openItemPack(game, p) {
  if (!p || !p.user || !(p.packs > 0)) return null;
  const n = (p.packLog || []).length, r = makeRng(game.seed, "ipack", p.id, n), odds = packOdds(game), tot = odds.reduce((a, o) => a + o.w, 0);
  let x = r() * tot, pick = odds[odds.length - 1]; for (const o of odds) { if ((x -= o.w) < 0) { pick = o; break; } }
  let res;
  if (pick.coins) { const [lo, hi] = game.P.player.packCoins, amt = lo + Math.floor(r() * (hi - lo + 1)); p.coins += amt; res = { kind: "coins", amt }; }
  else { const it = game.items.find((i) => i.id === pick.id); p.items[it.id] = (p.items[it.id] || 0) + it.uses; res = { kind: "item", id: it.id, uses: it.uses }; }
  p.packs--; p.packLog = [...(p.packLog || []), res];
  return res;
}
