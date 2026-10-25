// A whole game as plain data plus functions: create, draft, pre-season market, season. The server drives the same
// functions step by step; the balance tests call them straight through with CPU managers on every team.
import { makeRng } from "./rng.js";
import { withParams } from "./params.js";
import { lifeIncome, matchGain, resetSeason as resetLife } from "./life.js";
import { rate, bestLineup, FORMATIONS, SLOT_W, GROUP, genderOk } from "./roster.js";
import { ratings as matchRatings } from "../public/rating.js";   // shared with the browser, which uses it for the live ratings
import { matchSteps } from "./match.js";
import { schedule, standingsOf } from "./fixtures.js";
import { makePool, dealRound, applyPicks } from "./packs.js";
import { resolveMarketRound, buyItem, marketValue, feeFor, incomeScale } from "./market.js";
import { pickArchetype, botDraftPick, botMarketBid, botItemBuys } from "./bots.js";
import { runRetirements, ageAll, botResign, resign, releaseExpired, introduceRookies, runRookieDraft, rookiesToPool, meanDrift, driftFor, retireChance } from "./offseason.js";

export function createGame({ D, N = 20, seed = 1, params = {}, bots = null, gender = "all" }) {
  const P = withParams(params);
  const players = {};
  for (const p of D.players) players[p.id] = rate({ ...p, stam: 100, team: null, contract: 0 }, P);
  const r = makeRng(seed, "teams");
  const teams = [...Array(N).keys()].map((i) => ({
    id: i, name: "Team " + (i + 1), bot: bots?.[i] || pickArchetype(r), human: false,
    players: [], items: {}, coins: P.money.startCoins, picks: [], income: 0,
  }));
  const game = { P, params, seed, gender, season: 1, round: 0, teams, players, items: D.items, supply: {}, pool: [], userPool: [], log: [], news: [], newsSeq: 0, pubSeq: 0, newsFlags: {} };
  game.pool = makePool(D.players.filter((p) => genderOk(gender, p.gender)), N, P);
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

// Which line each player of a line-up stands in ("gk", "back", "mid", "fwd"): the rating rules need it.
export function groupsOf(lineup) {
  const g = {}; if (!lineup) return g;
  if (lineup.gk != null) g[lineup.gk] = "gk";
  FORMATIONS[lineup.formation]?.forEach((slot, i) => { const id = lineup.out[i]; if (id != null) g[id] = GROUP[slot]; });
  return g;
}
// What the screens need to rate a match as it unfolds: both halves' line-ups with each player's line.
export const ratingSides = (first, second) => [0, 1].map((i) => ({ first: first[i], second: second[i], group: { ...groupsOf(first[i]), ...groupsOf(second[i]) } }));

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
  res.firstLineups = m.lineups;
  const rsides = ratingSides(m.lineups, res.lineups), rated = matchRatings(res.events, rsides, { final: true });
  res.ratings = Object.fromEntries(Object.entries(rated).map(([id, o]) => [id, o.r]));
  res.potm = playerOfTheMatch(rated);
  game.stats = game.stats || {};
  for (const [id, o] of Object.entries(rated)) {
    const x = (game.stats[id] = game.stats[id] || { gp: 0, g: 0, a: 0, kp: 0, sh: 0, sv: 0, tk: 0, ic: 0, xg: 0, ga: 0, rt: 0, mo: 0, w: 0, cs: 0, gk: 0 });
    x.gp++; x.rt += o.r; for (const k of ["g", "a", "kp", "sh", "sv", "tk", "ic", "xg", "ga"]) x[k] += o[k];
    const mine = res.score[o.side], theirs = res.score[1 - o.side], inGoal = rsides[o.side].group[id] === "gk";
    x.mo = (x.mo || 0) + (+id === res.potm ? 1 : 0);
    x.w = (x.w || 0) + (mine > theirs ? 1 : 0);
    x.gk = (x.gk || 0) + (inGoal ? 1 : 0);
    x.cs = (x.cs || 0) + (inGoal && theirs === 0 ? 1 : 0);
    x.team = m.sides[o.side].id;
    const up = game.players[id];
    if (up && up.user) {                                                   // a created footballer: good games, goals and assists bring followers
      const line = { g: o.g, a: o.a, r: o.r, potm: +id === res.potm, win: mine > theirs };
      up.lastMatch = { opp: m.sides[1 - o.side].id, gf: mine, ga: theirs, ...line, gain: matchGain(game, up, line) };
    }
  }
  game.goals = game.goals || {};
  res.scorers.forEach((sc, i) => { for (const [pid, n] of Object.entries(sc)) { const e = (game.goals[pid] = game.goals[pid] || { g: 0, team: m.sides[i].id }); e.g += n; e.team = m.sides[i].id; } });
  m.sides.forEach((t, i) => {
    for (const id of m.fx[i].used) { t.items[id]--; if (t.items[id] <= 0) delete t.items[id]; }
    for (const u of m.fx[i].usedPlayer) { const p = game.players[u.pid]; p.items[u.id]--; if (p.items[u.id] <= 0) delete p.items[u.id]; }
    for (const pid of m.fx[i].doped) {
      const rr = makeRng(game.seed, "dope", game.season, m.key, pid);
      if (rr() < P.steroids.catchChance) res.dope.push(suspend(game, pid));
      else if (t.id != null) {                                             // got away with it: the club's uncaught uses this season
        const dk = game.season + ":" + t.id, runs = (game.dopeRuns = game.dopeRuns || {});
        runs[dk] = (runs[dk] || 0) + 1;
        if (runs[dk] > P.steroids.rumourAfter && !(game.dopeRumour || {})[dk]) (res.rumour = res.rumour || []).push({ pid, team: t.id, runs: runs[dk], key: dk });
      }
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
  const P = game.P, M = P.money, N = game.teams.length, out = new Map(), sc = incomeScale(game), sw = (x) => Math.round(x * sc);
  const result = new Map();
  for (const m of day) { const d = Math.sign(m.ga - m.gb); result.set(m.a, d > 0 ? "W" : d < 0 ? "L" : "D"); result.set(m.b, d > 0 ? "L" : d < 0 ? "W" : "D"); }
  table.forEach((row, rank) => {
    const base = sw(M.incomePerMatch), catchup = Math.round(base * M.incomeCatchUp * (rank / Math.max(1, N - 1)));
    const res = result.get(row.i) || null, bonus = sw(res === "W" ? M.winBonus : res === "D" ? M.drawBonus : 0);
    out.set(row.i, { base, catchup, bonus, result: res, total: base + catchup + bonus });
  });
  return out;
}
export function applyIncome(game, bd) {
  for (const [ti, b] of bd) { const t = game.teams[ti]; t.coins += b.total; t.income += b.total; }
  game.userGain = {};
  for (const p of Object.values(game.players)) if (p.user) {
    const li = p.life ? lifeIncome(game, p) : { sponsor: 0, venue: 0, boots: 0, total: 0 }, base = game.P.player.income;
    p.coins = (p.coins || 0) + base + li.total; game.userGain[p.id] = { base, sponsor: li.sponsor, venue: li.venue, boots: li.boots, total: base + li.total };
  }
}
export function payIncome(game, table, day = []) { applyIncome(game, incomeBreakdown(game, table, day)); }

// ---- a season ----
export function playSeason(game, hooks = {}) {
  const P = game.P, N = game.teams.length;
  const days = schedule(N, game.seed + game.season);
  const results = [];
  game.goals = {}; game.stats = {}; resetLife(game);
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
    seed: game.seed, N: game.teams.length, params: game.params || {}, season: game.season, seasons: game.seasons || null, marketAhead: !!game.marketAhead, supply: game.supply, pool: game.pool, rookies: game.rookies || [], history: game.history || [],
    userPool: game.userPool || [], news: game.news || [], newsSeq: game.newsSeq || 0, pubSeq: game.pubSeq || 0, newsFlags: game.newsFlags || {}, dopeRuns: game.dopeRuns || {}, dopeRumour: game.dopeRumour || {}, goals: game.goals || {}, stats: game.stats || {}, gender: game.gender || "all",
    players: Object.fromEntries(Object.values(game.players).map((p) => [p.id, p.rookie || p.user ? { ...p, r: undefined } : Object.fromEntries(PLAYER_KEYS.map((k) => [k, p[k]]))])),
    teams: game.teams.map((t) => ({ ...t })),
  };
}
export function restoreGame(D, snap) {
  const g = createGame({ D, N: snap.N, seed: snap.seed, params: snap.params, gender: snap.gender || "all" });
  g.season = snap.season; g.seasons = snap.seasons || undefined; g.marketAhead = !!snap.marketAhead; g.supply = snap.supply || {}; g.pool = snap.pool; g.userPool = snap.userPool || []; g.goals = snap.goals || {}; g.news = snap.news || []; g.newsSeq = snap.newsSeq || 0; g.pubSeq = snap.pubSeq || 0; g.newsFlags = snap.newsFlags || {}; g.dopeRuns = snap.dopeRuns || {}; g.dopeRumour = snap.dopeRumour || {}; g.stats = snap.stats || {}; g.rookies = snap.rookies || []; g.history = snap.history || [];
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

// Player of the match: the best rating, then goal contributions, then expected goals, then the lower id (stable).
export function playerOfTheMatch(rated) {
  const rows = Object.entries(rated).map(([id, o]) => ({ id: +id, r: o.r, gc: o.g + o.a, xg: o.xg }));
  rows.sort((a, b) => b.r - a.r || b.gc - a.gc || b.xg - a.xg || a.id - b.id);
  return rows.length ? rows[0].id : null;
}

// Season scoring table: [{id, g, team}] best first (ties: more assists, then fewer games, then the lower id, so it is stable).
export function topScorers(game, n = 10) {
  const S = game.stats || {};
  return Object.entries(game.goals || {}).map(([id, e]) => ({ id: +id, g: e.g, team: e.team, a: S[id] ? S[id].a : 0, gp: S[id] ? S[id].gp : 0 }))
    .sort((a, b) => b.g - a.g || b.a - a.a || a.gp - b.gp || a.id - b.id).slice(0, n).map(({ id, g, team }) => ({ id, g, team }));
}

// ---- season awards: Ballon d'Or, Golden Boot, Playmaker, Golden Glove ----
// Ballon d'Or: each part is scored against the best in the league (0 to 1) and weighted: average rating (above a 6.0
// baseline), goals + assists, Player of the Match awards, matches won while playing, and a little star power (overall).
// Only players with enough games count. Returns lists, best first, with the numbers behind each name.
export function seasonAwards(game, days = 0) {
  const A = game.P.awards, S = game.stats || {};
  const rows = Object.entries(S).filter(([, x]) => x.gp > 0).map(([id, x]) => {
    const p = game.players[id];
    return { id: +id, name: p ? p.name : "?", team: x.team, gp: x.gp, g: x.g, a: x.a, kp: x.kp, sv: x.sv, ga: x.ga, tk: x.tk, ic: x.ic, mo: x.mo || 0, w: x.w || 0, cs: x.cs || 0, gk: x.gk || 0, rt: x.rt / x.gp, ovr: p ? p.ovr : 0 };
  });
  const most = Math.max(0, ...rows.map((r) => r.gp)), need = Math.max(1, Math.min(most, Math.ceil((days || most) * A.minShare)));
  const elig = rows.filter((r) => r.gp >= need);
  const top = (list, key, n) => list.slice().sort(key).slice(0, n);
  const out = { need, ballon: [], boot: [], playmaker: [], glove: [] };
  if (!elig.length) return out;
  const mx = (f) => Math.max(1e-9, ...elig.map(f)), floor = A.ovrFloor, ovrMax = Math.max(floor + 1, ...elig.map((r) => r.ovr));
  const rtMax = Math.max(0.01, mx((r) => r.rt) - A.base), gcMax = mx((r) => r.g + r.a), moMax = mx((r) => r.mo), wMax = mx((r) => r.w);
  const W = A.weights;
  const scored = elig.map((r) => {
    const parts = { rating: Math.max(0, (r.rt - A.base) / rtMax), contrib: (r.g + r.a) / gcMax, potm: r.mo / moMax, wins: r.w / wMax, star: Math.max(0, (r.ovr - floor) / (ovrMax - floor)) };
    const score = 100 * (W.rating * parts.rating + W.contrib * parts.contrib + W.potm * parts.potm + W.wins * parts.wins + W.star * parts.star);
    return { ...r, rt: +r.rt.toFixed(2), score: +score.toFixed(1), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +v.toFixed(2)])) };
  });
  out.ballon = top(scored, (a, b) => b.score - a.score || b.rt - a.rt || a.id - b.id, 5);
  out.boot = top(rows.filter((r) => r.g > 0), (a, b) => b.g - a.g || b.a - a.a || a.gp - b.gp || a.id - b.id, 5);
  out.playmaker = top(rows.filter((r) => r.a > 0), (a, b) => b.a - a.a || b.kp - a.kp || b.rt - a.rt || a.id - b.id, 5);
  const gkNeed = Math.max(1, Math.ceil((days || most) * A.gloveShare));
  const sp = (r) => (r.sv + r.ga ? r.sv / (r.sv + r.ga) : 0);
  out.glove = top(rows.filter((r) => r.gk >= gkNeed), (a, b) => b.cs - a.cs || sp(b) - sp(a) || b.rt - a.rt || a.id - b.id, 5).map((r) => ({ ...r, sp: +sp(r).toFixed(3) }));
  // the numbers sent to the browser: keep it small
  const slim = (r) => ({ id: r.id, name: r.name, team: r.team, gp: r.gp, g: r.g, a: r.a, kp: r.kp, mo: r.mo, w: r.w, cs: r.cs, sv: r.sv, ga: r.ga, rt: +r.rt.toFixed(2), ...(r.score != null ? { score: r.score, parts: r.parts } : {}), ...(r.sp != null ? { sp: r.sp } : {}) });
  for (const k of ["ballon", "boot", "playmaker", "glove"]) out[k] = out[k].map(slim);
  return out;
}

