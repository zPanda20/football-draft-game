// CPU managers. Each team gets an archetype; all of it is deterministic given the seed.
import { makeRng } from "./rng.js";
import { gauss } from "./rng.js";
import { marketValue, feeFor } from "./market.js";
import { isDef } from "./packs.js";

export const ARCHETYPES = {
  stars:    { noise: 1.0, balance: 0.0, itemTaste: 0.3, len: 2, extra: 0.15, buyItems: 1 },
  balanced: { noise: 1.5, balance: 2.5, itemTaste: 0.6, len: 2, extra: 0.0,  buyItems: 2 },
  gambler:  { noise: 4.5, balance: 1.0, itemTaste: 0.5, len: 1, extra: 0.30, buyItems: 1 },
  techy:    { noise: 1.5, balance: 1.5, itemTaste: 3.0, len: 1, extra: 0.0,  buyItems: 3 },
};
const NAMES = Object.keys(ARCHETYPES), WEIGHTS = [0.30, 0.40, 0.20, 0.10];

export function pickArchetype(r) {
  let x = r(); for (let i = 0; i < NAMES.length; i++) { x -= WEIGHTS[i]; if (x <= 0) return NAMES[i]; }
  return "balanced";
}
const role = (pos) => (pos === "GK" ? "GK" : isDef(pos) ? "DEF" : ["CDM", "CM", "LM", "RM", "CAM"].includes(pos) ? "MID" : "ATT");

// How much a bot likes a player given what it already owns.
function want(game, team, p, a, P) {
  const mine = team.players.map((id) => game.players[id]);
  const hasGk = mine.some((q) => q.pos === "GK");
  let v = p.ovr;
  if (p.pos === "GK") v += hasGk ? -25 : 4;
  else if (!hasGk && game.round >= 4) v -= 0; // keeper pressure comes from the pack guarantee
  if (a.balance) {
    const same = mine.filter((q) => role(q.pos) === role(p.pos)).length;
    const ideal = { DEF: 2, MID: 2, ATT: 2, GK: 1 }[role(p.pos)];
    v -= a.balance * Math.max(0, same - ideal + 1);
    if (same === 0 && p.pos !== "GK") v += a.balance;
  }
  return v;
}

export function botDraftPick(game, ti, hand, P, round) {
  const team = game.teams[ti], a = ARCHETYPES[team.bot], r = makeRng(game.seed, "botpick", game.season, round, ti);
  let best = 0, bestV = -1e9;
  hand.forEach((c, i) => {
    let v;
    if (c.t === "p") v = want(game, team, game.players[c.id], a, P);
    else { const it = game.items.find((x) => x.id === c.id); v = 60 + a.itemTaste * (it.price / 12) - (team.items[it.id] ? 6 : 0); }
    v += gauss(r) * a.noise;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

// Market bid for one lottery round (or null to sit out).
export function botMarketBid(game, ti, P, round) {
  const team = game.teams[ti], a = ARCHETYPES[team.bot], r = makeRng(game.seed, "botbid", game.season, round, ti);
  const cap = team.cap ?? P.money.rosterMax, target = team.bidTarget ?? cap - 1;
  if (team.players.length >= target || team.players.length >= cap) return null;
  const mine = team.players.map((id) => game.players[id]);
  const hasGk = mine.some((q) => q.pos === "GK");
  let best = null, bestV = -1e9;
  const cands = game.pool.map((id) => game.players[id]).sort((x, y) => y.ovr - x.ovr).slice(0, 40);
  for (const p of cands) {
    const len = a.len === 1 || p.age >= 33 ? 1 : p.age <= 28 && p.ovr >= 84 ? 2 : a.len;
    const fee = feeFor(p, len, P);
    if (fee > team.coins) continue;
    // short-handed teams care about price; everyone adds noise so the whole league does not chase the same few names
    const short = team.players.length < P.money.rosterMin + 1;
    let v = want(game, team, p, a, P) - fee / (short ? 18 : 40) + gauss(r) * (2 + a.noise);
    if (p.pos === "GK" && !hasGk) v += 15; // a team with no keeper must find one
    if (p.pos === "GK" && hasGk) v -= 8;
    if (v > bestV) { bestV = v; best = { team: ti, kind: "p", id: p.id, len, extra: 0, fee }; }
  }
  if (!best) return null;
  const spare = team.coins - best.fee;
  best.extra = Math.floor(spare * a.extra * r());
  return best;
}

// Leftover coins go on ordinary items (the cheap ones first), up to a bot's taste.
export function botItemBuys(game, ti, P) {
  const team = game.teams[ti], a = ARCHETYPES[team.bot], buys = [];
  let coins = team.coins;
  const menu = game.items.filter((i) => i.supply == null && !i.storeOnly).sort((x, y) => y.price - x.price);
  const r = makeRng(game.seed, "botitems", game.season, ti);
  for (let n = 0; n < a.buyItems; n++) {
    const afford = menu.filter((i) => i.price <= coins && !(team.items[i.id]) && !buys.includes(i.id));
    if (!afford.length) break;
    const it = afford[Math.floor(r() * afford.length)];
    buys.push(it.id); coins -= it.price;
  }
  return buys;
}
