// The static catalogue sent to every browser once: players, items, clubs and the position map.
import { POSITIONS, SLOT_W } from "../engine/roster.js";

export function buildCatalog(D, P) {
  return {
    players: D.players.map((p) => ({ id: p.id, slug: p.slug, name: p.name, nat: p.nat, club: p.club, pos: p.pos, tier: p.tier, age: p.age, ovr: p.ovr, st: [p.pac, p.sho, p.pas, p.dri, p.def, p.phy, p.sta] })),
    items: D.items,
    clubs: D.clubs,
    positions: POSITIONS,
    slotWeights: SLOT_W,
    rules: { rosterMax: P.money.rosterMax, rosterMin: P.money.rosterMin, activeCap: P.items.activeCap, lenMult: P.money.lenMult, extraCap: P.money.extraCap, moments: P.match.moments, packs: P.packs.rounds },
  };
}