// Season leaders for the stats pages: top n of each box-score column (rating needs a few games to count).
export const LEADER_KEYS = ["g", "a", "kp", "tk", "ic", "sv", "mo", "rt"];
export function seasonLeaders(game, n = 10) {
  const rows = Object.entries(game.stats || {}).map(([id, x]) => ({ id: +id, team: x.team, gp: x.gp, g: x.g, a: x.a, kp: x.kp, tk: x.tk, ic: x.ic, sv: x.sv, mo: x.mo || 0, xg: +x.xg.toFixed(1), rt: x.gp ? +(x.rt / x.gp).toFixed(2) : 0 }));
  const out = {};
  for (const k of LEADER_KEYS) {
    const pool = k === "rt" ? rows.filter((r) => r.gp >= Math.min(3, Math.max(...rows.map((q) => q.gp), 0))) : rows.filter((r) => r[k] > 0);
    out[k] = pool.sort((a, b) => b[k] - a[k] || b.g - a.g || a.id - b.id).slice(0, n);
  }
  return out;
}

// A close estimate of what the books look like at the end of the season, for the finance page: income still to come and
// what re-signing each expiring player would cost next off-season (a year older, rated where his age says he will be).
// Real fees move a little with the ageing noise, so these are shown as "about".
export function financeOutlook(game, ti, { table = [], left = 0 } = {}) {
  const P = game.P, M = P.money, t = game.teams[ti], N = game.teams.length;
  const rank = Math.max(0, table.findIndex((r) => r.i === ti));
  const sc = incomeScale(game), base = Math.round(M.incomePerMatch * sc), catchup = Math.round(base * M.incomeCatchUp * (rank / Math.max(1, N - 1)));
  const bonus = Math.round((M.winBonus * 0.4 + M.drawBonus * 0.25) * sc);     // a typical mix of wins and draws
  const per = base + catchup + bonus, r5 = (x) => Math.round(x / 5) * 5;
  // k = how many off-seasons from now the deal runs out (1 = next off-season). Fees are for that off-season: older, rated where age says.
  const project = (p, k) => { const q = { ...p }; for (let i = 0; i < k; i++) { q.age += 1; q.ovr = Math.round(q.ovr + driftFor(q, P)); } return q; };
  const mkList = (k) => t.players.map((id) => game.players[id]).filter((p) => !p.user && (k === 1 ? p.contract <= 1 : p.contract === k)).sort((a, b) => b.ovr - a.ovr).map((p) => {
    const q = project(p, k);
    return { id: p.id, ovrNext: q.ovr, fees: [1, 2, 3].map((l) => r5(feeFor(q, l, P, true))), retire: +retireChance({ ...p, age: p.age + k - 1 }, P, game.season + k - 1).toFixed(2) };
  });
  const ahead = [1, 2, 3].map((k) => ({ k, maxLen: Math.max(0, Math.min(3, (game.seasons || 99) - game.season - k + 1)), list: mkList(k) }));
  const expiring = ahead[0].list;
  const cheapest = expiring.reduce((x, e) => x + e.fees[0] * (1 - e.retire), 0);
  return { coins: t.coins, perMatch: { base, catchup, bonus, total: per }, left, income: per * left, expiring, ahead, cheapest: r5(cheapest), left0: t.coins + per * left - r5(cheapest), roster: t.players.length, cap: t.cap ?? M.rosterMax, staying: t.players.filter((id) => game.players[id].contract > 1 || game.players[id].user).length };
}
