// Lists which team art is in place: node tools/asset_check.mjs   (npm run assets)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const clubs = JSON.parse(readFileSync(join(ROOT, "data", "teams.json"), "utf8"));
const STEMS = ["badge", "wallpaper", "kit-home", "kit-away", "kit-third"], EXT = ["png", "webp", "svg", "jpg", "jpeg"];
let have = 0, total = 0;
console.log("club".padEnd(24) + STEMS.map((s) => s.padEnd(11)).join(""));
for (const c of clubs) {
  const dir = join(ROOT, "public", "assets", "teams", c.slug), files = existsSync(dir) ? new Set(readdirSync(dir).map((f) => f.toLowerCase())) : new Set();
  const row = STEMS.map((s) => { total++; const ok = EXT.some((e) => files.has(s + "." + e)); if (ok) have++; return (ok ? "yes" : "-").padEnd(11); });
  console.log(c.slug.padEnd(24) + row.join(""));
}
console.log(`\n${have} of ${total} files in place. Drop files into public/assets/teams/<club>/ using these names (png, webp, svg or jpg).`);
