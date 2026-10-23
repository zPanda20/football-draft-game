// Manager-to-manager trades: players, items and coins; both sides must accept; at most N assets per side.
import { marketValue } from "./market.js";

// asset = { k: "p", id } | { k: "i", id } (the whole stack) | { k: "c", amt }
export function validateOffer(game, o) {
  const P = game.P, max = P.trade.maxAssets;
  if (o.from === o.to || !game.teams[o.from] || !game.teams[o.to]) return "Choose another team.";
  if (!o.give.length && !o.get.length) return "Add something to the deal.";
  if (o.give.length > max || o.get.length > max) return `At most ${max} assets per side.`;
  const side = (ti, list) => {
    const t = game.teams[ti], seen = new Set(); let coins = 0, players = 0;
    for (const a of list) {
      const key = a.k + (a.id ?? "");
      if (a.k !== "c" && seen.has(key)) return "Duplicate asset.";
      seen.add(key);
      if (a.k === "p") { if (!t.players.includes(a.id)) return "A player in the deal is no longer on that team."; if (game.players[a.id].user) return "Created players cannot be traded."; players++; }
      else if (a.k === "i") { if (!(t.items[a.id] > 0)) return "An item in the deal is no longer owned."; }
      else if (a.k === "c") { if (!(a.amt > 0) || a.amt > t.coins || coins) return "Bad coin amount."; coins = a.amt; }
      else return "Unknown asset.";
    }
    return { players };
  };
  const g = side(o.from, o.give), r = side(o.to, o.get);
  if (typeof g === "string") return g; if (typeof r === "string") return r;
  const a = game.teams[o.from], b = game.teams[o.to];
  if (a.players.length - g.players + r.players > P.money.rosterMax) return `${a.name} would have more than ${P.money.rosterMax} players.`;
  if (b.players.length - r.players + g.players > P.money.rosterMax) return `${b.name} would have more than ${P.money.rosterMax} players.`;
  return null;
}
export function executeOffer(game, o) {
  const move = (from, to, list) => {
    for (const a of list) {
      if (a.k === "p") { const p = game.players[a.id]; game.teams[from].players = game.teams[from].players.filter((x) => x !== a.id); game.teams[to].players.push(a.id); p.team = to; }
      else if (a.k === "i") { const n = game.teams[from].items[a.id]; delete game.teams[from].items[a.id]; game.teams[to].items[a.id] = (game.teams[to].items[a.id] || 0) + n; }
      else { game.teams[from].coins -= a.amt; game.teams[to].coins += a.amt; }
    }
  };
  move(o.from, o.to, o.give); move(o.to, o.from, o.get);
}
export function valueOf(game, list) {
  let v = 0;
  for (const a of list) {
    if (a.k === "p") v += marketValue(game.players[a.id], game.P) * Math.max(1, game.players[a.id].contract) * 0.8;
    else if (a.k === "i") { const it = game.items.find((i) => i.id === a.id); v += it ? it.price * 0.6 : 0; }
    else v += a.amt;
  }
  return v;
}
// CPU answer to an offer made to it: take it if it clearly gains value and does not strip its only keeper.
export function botVerdict(game, o) {
  const P = game.P, t = game.teams[o.to];
  const gets = valueOf(game, o.give), gives = valueOf(game, o.get);
  const keepers = t.players.filter((id) => game.players[id].pos === "GK").length;
  const losesKeeper = o.get.filter((a) => a.k === "p" && game.players[a.id].pos === "GK").length;
  if (keepers - losesKeeper < 1 && !o.give.some((a) => a.k === "p" && game.players[a.id].pos === "GK")) return false;
  return gets >= gives * P.trade.botMargin && gets > 0;
}
