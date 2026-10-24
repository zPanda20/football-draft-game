// One match as a generator. It plays the first half, yields at half-time (so the server can open the sub / tactics
// window), takes the new lineups through next({home, away}), then plays the second half. Every random number is drawn
// up front in a fixed order, so the same seed gives the same match whatever the managers change at half-time.
import { makeRng, gauss } from "./rng.js";
import { SLOT_W, GROUP, FORMATIONS, effective, fatigue, fitMult, drainPerHalf, chooseForFormation, bestLineup } from "./roster.js";

const sig = (x) => 1 / (1 + Math.exp(-x));
const GHOST = { id: -1, pos: "CM", ovr: 40, sta: 50, pac: 40, sho: 40, pas: 40, dri: 40, def: 40, phy: 40, r: { off: 40, def: 40, ctl: 40, gk: 40 }, name: "Empty slot" };
const STATS = ["pac", "sho", "pas", "dri", "def", "phy"];

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
  const who = [], grp = { back: { n: 0 }, mid: { n: 0 }, fwd: { n: 0 } };
  slots.forEach((slot, i) => {
    const p = side.byId.get(side.lineup.out[i]) || GHOST;
    const f = fatigue(stamOf(p), P), fit = fitMult(p.pos, slot, P), [sa, sd, sc] = SLOT_W[slot];
    const ab = pl[p.id]?.all || 0;
    const off = (p.r.off + (pl[p.id]?.off || 0) + ab) * fit * f, def = (p.r.def + ab) * fit * f, ctl = (p.r.ctl + ab) * fit * f;
    a += sa * off; wa += sa; d += sd * def; wd += sd; c += sc * ctl; wc += sc;
    who.push({ p, slot, off: sa * off, def: sd * def, ctl: sc * ctl });
    const G = grp[GROUP[slot]]; G.n++;
    for (const k of STATS) G[k] = (G[k] || 0) + ((p[k] ?? 40) + ab) * fit * f; // raw stats as played: out of position and tired players count for less
  });
  for (const G of Object.values(grp)) for (const k of STATS) G[k] = G.n ? G[k] / G.n : P.shape.ref;
  const g = side.byId.get(side.lineup.gk) || GHOST;
  const gk = ((g.r.gk + (pl[g.id]?.all || 0)) * (g.pos === "GK" ? 1 : P.fit.outfieldInGoal) + (t.gk || 0)) * fatigue(stamOf(g), P);
  return {
    atk: effective(a / wa + (t.atk || 0), P), ctl: effective(c / wc + (t.ctl || 0), P),
    def: effective(d / wd + (t.def || 0), P), gk: effective(gk, P), who, gkP: g,
    g: grp, formation: side.lineup.formation,
  };
}

