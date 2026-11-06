// Stories run once per footballer per season, and each trigger has more than one way of reading. Run with: node tests/news_variety.js
import assert from "node:assert/strict";
import { D, createGame } from "./lib.js";
import * as L from "../engine/life.js";
import { rollNumbers, createUserPlayer, defaultAssign } from "../engine/playermode.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
function world(seed = 31) {
  const g = createGame({ D, N: 10, seed }); g.md = { day: 0, total: 18 }; g.P = JSON.parse(JSON.stringify(g.P)); g.P.life.wada = 0; g.P.life.perWeek = 3;
  const r = rollNumbers(g.P, "x", "t", 0), p = createUserPlayer(g, { token: "t", name: "Famous", pos: "ST", nums: r.nums, ovr: r.ovr, assign: defaultAssign("ST") }); p.gender = "M"; p.coins = 5000; L.ensureLife(g, p);
  return { g, p, lf: p.life };
}

t("the boot war runs once a season, and a second one is settled quietly", () => {
  const { g, p, lf } = world(); let heads = [];
  for (let d = 1; d <= 6; d++) { g.weekDay = d; lf.hit.feud = { brand: "nike", other: "adidas", day: d, why: "choice", season: g.season }; const s = L.runActivity(g, p, "rest", { day: d }); heads.push(...s.stories.filter((x) => x.sid === "feud").map((x) => x.head)); assert.equal(lf.hit.feud, undefined, "the feud is consumed either way"); }
  assert.equal(heads.length, 1, "one boot war story in the season: " + JSON.stringify(heads));
  g.season++; g.weekDay = 1; lf.hit.feud = { brand: "puma", other: "nike", day: 1, why: "choice", season: g.season }; const s2 = L.runActivity(g, p, "rest", { day: 1 }); assert.equal(s2.stories.filter((x) => x.sid === "feud").length, 1, "a new season, a new boot war");
});

t("a random story never repeats within a season, whatever the luck", () => {
  const { g, p, lf } = world(7); for (const k of Object.keys(g.P.life.chance)) g.P.life.chance[k] = 1; g.P.life.maxStories = 99;
  const seen = []; for (let d = 1; d <= 30; d++) { g.weekDay = d; lf.flags = {}; lf.hit = {}; const s = L.runActivity(g, p, "party", { day: d }); for (const x of s.stories) seen.push(x.sid); }
  const dup = seen.filter((x, i) => x && seen.indexOf(x) !== i); assert.deepEqual(dup, [], "repeats: " + dup.join()); assert.ok(seen.length >= 2, "stories did run: " + seen.join());
});

t("a trigger has several headlines, and the same one is not shown twice in a row", () => {
  const heads = new Set(), run = [];
  for (let seed = 1; seed <= 40; seed++) { const { g, p, lf } = world(seed); g.weekDay = 1; lf.hit.feud = { brand: "nike", other: "adidas", day: 1, why: "choice", season: g.season }; const s = L.runActivity(g, p, "rest", { day: 1 }); const h = s.stories.find((x) => x.sid === "feud"); if (h) heads.add(h.head.replace(/FAMOUS/g, "X").replace(/NIKE/g, "B")); }
  assert.ok(heads.size >= 3, "boot war headlines: " + [...heads].join(" | "));
  const { g, p, lf } = world(3); let last = null;
  for (let s = 1; s <= 8; s++) { g.season = s; g.weekDay = 1; lf.hit.feud = { brand: "nike", other: "adidas", day: 1, why: "choice", season: g.season }; const x = L.runActivity(g, p, "rest", { day: 1 }).stories.find((y) => y.sid === "feud"); assert.ok(x, "story " + s); assert.notEqual(x.head, last, "season " + s + " repeats the last headline"); last = x.head; run.push(x.head); }
});

console.log(`\n${n} news variety tests passed`);
