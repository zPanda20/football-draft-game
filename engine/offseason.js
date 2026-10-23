// Off-season: retirements, ageing, re-signing, rookies, releases. All pure functions of the game state and the seed.
import { makeRng, gauss } from "./rng.js";
import { rate } from "./roster.js";
import { marketValue, feeFor } from "./market.js";

// ---- retirement ----
export function retireChance(p, P, season) {
  if (season === 1 && P.age.guaranteed.includes(p.slug)) return 1;
  const a = p.age + 1 - (p.pos === "GK" ? P.age.gkShift : 0); // the age he turns this off-season
  const t = P.age.retire, keys = Object.keys(t).map(Number).sort((x, y) => x - y);
  if (a < keys[0]) return 0;
  if (a >= keys[keys.length - 1]) return 1;
  return t[a] ?? 0;
}
// Everyone rolls: owned players and free agents alike. Contracts end with no refund.
export function runRetirements(game) {
  const P = game.P, r = makeRng(game.seed, "retire", game.season), out = [];
  for (const p of Object.values(game.players)) {
    if (p.retired) continue;
    const ch = retireChance(p, P, game.season);
    const roll = r(); // always drawn, so the stream does not depend on who is owned
    if (ch > 0 && roll < ch) out.push(retire(game, p, ch >= 1));
  }
  return out;
}
export function retire(game, p, forced) {
  const was = p.team;
  if (was != null) { const t = game.teams[was]; t.players = t.players.filter((id) => id !== p.id); }
  p.retired = true; p.team = null; p.contract = 0;
  game.pool = game.pool.filter((id) => id !== p.id);
  if (game.userPool) game.userPool = game.userPool.filter((id) => id !== p.id);
  return { id: p.id, team: was, age: p.age + 1, forced };
}

