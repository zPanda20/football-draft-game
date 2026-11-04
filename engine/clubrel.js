// How clubs feel about a footballer: a level per club (-100 hostile to +100 adored). Smack talk and scandals lower it, a season of good service raises it.
// A low level dries up the offers from that club (and a hostile one will not sign him at all); too many scandals at one club and it tears up his contract when the off-season starts.
import { makeRng } from "./rng.js";
import { ensureLife, mk } from "./life.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const SCANDAL_KINDS = new Set(["camera", "trouble", "drunk", "steroids", "dm", "caught"]);

const club = (game, p) => { const L = ensureLife(game, p); if (!L.club) L.club = { rel: {}, scand: null, notes: [] }; L.club.rel = L.club.rel || {}; L.club.notes = L.club.notes || []; return L.club; };
export const relOf = (game, p, team) => (team == null ? 0 : (club(game, p).rel[team] || 0));
export const relWord = (n) => (n >= 60 ? "Adored" : n >= 25 ? "Warm" : n > -25 ? "Neutral" : n > -60 ? "Cold" : "Hostile");
export function addRel(game, p, team, d) {
  if (team == null || !d) return 0;
  const C = club(game, p), v = clamp(Math.round((C.rel[team] || 0) + d), -100, 100);
  if (v) C.rel[team] = v; else delete C.rel[team];
  return v;
}
// A club that will not talk to him at all.
export const refuses = (game, p, team) => relOf(game, p, team) <= game.P.life.club.refuseAt;
// How much more or less often a club makes an offer: 1 is normal.
export const offerFactor = (game, p, team) => { const r = relOf(game, p, team); return r <= game.P.life.club.refuseAt ? 0 : clamp(1 + r / 100, 0.1, 2); };

// Scandals at the club he plays for this season. Counted when a scandal story is printed.
export function scandals(game, p) {
  const C = club(game, p), s = C.scand;
  return s && s.season === game.season && s.team === p.team ? s.n : 0;
}
export function noteScandal(game, p, story) {
  if (!p || !p.user || p.team == null || !story || !SCANDAL_KINDS.has(story.kind)) return;
  const K = game.P.life.club, C = club(game, p);
  if (!C.scand || C.scand.season !== game.season || C.scand.team !== p.team) C.scand = { team: p.team, season: game.season, n: 0 };
  C.scand.n++;
  addRel(game, p, p.team, K.scandalHit);
  const t = game.teams[p.team];
  if (C.scand.n === K.fireAt - 1) C.notes.push(`${t.name} are losing patience with you. One more scandal and your contract could be torn up in the off-season.`);
  else if (C.scand.n >= K.fireAt) C.notes.push(`${t.name} have had enough of the headlines (${C.scand.n} scandals this season). Expect a talk at the end of the season.`);
}
// A season at a club with a clean sheet and a regular place is how a relationship grows.
export function serveWeek(game, p) { if (p.team != null) addRel(game, p, p.team, game.P.life.club.weekly); }
export function drainNotes(game, p) { const C = club(game, p), out = C.notes; C.notes = []; return out; }

// Online beef: how a reply lands with the club that trolled him.
export function beefRel(game, p, team, mode, feud) {
  const K = game.P.life.club; let d = K.beef[mode] || 0; if (feud) d += K.feud;
  return addRel(game, p, team, d);
}

// The off-season opens: a club that is fed up of the scandals (or that he has made an enemy of) terminates his contract. Returns the exits.
export function scandalExits(game) {
  const K = game.P.life.club, out = [];
  for (const p of Object.values(game.players)) {
    if (!p.user || p.retired || p.team == null) continue;
    const C = club(game, p), n = scandals(game, p), team = p.team, t = game.teams[team], rel = relOf(game, p, team);
    const chance = n >= K.fireAt ? Math.min(1, K.fireChance + K.fireStep * (n - K.fireAt)) : 0;
    const fired = (chance > 0 && makeRng(game.seed, "fire", p.id, game.season)() < chance) || rel <= K.fireRel;
    if (!fired) continue;
    t.players = t.players.filter((x) => x !== p.id); p.team = null; p.contract = 0;
    (game.userPool = game.userPool || []).push(p.id);
    addRel(game, p, team, K.fireHit);
    const P_ = p.name.toUpperCase(), T_ = t.name.toUpperCase();
    const story = mk(game, p, { force: true, prio: 4, abs: true, kind: "trouble", src: "sun", icon: "✂️", head: `${T_} TEAR UP ${P_}'S CONTRACT: "ENOUGH IS ENOUGH"`, sub: n >= K.fireAt ? `${n} scandals in one season were ${n - K.fireAt + 1} too many for the board. ${p.name} is a free agent and, apparently, "relaxed about it".` : `Things had been "difficult" since the online spat. ${t.name} say the relationship has "broken down beyond repair". ${p.name} is a free agent.` });
    out.push({ pid: p.id, team, scandals: n, story });
  }
  return out;
}
