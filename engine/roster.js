// Positions, fit penalties, formations and lineup choice. Pure functions of player records and the tunables.
// Which players a league uses: everyone, only the women, or only the men.
export const genderOk = (gender, g) => !gender || gender === "all" || (gender === "female" ? g === "Female" || g === "F" : gender === "male" ? g === "Male" || g === "M" : true);
export const POSITIONS = ["GK", "CB", "LB", "RB", "CDM", "CM", "LM", "RM", "CAM", "LW", "RW", "ST"];

// Where each position sits on the pitch: [depth from own goal, width -1 left .. +1 right].
export const XY = { GK: [0, 0], CB: [1, 0], LB: [1.5, -1], RB: [1.5, 1], CDM: [2, 0], CM: [3, 0], LM: [3, -1], RM: [3, 1], CAM: [4, 0], LW: [4.5, -1], RW: [4.5, 1], ST: [5, 0] };

// How much each slot role cares about [attack, defence, control].
// Polarised on purpose: a striker adds nothing to defence and a centre-back nothing to attack, so a formation's
// totals are made by who it puts where (a plain average would pull every shape toward the middle).
export const SLOT_W = {
  CB: [0.00, 1.50, 0.30], LB: [0.30, 1.10, 0.40], RB: [0.30, 1.10, 0.40], CDM: [0.20, 1.10, 0.90], CM: [0.60, 0.50, 1.20],
  LM: [0.80, 0.40, 0.70], RM: [0.80, 0.40, 0.70], CAM: [1.10, 0.20, 1.00], LW: [1.30, 0.10, 0.50], RW: [1.30, 0.10, 0.50], ST: [1.50, 0.00, 0.30],
};
// Which line of the team a slot belongs to (the stat checks look at whole lines, not single positions).
export const GROUP = { CB: "back", LB: "back", RB: "back", CDM: "mid", CM: "mid", LM: "mid", RM: "mid", CAM: "mid", LW: "fwd", RW: "fwd", ST: "fwd" };

