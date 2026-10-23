// The static catalogue sent to every browser once: players, items, clubs and the position map.
import { POSITIONS, SLOT_W, XY } from "../engine/roster.js";

export function buildCatalog(D, P) {
  return {
    players: [...D.players, ...(D.rookies || []).flatMap((c) => c.players)].map((p) => ({ id: p.id, slug: p.slug, name: p.name, nat: p.nat, club: p.club, pos: p.pos, tier: p.tier, age: p.age, ovr: p.ovr, st: [p.pac, p.sho, p.pas, p.dri, p.def, p.phy, p.sta], rookie: !!p.pot })),
    items: D.items,
    clubs: D.clubs,
    positions: POSITIONS,
    slotWeights: SLOT_W, xy: XY, fit: P.fit,
    rules: { playerItemCap: P.player.itemCap, rerolls: P.player.rerolls, rosterMax: P.money.rosterMax, rosterMin: P.money.rosterMin, activeCap: P.items.activeCap, lenMult: P.money.lenMult, extraCap: P.money.extraCap, moments: P.match.moments, fatigueK: P.stamina.fatigueK, packs: P.packs.rounds },
  };
}
