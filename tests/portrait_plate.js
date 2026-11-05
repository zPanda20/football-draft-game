// The "Inner Circle" thunder plate: three codes open it, its portraits are real images, and footballers and WAGs
// can only wear them once the plate is unlocked. Run with: node tests/portrait_plate.js
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { D } from "./lib.js";
import { findPlate } from "../engine/unlocks.js";
import { buildCatalog } from "../server/describe.js";
import { withParams } from "../engine/params.js";
import { Room } from "../server/room.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const PLATE = D.plates.find((p) => p.id === "mastermind");
const DIR = new URL("../public/assets/portraits/", import.meta.url);

// width and height of a JPEG from its first frame header
function jpegSize(buf) {
  assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8, "starts like a JPEG");
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no frame header");
}

t("three codes open the plate, whatever the case or punctuation, and near misses do not", () => {
  for (const code of ["PPP", "ppp", "Luke is a Master Mind", "luke is a mastermind", "LUKE IS A MASTER MIND!", "  Panda  ", "panda."]) assert.equal(findPlate(D.plates, code)?.id, "mastermind", code);
  for (const code of ["pp", "pppp", "ppp panda", "luke", "master mind", "pandas"]) assert.equal(findPlate(D.plates, code), null, code);
  assert.ok(!JSON.stringify(buildCatalog(D, withParams({}))).toLowerCase().includes("master mind"), "the codes never reach the client");
});

t("the plate holds Luca Bianchi and the seven profile photos as real, small, square JPEGs", () => {
  assert.equal(PLATE.kind, "portrait"); assert.equal(PLATE.faces.length, 8); assert.equal(new Set(PLATE.faces).size, 8);
  const seen = new Set();
  for (const f of PLATE.faces) {
    assert.match(f, /^[\w.-]{1,40}$/, "the file name fits the portrait rule");
    assert.ok(existsSync(new URL(f, DIR)), f + " exists"); const buf = readFileSync(new URL(f, DIR)), { w, h } = jpegSize(buf);
    assert.ok(w === h && w >= 256 && w <= 1024, `${f} is square and a sensible size (${w}x${h})`); assert.ok(buf.length < 120000, `${f} is light (${buf.length} bytes)`);
    seen.add(buf.toString("base64"));
  }
  assert.equal(seen.size, 8, "no two portraits are the same file");
  // Luca Bianchi is the first one and is the same picture as his dating-partner card
  assert.deepEqual(readFileSync(new URL(PLATE.faces[0], DIR)), readFileSync(new URL("../public/assets/partners/luca-bianchi.jpg", import.meta.url)));
  for (const f of PLATE.faces) assert.ok(!/[a-z]{3,}-[a-z]{3,}/i.test(f.replace(/\.jpg$/, "").replace("inner-circle", "")), "file names carry no personal names");
});

const lobby = (code) => { const r = new Room({ code, D, hostToken: "h", onChange() {}, onSave() {} }); r.addPlayer("h", "Host"); return r; };

t("a footballer can only wear a plate portrait once the plate is unlocked", () => {
  const r = lobby("PORT"); r.setMode("h", "player"); const p = r.players.get("h"), face = "p:" + PLATE.faces[0];
  const before = p.char.img; r.setChar("h", { img: face }); assert.equal(p.char.img, before, "locked: refused");
  r.redeem("h", "PPP"); assert.ok(p.unlocks.has("mastermind"));
  for (const f of PLATE.faces) { r.setChar("h", { img: "p:" + f }); assert.equal(p.char.img, "p:" + f, f); }
  // (an "f:" photo points at /assets/faces, a different folder, so it cannot reach these files)
  for (const bad of ["p:nobody.jpg", "p:../../data/unlocks.json", "p:inner-circle-9.jpg", "p:storm-king.jpg", "p:"]) { const keep = p.char.img; r.setChar("h", { img: bad }); assert.equal(p.char.img, keep, bad + " is refused"); }
});

t("a WAG can wear a plate portrait too, under the same rule, and can go back to the drawn faces", () => {
  const r = lobby("PORW"); r.addPlayer("w", "Wendy"); r.setMode("w", "wag"); const u = r.players.get("w"), face = "p:" + PLATE.faces[2];
  r.setWagChar("w", { name: "Wendy Vale", img: "1-2-3" }); assert.equal(u.wchar.img, "1-2-3");
  r.setWagChar("w", { img: face }); assert.equal(u.wchar.img, "1-2-3", "locked: refused");
  r.redeem("w", "Luke is a Master Mind"); assert.ok(u.unlocks.has("mastermind"));
  for (const f of PLATE.faces) { r.setWagChar("w", { img: "p:" + f }); assert.equal(u.wchar.img, "p:" + f, f); }
  for (const bad of ["p:storm-king.jpg", "p:nobody.jpg", "p:../x.jpg"]) { const keep = u.wchar.img; r.setWagChar("w", { img: bad }); assert.equal(u.wchar.img, keep, bad); }
  r.setWagChar("w", { img: "0-1-2" }); assert.equal(u.wchar.img, "0-1-2");
  assert.equal(u.wchar.name, "Wendy Vale", "the name survives");
});

t("a plate unlocked in the browser (sent as an id list) is enough, and a made-up plate is not", () => {
  const r = lobby("PORS"); r.setMode("h", "player"); const p = r.players.get("h");
  r.setUnlocks("h", ["mastermind", "not-a-plate"]); assert.deepEqual([...p.unlocks], ["mastermind"]);
  r.setChar("h", { img: "p:" + PLATE.faces[7] }); assert.equal(p.char.img, "p:" + PLATE.faces[7]);
  r.setUnlocks("h", ["thunderstruck"]); r.setChar("h", { img: "p:" + PLATE.faces[1] }); assert.equal(p.char.img, "p:" + PLATE.faces[7], "another plate does not open this one");
});

console.log(`\n${n} plate portrait tests passed`);
