// The static catalogue sent to every browser once: players, items, clubs and the position map.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { POSITIONS, SLOT_W, XY } from "../engine/roster.js";

// Team art lives in public/assets/teams/<slug>/ . Whatever files are there get picked up (no restart needed, a page
// reload is enough): badge, wallpaper, kit-home, kit-away, kit-third, as png / webp / svg / jpg.
export const ART_FILES = { badge: "badge", wallpaper: "wallpaper", kitHome: "kit-home", kitAway: "kit-away", kitThird: "kit-third" };
const EXTS = ["png", "webp", "svg", "jpg", "jpeg"];
let artCache = { at: 0, v: null };
export function clubsWithArt(clubs, publicDir) {
  if (artCache.v && Date.now() - artCache.at < 4000) return artCache.v;
  const out = clubs.map((c) => {
    const dir = join(publicDir, "assets", "teams", c.slug), art = {};
    if (existsSync(dir)) {
      const files = new Map(readdirSync(dir).map((f) => [f.toLowerCase(), f]));
      for (const [key, stem] of Object.entries(ART_FILES)) for (const ext of EXTS) {
        const f = files.get(stem + "." + ext);
        if (f) { art[key] = `/assets/teams/${c.slug}/${f}?v=${Math.floor(statSync(join(dir, f)).mtimeMs / 1000)}`; break; }
      }
    }
    return { ...c, art };
  });
  artCache = { at: Date.now(), v: out };
  return out;
}

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
