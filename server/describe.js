import { ACT_INFO, SHOP, SHOP_CATS, PARTNER_LIST, BOOT_BRANDS } from "../engine/life.js";
// The static catalogue sent to every browser once: players, items, clubs and the position map.
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { POSITIONS, SLOT_W, XY } from "../engine/roster.js";

// Team art lives in public/assets/teams/<slug>/ . Whatever files are there get picked up (no restart needed, a page
// reload is enough): badge, wallpaper, kit-home, kit-away, kit-third, as png / webp / svg / jpg.
export const ART_FILES = { badge: "badge", wallpaper: "wallpaper", kitHome: "kit-home", kitAway: "kit-away", kitThird: "kit-third" };
const EXTS = ["png", "webp", "svg", "jpg", "jpeg"];
let artCache = { at: 0, dir: null, v: null };
// Optional portrait photos for created footballers: drop images into public/assets/faces/.
export function listFaces(publicDir) {
  const dir = join(publicDir, "assets", "faces"); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort().slice(0, 60);
}
// Portraits of the real players: public/assets/players/<player slug>.png (or webp / svg / jpg), e.g. kylian-mbappe.png.
// The file name is the player's `slug` in data/players.json; the card shows it in place of the initials.
// Returns { slug: url }. A page reload picks up new files, no restart needed.
let picCache = { at: 0, dir: null, v: null };
export function playerPics(publicDir) {
  if (picCache.v && picCache.dir === publicDir && Date.now() - picCache.at < 4000) return picCache.v;
  const dir = join(publicDir, "assets", "players"), out = {}, rank = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) {
    const m = /^(.+)\.(png|webp|svg|jpe?g)$/i.exec(f); if (!m) continue;
    const slug = m[1].toLowerCase(), r = EXTS.indexOf(m[2].toLowerCase()); // png first, same order as the team art
    if (rank[slug] !== undefined && rank[slug] <= r) continue;
    rank[slug] = r; out[slug] = `/assets/players/${encodeURIComponent(f)}?v=${Math.floor(statSync(join(dir, f)).mtimeMs / 1000)}`;
  }
  picCache = { at: Date.now(), dir: publicDir, v: out };
  return out;
}
// Loose art, one folder per kind, one file per thing (png / webp / svg / jpg), picked up on a page reload:
//   partners/<id>.png (people to date)   brands/<id>.png (boot makers)   trophies/<kind>.png (title, ballon, boot, playmaker, glove)
//   sources/<id>.png (newspaper and magazine mastheads, white on clear)   news/<kind>.jpg (a picture for each kind of headline)   ui/<name>.jpg (start page wallpaper "start", paper masthead "masthead")
export const ART_FOLDERS = ["partners", "brands", "trophies", "news", "ui", "sources"];
let miscCache = { at: 0, dir: null, v: null };
export function miscArt(publicDir) {
  if (miscCache.v && miscCache.dir === publicDir && Date.now() - miscCache.at < 4000) return miscCache.v;
  const out = {};
  for (const folder of ART_FOLDERS) {
    const dir = join(publicDir, "assets", folder), got = {}, rank = {}; out[folder] = got;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = /^(.+)\.(png|webp|svg|jpe?g)$/i.exec(f); if (!m) continue;
      const k = m[1].toLowerCase(), r = EXTS.indexOf(m[2].toLowerCase());
      if (rank[k] !== undefined && rank[k] <= r) continue;
      rank[k] = r; got[k] = `/assets/${folder}/${encodeURIComponent(f)}?v=${Math.floor(statSync(join(dir, f)).mtimeMs / 1000)}`;
    }
  }
  miscCache = { at: Date.now(), dir: publicDir, v: out };
  return out;
}
// Crests for clubs that are not game clubs but appear on player cards (Arsenal, Man City, Roma...):
// public/assets/crests/<slug>.png, with the club names each one answers to listed in data/cardcrests.json.
// Returns [{ names, img }].
export function cardCrests(publicDir, dataDir = join(publicDir, "..", "data")) {
  const file = join(dataDir, "cardcrests.json"), dir = join(publicDir, "assets", "crests"); if (!existsSync(file) || !existsSync(dir)) return [];
  const map = JSON.parse(readFileSync(file, "utf8")), files = new Map(readdirSync(dir).map((f) => [f.toLowerCase(), f])), out = [];
  for (const [slug, names] of Object.entries(map)) for (const ext of EXTS) {
    const f = files.get(slug + "." + ext);
    if (f) { out.push({ names, img: `/assets/crests/${encodeURIComponent(f)}?v=${Math.floor(statSync(join(dir, f)).mtimeMs / 1000)}` }); break; }
  }
  return out;
}
export function clubsWithArt(clubs, publicDir) {
  if (artCache.v && artCache.dir === publicDir && Date.now() - artCache.at < 4000) return artCache.v;
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
  artCache = { at: Date.now(), dir: publicDir, v: out };
  return out;
}

export function buildCatalog(D, P) {
  return {
    players: [...D.players, ...(D.rookies || []).flatMap((c) => c.players)].map((p) => ({ id: p.id, slug: p.slug, name: p.name, nat: p.nat, club: p.club, pos: p.pos, tier: p.tier, age: p.age, ovr: p.ovr, st: [p.pac, p.sho, p.pas, p.dri, p.def, p.phy, p.sta], rookie: !!p.pot })),
    items: D.items,
    life: { acts: ACT_INFO, shop: SHOP, cats: SHOP_CATS, costs: Object.fromEntries(Object.entries(P.life.acts).map(([k, v]) => [k, v])), wedding: P.life.wedding, boringAt: P.life.boringAt, partners: PARTNER_LIST, brands: BOOT_BRANDS, deals: P.life.deals },
    clubs: D.clubs,
    plates: (D.plates || []).map(({ codes, ...p }) => p),           // the codes themselves never leave the server
    positions: POSITIONS,
    slotWeights: SLOT_W, xy: XY, fit: P.fit,
    rules: { playerItemCap: P.player.itemCap, rerolls: P.player.rerolls, rosterMax: P.money.rosterMax, rosterMin: P.money.rosterMin, activeCap: P.items.activeCap, lenMult: P.money.lenMult, extraCap: P.money.extraCap, moments: P.match.moments, fatigueK: P.stamina.fatigueK, packs: P.packs.rounds },
  };
}
