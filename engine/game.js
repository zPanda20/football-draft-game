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
import { runRetirements, ageAll, botResign, resign, releaseExpired, introduceRookies, runRookieDraft, rookiesToPool } from "./offseason.js";

export function createGame({ D, N = 20, seed = 1, params = {}, bots = null }) {
  const P = withParams(params);
  const players = {};
  for (const p of D.players) players[p.id] = rate({ ...p, stam: 100, team: null, contract: 0 }, P);
  const r = makeRng(seed, "teams");
  const teams = [...Array(N).keys()].map((i) => ({
    id: i, name: "Team " + (i + 1), bot: bots?.[i] || pickArchetype(r), human: false,
    players: [], items: {}, coins: P.money.startCoins, picks: [], income: 0,
  }));
  const game = { P, params, seed, season: 1, round: 0, teams, players, items: D.items, supply: {}, pool: [], userPool: [], log: [] };
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
// Team items come from the team's stock (a manager's own pick in team.active, or the CPU rule). Player items go to
// one wearer: the manager's choice in team.equip, else the best attacker. Banned items (steroids) never go to anyone
// unless a wearer was chosen. Created players can also wear items from their own wallet (p.equip).
export function activeFx(team, lineup, game) {
  const P = game.P, fx = { team: {}, player: {}, used: [], usedPlayer: [], doped: [] };
  const inLine = new Set([lineup.gk, ...lineup.out].filter((x) => x != null));
  const has = (i) => (team.items[i.id] || 0) > 0;
  const owned = Array.isArray(team.active)
    ? team.active.map((id) => game.items.find((i) => i.id === id)).filter((i) => i && has(i)).slice(0, P.items.activeCap)
    : game.items.filter((i) => has(i) && !i.banned).sort((a, b) => b.price - a.price).slice(0, P.items.activeCap);
  const outfield = lineup.out.map((id, i) => ({ id, w: id == null ? 0 : SLOT_W[FORMATIONS[lineup.formation][i]][0] })).filter((x) => x.id != null).sort((a, b) => b.w - a.w);
  const addP = (id, it) => { const o = (fx.player[id] = fx.player[id] || {}); for (const [k, v] of Object.entries(it.fx)) o[k] = (o[k] || 0) + v; };
  let boot = 0;
  for (const it of owned) {
    if (it.scope === "team") { fx.used.push(it.id); for (const [k, v] of Object.entries(it.fx)) fx.team[k] = (fx.team[k] || 0) + v; continue; }
    const want = team.equip ? team.equip[it.id] : null;
    let id = null;
    if (want != null) { if (inLine.has(+want) && !(game.players[+want] && game.players[+want].susp > 0)) id = +want; }
    else if (!it.banned && outfield[boot]) id = outfield[boot++].id;
    if (id == null) continue;
    fx.used.push(it.id); addP(id, it); if (it.banned) fx.doped.push(id);
  }
  for (const id of inLine) {
    const p = game.players[id]; if (!p || !p.user || !p.equip || !p.equip.length) continue;
    let n = 0;
    for (const iid of p.equip) {
      const it = game.items.find((i) => i.id === iid);
      if (!it || it.scope !== "player" || !((p.items || {})[iid] > 0) || n >= P.player.itemCap) continue;
      n++; addP(id, it); fx.usedPlayer.push({ pid: id, id: iid }); if (it.banned) fx.doped.push(id);
    }
  }
  return fx;
}

// ---- suspensions, roster caps ----
// Caught using a banned item: out for the longer of `ban` games and the rest of the season. If that outlasts his
// contract, the suspension stays with him and his team loses a roster spot the season after the contract ends.
export function suspend(game, pid) {
  const P = game.P, p = game.players[pid], md = game.md || { day: 0, total: 0 };
  const left = Math.max(0, md.total - (md.day + 1)), games = Math.max(P.steroids.ban, left);
  p.susp = games; p.suspFresh = true;
  let penalty = null;
  if (p.team != null && md.total > 0) {
    const inContract = left + Math.max(0, p.contract - 1) * md.total;
    if (games > inContract) {
      const t = game.teams[p.team], season = game.season + Math.max(1, p.contract);
      t.slotLoss = { ...(t.slotLoss || {}) }; t.slotLoss[season] = (t.slotLoss[season] || 0) + 1;
      penalty = { team: t.id, season };
    }
  }
  return { pid, team: p.team, games, penalty };
}
// End of a matchday: one game served (a ban handed out today starts tomorrow).
export function tickSuspensions(game) {
  for (const p of Object.values(game.players)) if (p.susp > 0) { if (p.suspFresh) p.suspFresh = false; else p.susp -= 1; }
}
export function applyCaps(game, season) { for (const t of game.teams) t.cap = game.P.money.rosterMax - ((t.slotLoss || {})[season] || 0); }
// A roster over its cap lets its cheapest players go (never the only keeper, never a created player).
export function enforceCap(game) {
  const out = [], P = game.P;
  for (const t of game.teams) {
    while (t.players.length > (t.cap ?? P.money.rosterMax)) {
      const ps = t.players.map((id) => game.players[id]), gks = ps.filter((p) => p.pos === "GK").length;
      const c = ps.filter((p) => !p.user && !(p.pos === "GK" && gks <= 1)).sort((a, b) => marketValue(a, P) - marketValue(b, P))[0];
      if (!c) break;
      t.players = t.players.filter((id) => id !== c.id); c.team = null; game.pool.push(c.id); out.push({ id: c.id, team: t.id });
    }
  }
  return out;
}

// ---- one match: begin (to half-time) and finish (second half) are separate so the server can open a half-time window ----
export function beginMatch(game, a, b, key, hooks = {}) {
  const P = game.P, sides = [a, b].map((ti) => game.teams[ti]);
  const recs = sides.map((t) => rosterOf(game, t).filter((p) => !(p.susp > 0)));
  const lineups = recs.map((r, i) => hooks.lineup?.(sides[i], r) || bestLineup(r, P));
  const fx = sides.map((t, i) => activeFx(t, lineups[i], game));
  const gen = matchSteps({
    seed: game.seed, matchKey: `${game.season}-${key}`, P,
    home: { id: a, name: sides[0].name, players: recs[0], lineup: lineups[0], fx: fx[0] },
    away: { id: b, name: sides[1].name, players: recs[1], lineup: lineups[1], fx: fx[1] },
  });
  const st = gen.next();
  return { a, b, key, sides, recs, fx, gen, ht: st.done ? null : st.value, res: st.done ? st.value : null, lineups };
}
// Players with their half-time stamina, for the lineup chooser.
export const halftimeRecs = (m, i) => m.recs[i].map((p) => ({ ...p, stam: m.ht.stamina[i][p.id] ?? p.stam }));

// changes = [lineupOrNullForHome, lineupOrNullForAway]; null means the CPU picks (bots) via hooks.halftime
export function finishMatch(game, m, changes = [null, null], hooks = {}) {
  const P = game.P;
  let res = m.res;
  if (!res) {
    const next = [0, 1].map((i) => changes[i] || hooks.halftime?.(m.sides[i], halftimeRecs(m, i), i) || bestLineup(halftimeRecs(m, i), P));
    res = m.gen.next({ home: next[0], away: next[1], effort: [hooks.effort?.(m.sides[0]) || null, hooks.effort?.(m.sides[1]) || null] }).value;
  }
  res.dope = [];
  game.goals = game.goals || {};
  res.scorers.forEach((sc, i) => { for (const [pid, n] of Object.entries(sc)) { const e = (game.goals[pid] = game.goals[pid] || { g: 0, team: m.sides[i].id }); e.g += n; e.team = m.sides[i].id; } });
  m.sides.forEach((t, i) => {
    for (const id of m.fx[i].used) { t.items[id]--; if (t.items[id] <= 0) delete t.items[id]; }
    for (const u of m.fx[i].usedPlayer) { const p = game.players[u.pid]; p.items[u.id]--; if (p.items[u.id] <= 0) delete p.items[u.id]; }
    for (const pid of m.fx[i].doped) {
      const rr = makeRng(game.seed, "dope", game.season, m.key, pid);
      if (rr() < P.steroids.catchChance) res.dope.push(suspend(game, pid));
    }
    const played = new Set(res.played[i]);
    for (const p of m.recs[i]) {
      const s = res.stamina[i][p.id] ?? p.stam;
      const rec = (played.has(p.id) ? P.stamina.recoverPlayed : P.stamina.recoverRest) + P.stamina.staRecoverK * (p.sta - 70) + (m.fx[i].player[p.id]?.rec || 0);
      game.players[p.id].stam = Math.max(0, Math.min(100, s + rec));
    }
  });
  return res;
}
export function playOne(game, a, b, key, hooks = {}) { return finishMatch(game, beginMatch(game, a, b, key, hooks), [null, null], hooks); }

// Income after a matchday: a base for everyone, a catch-up share by table position (lowest earns the most), and a
// bonus for a win or a draw. `day` = [{a, b, ga, gb}]. incomeBreakdown works it out, applyIncome pays it (the server
// pays after the full-time screen so the money does not spoil the result).
export function incomeBreakdown(game, table, day = []) {
  const P = game.P, M = P.money, N = game.teams.length, out = new Map();
  const result = new Map();
  for (const m of day) { const d = Math.sign(m.ga - m.gb); result.set(m.a, d > 0 ? "W" : d < 0 ? "L" : "D"); result.set(m.b, d > 0 ? "L" : d < 0 ? "W" : "D"); }
  table.forEach((row, rank) => {
    const base = M.incomePerMatch, catchup = Math.round(base * M.incomeCatchUp * (rank / Math.max(1, N - 1)));
    const res = result.get(row.i) || null, bonus = res === "W" ? M.winBonus : res === "D" ? M.drawBonus : 0;
    out.set(row.i, { base, catchup, bonus, result: res, total: base + catchup + bonus });
  });
  return out;
}
export function applyIncome(game, bd) {
  for (const [ti, b] of bd) { const t = game.teams[ti]; t.coins += b.total; t.income += b.total; }
  for (const p of Object.values(game.players)) if (p.user) p.coins = (p.coins || 0) + game.P.player.income;
}
export function payIncome(game, table, day = []) { applyIncome(game, incomeBreakdown(game, table, day)); }

// ---- a season ----
export function playSeason(game, hooks = {}) {
  const P = game.P, N = game.teams.length;
  const days = schedule(N, game.seed + game.season);
  const results = [];
  game.goals = {};
  days.forEach((day, d) => {
    game.md = { day: d, total: days.length };
    const dayRes = day.map(([a, b]) => {
      const res = playOne(game, a, b, `${d}-${a}-${b}`, hooks);
      return { day: d, a, b, ga: res.score[0], gb: res.score[1], res };
    });
    for (const m of dayRes) results.push(m);
    const table = standingsOf(results, N);
    payIncome(game, table, dayRes);
    tickSuspensions(game);
    hooks.afterDay?.(d, dayRes, table);
  });
  const table = standingsOf(results, N);
  game.lastResults = results;
  return { days: days.length, results, table, champion: game.teams[table[0].i] };
}

// Convenience for tests: draft + pre-season market + season.
export function runWholeSeason(game) {
  runDraft(game); runMarket(game); return playSeason(game);
}

// ---- save / restore (checkpoints). Player records carry everything that can change; the rest comes from the data files. ----
const PLAYER_KEYS = ["ovr", "pac", "sho", "pas", "dri", "def", "phy", "sta", "age", "stam", "team", "contract", "pos", "retired", "drafted", "pot", "susp"];
export function serializeGame(game) {
  return {
    seed: game.seed, N: game.teams.length, params: game.params || {}, season: game.season, supply: game.supply, pool: game.pool, rookies: game.rookies || [], history: game.history || [],
    userPool: game.userPool || [], goals: game.goals || {},
    players: Object.fromEntries(Object.values(game.players).map((p) => [p.id, p.rookie || p.user ? { ...p, r: undefined } : Object.fromEntries(PLAYER_KEYS.map((k) => [k, p[k]]))])),
    teams: game.teams.map((t) => ({ ...t })),
  };
}
export function restoreGame(D, snap) {
  const g = createGame({ D, N: snap.N, seed: snap.seed, params: snap.params });
  g.season = snap.season; g.supply = snap.supply || {}; g.pool = snap.pool; g.userPool = snap.userPool || []; g.goals = snap.goals || {}; g.rookies = snap.rookies || []; g.history = snap.history || [];
  for (const [id, f] of Object.entries(snap.players)) {
    if (!g.players[id]) g.players[id] = { ...f }; else Object.assign(g.players[id], f);
    rate(g.players[id], g.P);
  }
  g.teams = snap.teams.map((t) => ({ ...t }));
  return g;
}

// ---- the whole off-season, straight through with CPU managers (the server runs the same pieces step by step) ----
export function runOffseason(game, D, hooks = {}) {
  const N = game.teams.length;
  applyCaps(game, game.season + 1);
  const worstFirst = (hooks.table || standingsOf(game.lastResults || [], N)).map((r) => r.i).reverse();
  const out = { retired: runRetirements(game) };
  out.moves = ageAll(game);
  game.teams.forEach((t, ti) => { for (const pk of botResign(game, ti)) resign(game, ti, pk.id, pk.len); });
  out.released = releaseExpired(game);
  out.rookies = introduceRookies(game, game.season, D);
  out.draft = runRookieDraft(game, worstFirst, hooks.rookiePick);
  rookiesToPool(game);
  game.season += 1;
  for (const t of game.teams) { t.lineup = null; t.htLineup = null; t.active = undefined; t.equip = undefined; t.marketDone = false; }
  runMarket(game, "fa" + game.season);
  out.cut = enforceCap(game);
  return out;
}

// Season scoring table: [{id, g, team}] best first (ties: the lower id, so it is stable).
export function topScorers(game, n = 10) {
  return Object.entries(game.goals || {}).map(([id, e]) => ({ id: +id, g: e.g, team: e.team })).sort((a, b) => b.g - a.g || a.id - b.id).slice(0, n);
}
