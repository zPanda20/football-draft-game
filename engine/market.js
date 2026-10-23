// Money: market values, contract fees and the market-value lottery used for the pre-season and free agency.
import { makeRng } from "./rng.js";

export function marketValue(p, P) {
  const m = P.money;
  const age = Math.max(m.mvAgeMin, 1 - m.mvAgePerYear * Math.max(0, p.age - m.mvAgeFrom));
  return Math.max(10, Math.round((m.mvBase * Math.exp(m.mvPerOvr * (p.ovr - 81)) * age) / 5) * 5);
}
export const feeFor = (p, len, P) => Math.round(marketValue(p, P) * P.money.lenMult[len]);

// Lottery weight before any extra coins: weaker rosters (lower total market value) get better odds.
export function catchUpWeights(game, P) {
  const vals = game.teams.map((t) => t.players.reduce((a, id) => a + marketValue(game.players[id], P), 0));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
  return vals.map((v) => 1 / (1 + P.money.catchUp * (v / mean)));
}

export const rosterRoom = (team, P) => P.money.rosterMax - team.players.length;

// One lottery round. bids = [{ team: index, kind: "p"|"i", id, len, extra }]. One bid per team per round.
// Contested targets are drawn by tickets = catch-up weight * (1 + extra / minimum offer); only the winner pays.
export function resolveMarketRound(game, bids, P, label) {
  const r = makeRng(game.seed, "market", game.season, label);
  const w = catchUpWeights(game, P);
  const byTarget = new Map(), seen = new Set(), wins = [];
  for (const b of bids) {
    if (seen.has(b.team)) continue;
    const team = game.teams[b.team];
    const target = b.kind === "p" ? game.players[b.id] : game.items.find((i) => i.id === b.id);
    if (!target) continue;
    if (b.kind === "p" && (!game.pool.includes(b.id) || rosterRoom(team, P) <= 0)) continue;
    if (b.kind === "i" && target.supply != null && (game.supply[b.id] ?? target.supply) <= 0) continue;
    const len = b.kind === "p" ? Math.max(1, Math.min(3, b.len | 0 || 1)) : 1;
    const min = b.kind === "p" ? feeFor(target, len, P) : target.price;
    const extra = Math.max(0, Math.min(Math.floor(min * P.money.extraCap), team.coins - min, b.extra | 0));
    if (team.coins < min) continue;
    seen.add(b.team);
    const key = b.kind + ":" + b.id;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push({ team: b.team, kind: b.kind, id: b.id, len, min, extra, tickets: w[b.team] * (1 + extra / min) });
  }
  for (const [key, list] of [...byTarget.entries()].sort()) {
    let x = r() * list.reduce((a, c) => a + c.tickets, 0), win = list[list.length - 1];
    for (const c of list) { x -= c.tickets; if (x <= 0) { win = c; break; } }
    const team = game.teams[win.team], paid = win.min + win.extra;
    team.coins -= paid;
    if (win.kind === "p") {
      const p = game.players[win.id];
      p.team = team.id; p.contract = win.len; team.players.push(win.id);
      game.pool = game.pool.filter((id) => id !== win.id);
    } else {
      const it = game.items.find((i) => i.id === win.id);
      team.items[it.id] = (team.items[it.id] || 0) + it.uses;
      if (it.supply != null) game.supply[it.id] = (game.supply[it.id] ?? it.supply) - 1;
    }
    wins.push({ ...win, paid, contested: list.length, lost: list.filter((c) => c !== win).map((c) => c.team) });
  }
  return wins;
}

// Ordinary items have a fixed price and unlimited supply.
export function buyItem(game, teamIdx, itemId) {
  const team = game.teams[teamIdx], it = game.items.find((i) => i.id === itemId);
  if (!it || it.supply != null || team.coins < it.price) return false;
  team.coins -= it.price; team.items[it.id] = (team.items[it.id] || 0) + it.uses;
  return true;
}