// ---- formation identities ----
// Counter-play lookup: key "A|B" -> the bonus A gets against B.
const vsCache = new WeakMap();
function matchupFor(P, a, b) {
  let m = vsCache.get(P.shape.vs);
  if (!m) { m = new Map(); for (const [x, y, bx, by] of P.shape.vs) { m.set(x + "|" + y, bx); m.set(y + "|" + x, by); } vsCache.set(P.shape.vs, m); }
  return m.get(a + "|" + b) || {};
}
// What a shape adds to a team's attack / control / defence this moment, in effective points: the formation's own
// offset, the counter-play bonus against the opposing shape, and the stat checks its lines are built around.
export function shapeAdjust(own, opp, P) {
  const S = P.shape, f = S.f[own.formation] || {}, m = matchupFor(P, own.formation, opp.formation), g = own.g, og = opp.g, r = S.ref;
  let atk = (f.atk || 0) + (m.atk || 0), ctl = (f.ctl || 0) + (m.ctl || 0), def = (f.def || 0) + (m.def || 0);
  if (f.feed) atk += f.feed * (g.mid.pas - og.back.def);                    // the lone playmaker's PASS against their DEFENCE
  if (f.retain) ctl += f.retain * ((g.mid.pas + g.mid.dri) / 2 - r);        // two midfielders keep the ball with PASS and DRIBBLE
  if (f.stack) def += f.stack * (0.6 * g.back.def + 0.4 * g.back.phy - r);  // three deep defenders: DEFENCE and PHYSICAL
  if (f.press) ctl += f.press * ((g.mid.pac + g.mid.def) / 2 - r);          // the press wins it back with PACE and DEFENCE
  if (f.rush) atk += f.rush * ((g.mid.pac + g.mid.dri) / 2 - r);            // midfield runners: PACE and DRIBBLE
  return { atk, ctl, def, shotFor: f.shotFor || 0, shotAgainst: f.shotAgainst || 0 };
}
// Chance that a moment is a fast break: the attacker's counter habit, the defender's exposure, and the PACE gap
// between the forwards and the back line.
export function breakChance(A, B, P) {
  const S = P.shape, fa = S.f[A.formation] || {}, fb = S.f[B.formation] || {};
  return sig((fa.counter ?? -2.2) + (fb.exposed || 0) + S.breakK * (A.g.fwd.pac - B.g.back.pac));
}
// Stamina multiplier per player for the slots they fill (high press tires the midfield, an isolated striker runs more).
function roleDrain(side, P) {
  const m = new Map(), dr = P.shape.f[side.lineup.formation]?.drain;
  if (dr) FORMATIONS[side.lineup.formation].forEach((slot, i) => { const id = side.lineup.out[i]; if (id != null && dr[slot]) m.set(id, dr[slot]); });
  return m;
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

  // fast-break rolls come from their own stream so the older draws above are untouched
  const rb = makeRng(seed, "match-break", matchKey), brk = [[], []];
  for (let h = 0; h < 2; h++) for (let m = 0; m < M.moments; m++) brk[h].push(rb());

  // box-score rolls (who made the pass, who won the ball) also have a stream of their own
  const rst = makeRng(seed, "match-stats", matchKey), sdr = [[], []];
  for (let h = 0; h < 2; h++) for (let m = 0; m < M.moments; m++) sdr[h].push({ kp: rst(), has: rst(), act: rst(), kind: rst(), who: rst() });

  const events = [], flow = [];
  const minuteOf = (h, m) => Math.round(h * 45 + ((m + 0.5) / M.moments) * 45);

  function half(h) {
    for (const s of sides) { for (const id of [s.lineup.gk, ...s.lineup.out]) if (id != null) s.played.add(id); s.rd = roleDrain(s, P); }
    const start = sides.map((s) => new Map(s.stam));
    for (let m = 0; m < M.moments; m++) {
      const d = draws[h][m], t = (m + 0.5) / M.moments;
      // stamina at this moment: linear drain through the half for those on the pitch
      const now = sides.map((s, i) => (p) => {
        const on = p.id === s.lineup.gk || s.lineup.out.includes(p.id);
        const base = start[i].get(p.id) ?? 100;
        return on ? Math.max(0, base - t * drainPerHalf(p, P) * (1 + (s.fx.team?.drain || 0)) * (s.drainMul?.get(p.id) ?? 1) * (s.rd?.get(p.id) ?? 1)) : base;
      });
      const tn = sides.map((s, i) => teamNow(s, now[i], P, s.fx));
      const ad = [shapeAdjust(tn[0], tn[1], P), shapeAdjust(tn[1], tn[0], P)];
      const atkOf = (i) => tn[i].atk + ad[i].atk + form[i], defOf = (i) => tn[i].def + ad[i].def + form[i] * 0.5;
      const shotLogit = (a, b, fast = 0) => M.shotBase + M.shotK * (atkOf(a) - defOf(b)) + ad[a].shotFor + ad[b].shotAgainst + fast;
      const ctlA = tn[0].ctl + ad[0].ctl + form[0] + d.nA * M.momentSigma, ctlB = tn[1].ctl + ad[1].ctl + form[1] + d.nB * M.momentSigma;
      const pH = sig(M.possK * (ctlA - ctlB));
      const homeBall = d.poss < pH;
      { // what the display shows: share of the ball and who is pressing (shot chance weighted by the ball), -1 (away) .. +1 (home)
        const tH = sig(shotLogit(0, 1)), tA = sig(shotLogit(1, 0));
        flow.push({ half: h, minute: minuteOf(h, m), ph: +pH.toFixed(3), mom: +Math.max(-1, Math.min(1, (pH * tH - (1 - pH) * tA) / 0.45)).toFixed(3) });
      }
      const A = homeBall ? 0 : 1, B = 1 - A;
      const fast = brk[h][m] < breakChance(tn[A], tn[B], P);
      const minute = minuteOf(h, m);
      const sx = sdr[h][m], shooting = d.shot < sig(shotLogit(A, B, fast ? P.shape.breakShot : 0));
      { // a defender wins the ball or breaks up play (more often when there is no shot)
        const T = P.stats, chance = shooting ? T.defActShot : T.defActMove;
        if (sx.act < chance) {
          const tot = tn[B].who.reduce((x, w) => x + Math.max(1, w.def), 0);
          let pick = sx.who * tot, who = tn[B].who[tn[B].who.length - 1].p;
          for (const w of tn[B].who) { pick -= Math.max(1, w.def); if (pick <= 0) { who = w.p; break; } }
          events.push({ half: h, minute, team: B, type: sx.kind < T.tackleShare ? "tackle" : "intercept", player: who.id });
        }
      }
      if (!shooting) { events.push({ half: h, minute, team: A, type: "move" }); continue; }
      sides[A].shots++;
      // shooter: weighted by attacking contribution
      const tot = tn[A].who.reduce((x, w) => x + Math.max(1, w.off), 0);
      let pick = d.who * tot, shooter = tn[A].who[tn[A].who.length - 1].p;
      for (const w of tn[A].who) { pick -= Math.max(1, w.off); if (pick <= 0) { shooter = w.p; break; } }
      // the keeper and the defence share the goal check; on a fast break the defence is out of the picture, and in the
      // box the back line's PHYSICAL is set against the forwards' PHYSICAL
      const S = P.shape, hold = (S.f[tn[A].formation] || {}).duel || 1;
      const duel = fast ? 0 : Math.max(-S.duelCap, Math.min(S.duelCap, S.duelK * hold * (tn[B].g.back.phy - tn[A].g.fwd.phy)));
      const guard = fast ? tn[B].gk : tn[B].gk * (1 - S.goalDef) + defOf(B) * S.goalDef + duel;
      const pGoal = (g) => sig(M.goalBase + M.goalK * (atkOf(A) - g));
      const scores = d.goal < pGoal(guard);
      const xg = +pGoal(fast ? P.stretch.base : P.stretch.base * (1 - S.goalDef) + defOf(B) * S.goalDef + duel).toFixed(3);   // chance for an average keeper
      // the pass that made the chance (a solo effort now and then; breaks are rarely a clean pass)
      let kp = null;
      if (sx.has < (fast ? P.stats.creatorBreak : P.stats.creator)) {
        const others = tn[A].who.filter((w) => w.p !== shooter), tc = others.reduce((x, w) => x + Math.max(1, w.ctl), 0);
        let pk = sx.kp * tc; kp = others.length ? others[others.length - 1].p.id : null;
        for (const w of others) { pk -= Math.max(1, w.ctl); if (pk <= 0) { kp = w.p.id; break; } }
      }
      if (scores) { sides[A].goals++; sides[A].scorers[shooter.id] = (sides[A].scorers[shooter.id] || 0) + 1; }
      events.push({ half: h, minute, team: A, type: scores ? "goal" : "save", player: shooter.id, keeper: tn[B].gkP.id, xg, ...(kp != null ? { kp } : {}), ...(scores && kp != null ? { assist: kp } : {}), ...(fast ? { fast: 1 } : {}) });
    }
    // end-of-half stamina for everyone on the pitch
    sides.forEach((s, i) => {
      for (const id of [s.lineup.gk, ...s.lineup.out]) {
        if (id == null) continue;
        const p = s.byId.get(id); if (!p) continue;
        s.stam.set(id, Math.max(0, start[i].get(id) - drainPerHalf(p, P) * (1 + (s.fx.team?.drain || 0)) * (s.drainMul?.get(id) ?? 1) * (s.rd?.get(id) ?? 1)));
      }
    });
  }

  half(0);
  const change = yield {
    type: "halftime",
    score: sides.map((s) => s.goals),
    events: events.slice(), flow: flow.slice(),
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
    score: sides.map((s) => s.goals), shots: sides.map((s) => s.shots), events, flow,
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
