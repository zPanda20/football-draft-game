// A whole game as plain data plus functions: create, draft, pre-season market, season. The server drives the same
// functions step by step; the balance tests call them straight through with CPU managers on every team.
import { makeRng } from "./rng.js";
import { withParams } from "./params.js";
import { rate, bestLineup, FORMATIONS, SLOT_W } from "./roster.js";
import { matchSteps } from "./match.js";
import { schedule, standingsOf } from "./fixtures.js";
import { makePool, dealRound, applyPicks } from "./packs.js";
import { resolveMarketRound, buyItem, marketValue } from "./market.js";
import { pickArchetype, botDraftPick, botMarketBid, botItemBuys } from "./bots.js";

export function createGame({ D, N = 20, seed = 1, params = {}, bots = null }) {
  const P = withParams(params);
  const players = {};
  for (const p of D.players) players[p.id] = rate({ ...p, stam: 100, team: null, contract: 0 }, P);
  const r = makeRng(seed, "teams");
  const teams = [...Array(N).keys()].map((i) => ({
    id: i, name: "Team " + (i + 1), bot: bots?.[i] || pickArchetype(r), human: false,
    players: [], items: {}, coins: P.money.startCoins, picks: [], income: 0,
  }));
  const game = { P, seed, season: 1, round: 0, teams, players, items: D.items, supply: {}, pool: [], log: [] };
  game.pool = makePool(D.players, N, P);
  return game;
}

export const rosterOf = (game, team) => team.players.map((id) => game.players[id]);

// ---- draft ----
export function runDraft(game, pickFor = null) {
  const P = game.P;
  for (let round = 1; round <= P.packs.rounds; round++) {
    game.round = round;
    const hands = dealRound(game, round, P);
    const picks = hands.map((h, ti) => (pickFor && pickFor(ti, h, round)) ?? botDraftPick(game, ti, h, P, round));
    applyPicks(game, hands, picks, P);
  }
  game.round = 0;
}

// ---- pre-season market (also used for free agency): lottery rounds until nobody bids ----
export function runMarket(game, label = "pre", bidFor = null, maxRounds = 8) {
  const P = game.P;
  for (let k = 0; k < maxRounds; k++) {
    const bids = [];
    game.teams.forEach((t, ti) => { const b = (bidFor && bidFor(ti, k)) ?? botMarketBid(game, ti, P, k); if (b) bids.push(b); });
    if (!bids.length) break;
    const wins = resolveMarketRound(game, bids, P, label + k);
    if (!wins.length) break;
  }
  game.teams.forEach((t, ti) => { for (const id of botItemBuys(game, ti, P)) buyItem(game, ti, id); });
  autoFill(game);
}

// Roster shortfall: a team below the minimum (or with no keeper) gets the cheapest free agents on a 1-season deal.
export function autoFill(game) {
  const P = game.P;
  for (const t of game.teams) {
    const free = () => game.pool.map((id) => game.players[id]);
    const hasGk = () => rosterOf(game, t).some((p) => p.pos === "GK");
    const sign = (p) => { p.team = t.id; p.contract = 1; t.players.push(p.id); game.pool = game.pool.filter((id) => id !== p.id); t.filled = (t.filled || 0) + 1; };
    if (!hasGk()) { const g = free().filter((p) => p.pos === "GK").sort((a, b) => b.ovr - a.ovr)[0]; if (g) sign(g); }
    while (t.players.length < P.money.rosterMin) {
      const c = free().sort((a, b) => marketValue(a, P) - marketValue(b, P))[0];
      if (!c) break; sign(c);
    }
  }
}

// ---- items in a match ----
function activeFx(team, lineup, game) {
  const P = game.P, fx = { team: {}, player: {}, used: [] };
  const owned = game.items.filter((i) => (team.items[i.id] || 0) > 0).sort((a, b) => b.price - a.price).slice(0, P.items.activeCap);
  const outfield = lineup.out.map((id, i) => ({ id, w: id == null ? 0 : SLOT_W[FORMATIONS[lineup.formation][i]][0] })).filter((x) => x.id != null).sort((a, b) => b.w - a.w);
  let boot = 0;
  for (const it of owned) {
    fx.used.push(it.id);
    if (it.scope === "team") for (const [k, v] of Object.entries(it.fx)) fx.team[k] = (fx.team[k] || 0) + v;
    else if (outfield[boot]) { const id = outfield[boot++].id; fx.player[id] = { off: (fx.player[id]?.off || 0) + (it.fx.off || 0) }; }
  }
  return fx;
}

// ---- one match: bots set the lineup, re-pick at half-time with the stamina they now have ----
export function playOne(game, a, b, key, hooks = {}) {
  const P = game.P, sides = [a, b].map((ti) => game.teams[ti]);
  const recs = sides.map((t) => rosterOf(game, t));
  const lineups = recs.map((r, i) => hooks.lineup?.(sides[i], r) || bestLineup(r, P));
  const fx = sides.map((t, i) => activeFx(t, lineups[i], game));
  const gen = matchSteps({
    seed: game.seed, matchKey: `${game.season}-${key}`, P,
    home: { id: a, name: sides[0].name, players: recs[0], lineup: lineups[0], fx: fx[0] },
    away: { id: b, name: sides[1].name, players: recs[1], lineup: lineups[1], fx: fx[1] },
  });
  let st = gen.next();
  if (!st.done) {
    const ht = st.value;
    const next = recs.map((r, i) => {
      const view = r.map((p) => ({ ...p, stam: ht.stamina[i][p.id] ?? p.stam }));
      return hooks.halftime?.(sides[i], view, i) || bestLineup(view, P);
    });
    st = gen.next({ home: next[0], away: next[1] });
  }
  const res = st.value;
  sides.forEach((t, i) => {
    const used = fx[i].used;
    for (const id of used) { t.items[id]--; if (t.items[id] <= 0) delete t.items[id]; }
  });
  // stamina carries over: what was left, plus recovery (more for those who sat out)
  sides.forEach((t, i) => {
    const played = new Set(res.played[i]);
    for (const p of recs[i]) {
      const s = res.stamina[i][p.id] ?? p.stam;
      const rec = (played.has(p.id) ? P.stamina.recoverPlayed : P.stamina.recoverRest) + P.stamina.staRecoverK * (p.sta - 70);
      game.players[p.id].stam = Math.max(0, Math.min(100, s + rec));
    }
  });
  return res;
}

// ---- a season ----
export function playSeason(game, hooks = {}) {
  const P = game.P, N = game.teams.length;
  const days = schedule(N, game.seed + game.season);
  const results = [];
  days.forEach((day, d) => {
    const dayRes = day.map(([a, b]) => {
      const res = playOne(game, a, b, `${d}-${a}-${b}`, hooks);
      return { day: d, a, b, ga: res.score[0], gb: res.score[1], res };
    });
    for (const m of dayRes) results.push(m);
    const table = standingsOf(results, N);
    table.forEach((row, rank) => {
      const t = game.teams[row.i];
      const inc = Math.round(P.money.incomePerMatch * (1 + P.money.incomeCatchUp * (rank / (N - 1))));
      t.coins += inc; t.income += inc;
    });
    hooks.afterDay?.(d, dayRes, table);
  });
  const table = standingsOf(results, N);
  return { days: days.length, results, table, champion: game.teams[table[0].i] };
}

// Convenience for tests: draft + pre-season market + season.
export function runWholeSeason(game) {
  runDraft(game); runMarket(game); return playSeason(game);
}
