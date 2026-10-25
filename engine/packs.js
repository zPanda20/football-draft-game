// The pack draft: personalised hands, one pick each, simultaneous. A picked player never comes back; unpicked cards
// return to the pool. Hands dealt in the same round never share a player.
import { makeRng, shuffle } from "./rng.js";
import { teamStrength } from "./roster.js";
import { maxLen } from "./market.js";

const CB = new Set(["CB", "LB", "RB"]);
export const isDef = (pos) => CB.has(pos);

// Which players are in play for a lobby of N teams: everyone for 28+, a top slice for smaller lobbies (plus the best keepers).
export function makePool(players, N, P) {
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
  if (N >= 28) return sorted.map((p) => p.id);
  const slice = new Set(sorted.slice(0, Math.min(sorted.length, 12 * N)).map((p) => p.id));
  sorted.filter((p) => p.pos === "GK").slice(0, N + P.packs.gkReserve).forEach((p) => slice.add(p.id));
  return sorted.filter((p) => slice.has(p.id)).map((p) => p.id);
}

// Rating-quality dial: z-score of how weak a team's roster is compared with the lobby (positive = weaker).
function dial(game, P) {
  const s = game.teams.map((t) => (t.players.length ? teamStrength(t.players.map((id) => game.players[id]), P) : 0));
  const mean = s.reduce((a, b) => a + b, 0) / s.length, sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length) || 1;
  return s.map((x) => Math.max(-P.packs.dialClamp, Math.min(P.packs.dialClamp, (mean - x) / sd)));
}

function posWeight(team, game, pos, P) {
  const pk = P.packs, have = (f) => team.players.filter((id) => f(game.players[id].pos)).length;
  if (pos === "GK") return have((x) => x === "GK") ? pk.gkOwnedWeight : 1;
  if (pos === "ST") return have((x) => x === "ST") ? pk.stOwnedWeight : pk.needBoost;               // a team with no striker sees more of them
  if (isDef(pos)) { const n = have(isDef); return n >= pk.defOwnedAfter ? pk.defOwnedWeight : n === 0 ? pk.needBoost : 1; }
  return 1;
}

function weightedDraw(items, weights, r) {
  const tot = weights.reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return i; }
  return items.length - 1;
}

// Deal every team a hand for this round (1-based). Returns hands[teamIndex] = [{t:"p", id} | {t:"i", id}].
export function dealRound(game, round, P) {
  const pk = P.packs, r = makeRng(game.seed, "deal", game.season, round);
  const N = game.teams.length;
  const avail = new Set(game.pool);
  const zs = dial(game, P);
  const noGk = game.teams.filter((t) => !t.players.some((id) => game.players[id].pos === "GK")).length;
  const gkLeft = [...avail].filter((id) => game.players[id].pos === "GK").length;
  const holdGk = gkLeft <= noGk + pk.gkReserve;
  const wantItems = round === pk.playerRounds + 1 ? 5 - pk.mixedPlayers : round > pk.playerRounds + 1 ? 5 : 0;
  const nPlayers = pk.size - wantItems;
  const order = shuffle([...Array(N).keys()], r);
  const hands = new Array(N);

  // Round 1: every team gets one distinct headliner from the top slice of the pool.
  const heads = {};
  if (round === 1) {
    const top = [...avail].sort((a, b) => game.players[b].ovr - game.players[a].ovr).slice(0, Math.max(pk.headlinerMin, N));
    shuffle(top, r).slice(0, N).forEach((id, i) => (heads[i] = id));
    for (const id of Object.values(heads)) avail.delete(id);
  }
  for (const ti of order) {
    const team = game.teams[ti], hand = [];
    if (heads[ti] != null) hand.push({ t: "p", id: heads[ti] });
    const hasGk = team.players.some((id) => game.players[id].pos === "GK");
    const cand = [...avail].filter((id) => !(holdGk && hasGk && game.players[id].pos === "GK"));
    const guarantee = pk.gkGuaranteeRounds.includes(round) && !hasGk && !hand.some((c) => game.players[c.id]?.pos === "GK");
    if (guarantee) {
      const gks = cand.filter((id) => game.players[id].pos === "GK");
      if (gks.length) { const id = gks[Math.floor(r() * gks.length)]; hand.push({ t: "p", id }); avail.delete(id); cand.splice(cand.indexOf(id), 1); }
    }
    const lean = round === 1 ? pk.r1Boost / 4 : (pk.dialStrength * zs[ti]) / 6;
    while (hand.filter((c) => c.t === "p").length < nPlayers && cand.length) {
      const w = cand.map((id) => {
        const p = game.players[id];
        return posWeight(team, game, p.pos, P) * Math.exp(lean * (p.ovr - 81));
      });
      const k = weightedDraw(cand, w, r);
      hand.push({ t: "p", id: cand[k] }); avail.delete(cand[k]); cand.splice(k, 1);
    }
    hands[ti] = hand;
  }
  // Items: ordinary items can be dealt to anyone; finite ones (supply left) only once per round.
  if (wantItems) {
    const taken = new Set();
    for (const ti of order) {
      const opts = game.items.filter((it) => !it.storeOnly && (it.supply == null || (game.supply[it.id] ?? it.supply) > 0) && (it.supply == null || !taken.has(it.id)));
      const pickFrom = shuffle(opts, r);
      for (const it of pickFrom.slice(0, wantItems)) { hands[ti].push({ t: "i", id: it.id }); if (it.supply != null) taken.add(it.id); }
    }
  }
  return hands;
}

// Apply every team's pick for the round (picks[teamIndex] = card index). Returns what each team got.
export function applyPicks(game, hands, picks, P) {
  const got = [];
  hands.forEach((hand, ti) => {
    const card = hand[Math.max(0, Math.min(hand.length - 1, picks[ti] ?? 0))];
    if (!card) { got.push(null); return; }
    const team = game.teams[ti];
    if (card.t === "p") {
      const p = game.players[card.id];
      p.team = team.id; p.contract = Math.min(maxLen(game, false), (P.money.draftContracts && P.money.draftContracts[(game.round || 1) - 1]) || P.money.draftContract); team.players.push(card.id);
      game.pool = game.pool.filter((x) => x !== card.id);
    } else {
      const it = game.items.find((i) => i.id === card.id);
      team.items[it.id] = (team.items[it.id] || 0) + it.uses;
      if (it.supply != null) game.supply[it.id] = (game.supply[it.id] ?? it.supply) - 1;
    }
    team.picks.push(card);
    got.push(card);
  });
  return got;
}
