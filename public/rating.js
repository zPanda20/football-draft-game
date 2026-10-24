// Match ratings and box-score tallies. Pure (no DOM, no engine imports) so the server uses it for final ratings and
// season stats and the browser uses the same code to update ratings live as each event arrives.

export const BASE = 6.0, MIN = 3.0, MAX = 10.0;
// What each event is worth to a player's rating (points on the 10-point scale).
export const W = {
  goal: 0.55, goalXg: 0.9,          // 0.55 + 0.9 * (1 - xG): a tap-in is worth less than a thunderbolt
  assist: 0.65, keyPass: 0.22, shot: 0.05,
  tackle: 0.25, intercept: 0.25,
  save: 0.18, saveXg: 0.55,          // 0.25 + 0.9 * xG: a hard save is worth more
  concede: 0.2, concedeXg: 0.6,     // keeper: 0.2 + 0.6 * (1 - xG) per goal
  concedeBack: 0.1, concedeMid: 0.04,
  win: 0.35, loss: -0.25, cleanGk: 0.6, cleanBack: 0.45, cleanMid: 0.15,
};

const empty = () => ({ g: 0, a: 0, kp: 0, sh: 0, sot: 0, sv: 0, tk: 0, ic: 0, xg: 0, ga: 0 });

// Box score per player from a list of events.
export function tally(events) {
  const t = {}, get = (id) => (t[id] = t[id] || empty());
  for (const e of events) {
    if (e.type === "goal" || e.type === "save") {
      const s = get(e.player); s.sh++; s.xg += e.xg || 0; if (e.type === "goal") { s.g++; s.sot++; } else s.sot++;
      if (e.kp != null) get(e.kp).kp++;
      if (e.type === "goal" && e.assist != null) get(e.assist).a++;
      if (e.keeper != null) { const k = get(e.keeper); if (e.type === "save") k.sv++; else k.ga++; }
    } else if (e.type === "tackle") get(e.player).tk++;
    else if (e.type === "intercept") get(e.player).ic++;
  }
  return t;
}

// Ratings as they stand after `events` (already cut to the minutes played so far).
//   sides: [{ first: {gk, out}, second: {gk, out}, group: { pid: "gk"|"back"|"mid"|"fwd" }, }, ...]  (group by pid, per half is fine)
//   final: add the result and clean-sheet bonuses (full time only).
//   goals: [home goals, away goals] at the point being shown.
export function ratings(events, sides, { final = false, half2 = true } = {}) {
  const out = {}, sc = [0, 0];
  const ids = (l) => (l ? [l.gk, ...l.out].filter((x) => x != null) : []);
  sides.forEach((s, i) => {
    const on = new Set([...ids(s.first), ...(half2 ? ids(s.second) : [])]);
    for (const id of on) out[id] = { side: i, r: BASE, g: 0, a: 0, kp: 0, sh: 0, sv: 0, tk: 0, ic: 0, xg: 0, ga: 0, first: ids(s.first).includes(id), second: ids(s.second).includes(id) };
  });
  const bump = (id, v) => { if (out[id]) out[id].r += v; };
  const grp = (id) => (out[id] ? sides[out[id].side].group[id] || "mid" : "mid");
  const tl = tally(events);
  for (const id of Object.keys(tl)) if (out[id]) Object.assign(out[id], tl[id]);
  for (const e of events) {
    if (e.type === "goal") {
      sc[e.team]++;
      bump(e.player, W.goal + W.goalXg * (1 - (e.xg ?? 0.3)));
      if (e.assist != null) bump(e.assist, W.assist); if (e.kp != null) bump(e.kp, W.keyPass);
      const def = 1 - e.team;
      for (const id of Object.keys(out)) {
        if (out[id].side !== def) continue;
        const g = grp(+id);
        if (+id === e.keeper) bump(id, -(W.concede + W.concedeXg * (1 - (e.xg ?? 0.3))));
        else if (g === "back") bump(id, -W.concedeBack); else if (g === "mid") bump(id, -W.concedeMid);
      }
    } else if (e.type === "save") {
      bump(e.player, W.shot); if (e.kp != null) bump(e.kp, W.keyPass);
      bump(e.keeper, W.save + W.saveXg * (e.xg ?? 0.3));
    } else if (e.type === "tackle") bump(e.player, W.tackle);
    else if (e.type === "intercept") bump(e.player, W.intercept);
  }
  if (final) {
    for (const id of Object.keys(out)) {
      const o = out[id], mine = sc[o.side], theirs = sc[1 - o.side], g = grp(+id);
      o.r += mine > theirs ? W.win : mine < theirs ? W.loss : 0;
      if (theirs === 0) o.r += g === "gk" ? W.cleanGk : g === "back" ? W.cleanBack : g === "mid" ? W.cleanMid : 0;
    }
  }
  // very high scores are squeezed so a busy night does not just pin the scale at 10
  for (const id of Object.keys(out)) { let r = out[id].r; if (r > 8) r = 8 + (r - 8) * 0.55; out[id].r = Math.max(MIN, Math.min(MAX, +r.toFixed(1))); }
  return out;
}

// Sofascore-style colour for a rating.
export const ratingClass = (r) => (r >= 8.5 ? "r5" : r >= 7.5 ? "r4" : r >= 6.5 ? "r3" : r >= 5.5 ? "r2" : "r1");