// Five outfield slots each (the keeper is always the sixth player). A starting list for you to edit.
export const FORMATIONS = {
  "2-2-1": ["CB", "CB", "CM", "CM", "ST"],
  "2-1-2": ["CB", "CB", "CM", "ST", "ST"],
  "1-2-2": ["CB", "CM", "CM", "LW", "RW"],
  "3-1-1": ["LB", "CB", "RB", "CDM", "ST"],
  "2-2-1 wide": ["LB", "RB", "LM", "RM", "ST"],
  "1-3-1": ["CB", "LM", "CM", "RM", "ST"],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

// Which side of the pitch each slot of a formation is on: -1 left, 0 middle, +1 right. LB/LM/LW and RB/RM/RW are wide by name;
// a pair of the same slot (CB CB, CM CM, ST ST) is a left one and a right one, in the order they are listed.
export function slotSides(slots) {
  return slots.map((s, i) => {
    if (XY[s][1] !== 0) return XY[s][1];
    const same = slots.filter((x) => x === s);
    return same.length === 2 ? (slots.indexOf(s) === i ? -1 : 1) : 0;
  });
}

// Rating multiplier for playing a position in a slot of a different role. In the right line (defence, midfield, attack) the
// cost is small (nothing for a half-step like LB/CB), and nothing at all if the player is on his own flank (a left back as the left centre-back of a pair; a
// central defender fits either side of a pair). A wide player alone in the middle loses a little; the wrong flank a bit more.
// Between lines the cost is the distance on the pitch.
export function fitMult(pos, slot, P, side = 0) {
  if (pos === slot) return 1;
  if (pos === "GK") return P.fit.gkInOutfield;
  const [d1, w1] = XY[pos], [d2, w2] = XY[slot], dd = Math.abs(d1 - d2), sw = w2 || side;
  const miss = w1 === 0 ? (w2 !== 0 ? 1 : 0) : sw === w1 ? 0 : sw === 0 ? 1 : 2;
  if (GROUP[pos] === GROUP[slot]) return Math.max(P.fit.floor, 1 - P.fit.lineUnit * Math.max(0, dd - 0.5) - P.fit.sideUnit * miss);
  return Math.max(P.fit.floor, 1 - P.fit.perUnit * Math.hypot(dd, miss * P.fit.widthWeight));
}

// Per-player role ratings, built from OVR and the six stats. Keepers' six columns are dive, handling, kicking,
// reflexes, speed, positioning, so the goalkeeping rating reads PAC, SHO, DRI and PHY.
export function rate(p, P) {
  const b = P.blendOvr, o = p.ovr, m = 1 - b;
  p.r = {
    off: b * o + m * (0.35 * p.sho + 0.30 * p.dri + 0.20 * p.pas + 0.15 * p.pac),
    def: b * o + m * (0.55 * p.def + 0.25 * p.phy + 0.20 * p.pac),
    ctl: b * o + m * (0.50 * p.pas + 0.30 * p.dri + 0.20 * p.phy),
    gk: b * o + m * (0.30 * p.pac + 0.25 * p.sho + 0.25 * p.dri + 0.20 * p.phy),
  };
  return p;
}

export const effective = (x, P) => P.stretch.base + (x - P.stretch.centre) * P.stretch.k;

// Stamina -> rating multiplier. `s` is the stamina bar (0-100).
export const fatigue = (s, P) => 1 - P.stamina.fatigueK * (1 - Math.max(0, Math.min(100, s)) / 100);
// Stamina lost per half by a player with this STA (keepers tire more slowly).
export const drainPerHalf = (p, P) => (p.pos === "GK" ? P.stamina.gk.base + P.stamina.gk.slope * Math.max(0, P.stamina.gk.below - p.sta) : P.stamina.drainPerHalf * (1.5 - p.sta / 100));

// Raw (unstretched) score of a player in an outfield slot, at stamina factor f.
export function slotRaw(p, slot, P, f = 1, side = 0) {
  const [wa, wd, wc] = SLOT_W[slot];
  return ((wa * p.r.off + wd * p.r.def + wc * p.r.ctl) / (wa + wd + wc)) * fitMult(p.pos, slot, P, side) * f;
}
export function gkRaw(p, P, f = 1) { return p.r.gk * (p.pos === "GK" ? 1 : P.fit.outfieldInGoal) * f; }

// How tired a player is expected to be on average over the coming match (used to choose a lineup).
function avgFactor(p, P) {
  const mid = Math.max(0, (p.stam ?? 100) - drainPerHalf(p, P));
  return fatigue(mid, P);
}

// Best five outfielders for a formation (exact, by dynamic programming over subsets) plus the best keeper.
export function chooseForFormation(players, formation, P, { fixedGk = null } = {}) {
  const slots = FORMATIONS[formation], sides = slotSides(slots);
  let gk = fixedGk ?? null;
  if (gk == null && players.length) {
    let best = -1;
    for (const p of players) { const v = gkRaw(p, P, avgFactor(p, P)); if (v > best) { best = v; gk = p; } }
  }
  const cands = players.filter((p) => p !== gk);
  const n = Math.min(cands.length, 9), C = cands.slice(0, n);
  // dp[i][mask] = best total after filling slots 0..i-1 using the players in mask
  const M = C.map((p) => slots.map((s, i) => slotRaw(p, s, P, avgFactor(p, P), sides[i])));
  const size = 1 << n;
  const dp = [new Float64Array(size).fill(-1e9)]; dp[0][0] = 0;
  const from = [];
  for (let i = 0; i < slots.length; i++) {
    const next = new Float64Array(size).fill(-1e9), back = new Int16Array(size).fill(-1);
    for (let mask = 0; mask < size; mask++) {
      const cur = dp[i][mask]; if (cur < -1e8) continue;
      for (let c = 0; c < n; c++) {
        if (mask & (1 << c)) continue;
        const nm = mask | (1 << c), v = cur + M[c][i];
        if (v > next[nm]) { next[nm] = v; back[nm] = c; }
      }
    }
    dp.push(next); from.push(back);
  }
  let bestMask = -1, bestV = -1e9;
  const filled = Math.min(slots.length, n);
  // when fewer candidates than slots the remaining slots stay empty (handled by the caller)
  if (n >= slots.length) {
    for (let mask = 0; mask < size; mask++) if (dp[slots.length][mask] > bestV) { bestV = dp[slots.length][mask]; bestMask = mask; }
  }
  const out = new Array(slots.length).fill(null);
  if (bestMask >= 0) {
    let mask = bestMask;
    for (let i = slots.length - 1; i >= 0; i--) { const c = from[i][mask]; out[i] = C[c]; mask &= ~(1 << c); }
  } else {
    // short roster: greedy fill
    const used = new Set();
    slots.forEach((s, i) => { let b = null, bv = -1; for (const p of C) if (!used.has(p) && slotRaw(p, s, P, 1, sides[i]) > bv) { bv = slotRaw(p, s, P, 1, sides[i]); b = p; } if (b) { used.add(b); out[i] = b; } });
    bestV = out.reduce((a, p, i) => a + (p ? slotRaw(p, slots[i], P, avgFactor(p, P), sides[i]) : 40), 0);
  }
  const gkScore = gk ? gkRaw(gk, P, avgFactor(gk, P)) : 40;
  const score = (bestV + gkScore) / (slots.length + 1);
  const used = new Set(out.filter(Boolean).concat(gk ? [gk] : []));
  return { formation, gk: gk ? gk.id : null, out: out.map((p) => (p ? p.id : null)), bench: players.filter((p) => !used.has(p)).map((p) => p.id), score };
}

// Best lineup over every formation (or the listed ones).
export function bestLineup(players, P, formations = FORMATION_NAMES) {
  let best = null;
  for (const f of formations) { const l = chooseForFormation(players, f, P); if (!best || l.score > best.score) best = l; }
  return best;
}
// A team's strength: the raw score of its best lineup.
export const teamStrength = (players, P) => (players.length ? bestLineup(players, P).score : 0);