// ---- ageing ----
function meanDrift(age, P) {
  const pts = Object.entries(P.age.drift).map(([a, v]) => [+a, v]).sort((x, y) => x[0] - y[0]);
  if (age <= pts[0][0]) return pts[0][1];
  if (age >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (age <= pts[i][0]) { const [a0, v0] = pts[i - 1], [a1, v1] = pts[i]; return v0 + ((age - a0) / (a1 - a0)) * (v1 - v0); }
  return 0;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// One year older: ratings move with age (and potential for rookies), contracts tick down, stamina refills.
export function ageAll(game) {
  const P = game.P, r = makeRng(game.seed, "age", game.season), moves = [];
  for (const p of Object.values(game.players)) {
    const g = gauss(r) * P.age.noise; // always drawn
    if (p.retired) continue;
    p.age += 1;
    let d = meanDrift(p.age, P);
    if (d > 0 && p.pot) d *= P.age.potential[p.pot] ?? 1;
    d += g;
    const old = p.ovr;
    const decl = d < 0;
    const f = { pac: decl ? P.age.paceDecline : 0.7, phy: decl ? P.age.phyDecline : 0.9 };
    for (const k of ["pac", "sho", "pas", "dri", "def", "phy"]) p[k] = clamp(Math.round(p[k] + d * (f[k] ?? 1)), 30, 99);
    p.ovr = clamp(Math.round(p.ovr + d), 40, 99);
    p.sta = clamp(Math.round(p.sta + (decl ? d * 0.5 : d * 0.3) - (p.age > P.age.staAfter ? P.age.staPerYear : 0)), 30, 99);
    p.stam = 100; if (p.team != null && p.contract > 0) p.contract -= 1;
    if (p.user) p.ovrf = p.ovr;
    rate(p, P);
    if (p.ovr !== old) moves.push({ id: p.id, from: old, to: p.ovr });
  }
  return moves;
}

// ---- contracts ----
export const expiring = (game, ti) => game.teams[ti].players.filter((id) => game.players[id].contract <= 0 && !game.players[id].user);
export function resign(game, ti, id, len) {
  const t = game.teams[ti], p = game.players[id];
  if (!p || p.user || p.team !== ti || p.contract > 0 || !(len >= 1 && len <= 3)) return false;
  const fee = feeFor(p, len, game.P);
  if (t.coins < fee) return false;
  t.coins -= fee; p.contract = len; return fee;
}
// Whatever is still expiring goes to the free-agent pool.
export function releaseExpired(game) {
  const out = [];
  for (const t of game.teams) for (const id of t.players.slice()) {
    const p = game.players[id];
    if (p.contract <= 0) { t.players = t.players.filter((x) => x !== id); p.team = null; if (p.user) (game.userPool = game.userPool || []).push(id); else game.pool.push(id); out.push({ id, team: t.id }); }
  }
  return out;
}
// CPU: keep useful players it can afford, shorter deals for older ones.
export function botResign(game, ti) {
  const P = game.P, t = game.teams[ti], ids = expiring(game, ti).map((id) => game.players[id]).sort((a, b) => b.ovr - a.ovr);
  const all = t.players.map((id) => game.players[id]).sort((a, b) => b.ovr - a.ovr);
  const top = new Set(all.slice(0, 7).map((p) => p.id)), picks = [];
  let coins = t.coins;
  for (const p of ids) {
    if (!top.has(p.id) && p.ovr < 84) continue;
    const len = p.age >= 32 ? 1 : p.age >= 29 ? 2 : p.ovr >= 88 ? 3 : 2;
    const fee = feeFor(p, len, P);
    if (fee > coins * 0.7) { const f1 = feeFor(p, 1, P); if (f1 > coins * 0.7) continue; picks.push({ id: p.id, len: 1 }); coins -= f1; continue; }
    picks.push({ id: p.id, len }); coins -= fee;
  }
  return picks;
}

// ---- rookies ----
export function introduceRookies(game, classNo, D) {
  const cls = (D.rookies || []).find((c) => c.class === classNo) || (D.rookies || [])[classNo - 1];
  if (!cls) return [];
  const ids = [];
  for (const raw of cls.players) {
    const p = { stam: 100, team: null, contract: 0, rookie: true, class: classNo, ...raw };
    game.players[p.id] = rate(p, game.P); ids.push(p.id);
  }
  game.rookies = ids.slice();
  return ids;
}
// One round, worst team first. pickFor(teamIdx, availableIds) -> id|null for humans; bots take the best ovr/potential mix.
export function runRookieDraft(game, worstFirst, pickFor = null) {
  const P = game.P, res = [];
  for (const ti of worstFirst) {
    const t = game.teams[ti], avail = game.rookies.filter((id) => game.players[id].team == null && !game.players[id].drafted);
    if (!avail.length || t.players.length >= (t.cap ?? P.money.rosterMax)) { res.push({ team: ti, id: null }); continue; }
    let id = pickFor ? pickFor(ti, avail) : null;
    if (id == null || !avail.includes(id)) id = botRookiePick(game, avail);
    takeRookie(game, ti, id); res.push({ team: ti, id });
  }
  return res;
}
export function takeRookie(game, ti, id) {
  const p = game.players[id], t = game.teams[ti];
  p.team = ti; p.contract = game.P.money.rookieContract; p.drafted = true; t.players.push(id);
}
// Undrafted rookies join the free-agent pool.
export function rookiesToPool(game) { for (const id of game.rookies || []) { const p = game.players[id]; if (p.team == null && !game.pool.includes(id)) game.pool.push(id); } game.rookies = []; }

// CPU choice: the best mix of rating now and potential.
export function botRookiePick(game, avail) {
  const potBonus = { low: 0, med: 1.5, high: 3 };
  return avail.map((x) => game.players[x]).sort((a, b) => b.ovr + (potBonus[b.pot] || 0) - (a.ovr + (potBonus[a.pot] || 0)) || a.id - b.id)[0].id;
}
export const availableRookies = (game) => (game.rookies || []).filter((id) => game.players[id].team == null && !game.players[id].drafted);
