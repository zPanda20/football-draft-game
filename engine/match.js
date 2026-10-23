// One match as a generator. It plays the first half, yields at half-time (so the server can open the sub / tactics
// window), takes the new lineups through next({home, away}), then plays the second half. Every random number is drawn
// up front in a fixed order, so the same seed gives the same match whatever the managers change at half-time.
import { makeRng, gauss } from "./rng.js";
import { SLOT_W, FORMATIONS, effective, fatigue, fitMult, drainPerHalf, chooseForFormation, bestLineup } from "./roster.js";

const sig = (x) => 1 / (1 + Math.exp(-x));
const GHOST = { id: -1, pos: "CM", ovr: 40, sta: 50, r: { off: 40, def: 40, ctl: 40, gk: 40 }, name: "Empty slot" };

// Make sure a lineup is usable: right ids, no duplicates, five outfield slots and a keeper. Missing pieces are
// filled from the best remaining players, so a broken submission never breaks the match.
export function sanitizeLineup(lineup, roster, P) {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const fm = lineup && FORMATIONS[lineup.formation] ? lineup.formation : null;
  if (!fm) return bestLineup(roster, P);
  const used = new Set();
  const take = (id) => (byId.has(id) && !used.has(id) ? (used.add(id), id) : null);
  let gk = take(lineup.gk);
  const out = FORMATIONS[fm].map((_, i) => take(lineup.out?.[i]));
  const free = roster.filter((p) => !used.has(p.id));
  if (gk == null && free.length) { const g = free.find((p) => p.pos === "GK") || free[free.length - 1]; gk = take(g.id); }
  const ranked = roster.filter((p) => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  for (let i = 0; i < out.length; i++) if (out[i] == null && ranked.length) out[i] = take(ranked.shift().id);
  return { formation: fm, gk, out, bench: roster.filter((p) => !used.has(p.id)).map((p) => p.id) };
}

// What a team is worth right now, split into attack / control / defence / goalkeeping (effective points).
export function teamNow(side, stamOf, P, fx = {}) {
  const t = fx.team || {}, pl = fx.player || {};
  const slots = FORMATIONS[side.lineup.formation];
  let a = 0, c = 0, d = 0, wa = 0, wc = 0, wd = 0;
  const who = [];
  slots.forEach((slot, i) => {
    const p = side.byId.get(side.lineup.out[i]) || GHOST;
    const f = fatigue(stamOf(p), P), fit = fitMult(p.pos, slot, P), [sa, sd, sc] = SLOT_W[slot];
    const ab = pl[p.id]?.all || 0;
    const off = (p.r.off + (pl[p.id]?.off || 0) + ab) * fit * f, def = (p.r.def + ab) * fit * f, ctl = (p.r.ctl + ab) * fit * f;
    a += sa * off; wa += sa; d += sd * def; wd += sd; c += sc * ctl; wc += sc;
    who.push({ p, slot, off: sa * off });
  });
  const g = side.byId.get(side.lineup.gk) || GHOST;
  const gk = ((g.r.gk + (pl[g.id]?.all || 0)) * (g.pos === "GK" ? 1 : P.fit.outfieldInGoal) + (t.gk || 0)) * fatigue(stamOf(g), P);
  return {
    atk: effective(a / wa + (t.atk || 0), P), ctl: effective(c / wc + (t.ctl || 0), P),
    def: effective(d / wd + (t.def || 0), P), gk: effective(gk, P), who, gkP: g,
  };
}

// side = { id, name, players: [records with .stam], lineup, fx: {team:{}, player:{}} }
export function* matchSteps({ seed, matchKey, home, away, P }) {
  const M = P.match, S = P.stamina;
  const sides = [home, away].map((s) => {
    const roster = s.players;
    const byId = new Map(roster.map((p) => [p.id, p]));
    const stam = new Map(roster.map((p) => [p.id, Math.min(100, (p.stam ?? 100) + (s.fx?.team?.recover || 0))]));
    return { id: s.id, name: s.name, roster, byId, stam, lineup: sanitizeLineup(s.lineup, roster, P), fx: s.fx || {}, played: new Set(), goals: 0, shots: 0, scorers: {} };
  });

  // ---- all random draws, up front, in a fixed order ----
  const r = makeRng(seed, "match", matchKey);
  const form = sides.map((s) => gauss(r) * M.formSigma * (1 + (s.fx.team?.formSigma || 0)));
  const draws = [[], []];
  for (let h = 0; h < 2; h++) for (let m = 0; m < M.moments; m++) draws[h].push({ poss: r(), shot: r(), goal: r(), who: r(), nA: gauss(r), nB: gauss(r) });

  const events = [];
  const minuteOf = (h, m) => Math.round(h * 45 + ((m + 0.5) / M.moments) * 45);

  function half(h) {
    for (const s of sides) for (const id of [s.lineup.gk, ...s.lineup.out]) if (id != null) s.played.add(id);
    const start = sides.map((s) => new Map(s.stam));
    for (let m = 0; m < M.moments; m++) {
      const d = draws[h][m], t = (m + 0.5) / M.moments;
      // stamina at this moment: linear drain through the half for those on the pitch
      const now = sides.map((s, i) => (p) => {
        const on = p.id === s.lineup.gk || s.lineup.out.includes(p.id);
        const base = start[i].get(p.id) ?? 100;
        return on ? Math.max(0, base - t * drainPerHalf(p, P) * (1 + (s.fx.team?.drain || 0)) * (s.drainMul?.get(p.id) ?? 1)) : base;
      });
      const tn = sides.map((s, i) => teamNow(s, now[i], P, s.fx));
      const ctlA = tn[0].ctl + form[0] + d.nA * M.momentSigma, ctlB = tn[1].ctl + form[1] + d.nB * M.momentSigma;
      const homeBall = d.poss < sig(M.possK * (ctlA - ctlB));
      const A = homeBall ? 0 : 1, B = 1 - A;
      const atk = tn[A].atk + form[A], def = tn[B].def + form[B] * 0.5;
      const minute = minuteOf(h, m);
      if (d.shot >= sig(M.shotBase + M.shotK * (atk - def))) { events.push({ half: h, minute, team: A, type: "move" }); continue; }
      sides[A].shots++;
      // shooter: weighted by attacking contribution
      const tot = tn[A].who.reduce((x, w) => x + Math.max(1, w.off), 0);
      let pick = d.who * tot, shooter = tn[A].who[tn[A].who.length - 1].p;
      for (const w of tn[A].who) { pick -= Math.max(1, w.off); if (pick <= 0) { shooter = w.p; break; } }
      const scores = d.goal < sig(M.goalBase + M.goalK * (atk - tn[B].gk));
      if (scores) { sides[A].goals++; sides[A].scorers[shooter.id] = (sides[A].scorers[shooter.id] || 0) + 1; }
      events.push({ half: h, minute, team: A, type: scores ? "goal" : "save", player: shooter.id, keeper: tn[B].gkP.id });
    }
    // end-of-half stamina for everyone on the pitch
    sides.forEach((s, i) => {
      for (const id of [s.lineup.gk, ...s.lineup.out]) {
        if (id == null) continue;
        const p = s.byId.get(id); if (!p) continue;
        s.stam.set(id, Math.max(0, start[i].get(id) - drainPerHalf(p, P) * (1 + (s.fx.team?.drain || 0)) * (s.drainMul?.get(id) ?? 1)));
      }
    });
  }

  half(0);
  const change = yield {
    type: "halftime",
    score: sides.map((s) => s.goals),
    events: events.slice(),
    stamina: sides.map((s) => Object.fromEntries(s.stam)),
  };
  if (change) sides.forEach((s, i) => { const c = i === 0 ? change.home : change.away; if (c) s.lineup = sanitizeLineup(c, s.roster, P); });
  if (change && change.effort) sides.forEach((s, i) => {
    const e = change.effort[i]; if (!e) return;
    s.drainMul = new Map(); s.fx = { ...s.fx, player: { ...(s.fx.player || {}) } };
    for (const [id, mode] of Object.entries(e)) {
      const cfg = P.player[mode]; if (!cfg || !s.byId.has(+id)) continue;
      s.drainMul.set(+id, cfg.drain); s.fx.player[id] = { ...(s.fx.player[id] || {}), all: (s.fx.player[id]?.all || 0) + cfg.bonus };
    }
  });
  half(1);

  return {
    score: sides.map((s) => s.goals), shots: sides.map((s) => s.shots), events,
    scorers: sides.map((s) => s.scorers),
    played: sides.map((s) => [...s.played]),
    stamina: sides.map((s) => Object.fromEntries(s.stam)),
    lineups: sides.map((s) => s.lineup),
  };
}

// Run a whole match without a half-time pause. `auto` can supply half-time lineups (a function of the half-time view).
export function playMatch(cfg, auto = null) {
  const g = matchSteps(cfg);
  let st = g.next();
  if (!st.done) st = g.next(auto ? auto(st.value) : undefined);
  return st.value;
}
