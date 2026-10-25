// End-to-end for player mode with NO club managers in the room: three created footballers play two seasons.
// Also checks the in-season life features (3 date options, turn-downs, preference, deals) over WebSockets.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4800 + Math.floor(Math.random() * 500);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "80", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));

const log = [], seen = new Set();
const stats = { cards: 0, dates: 0, optsMax: 0, bothGenders: true, turnDowns: 0, prefs: 0, deals: 0, news: 0, maxFol: 0, optsSeen: 0, lastKept: true, trophies: 0 };
function client(name, host) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, token, s: null, name, lastPartner: null, sent: new Set() };
  const send = (m) => ws.send(JSON.stringify({ token, ...m }));
  c.send = send;
  const once = (key, m) => { const k = (c.s ? c.s.step + ":" + (c.s.season ? c.s.season.day : "") + ":" + (c.s.seasonNo || "") : "") + "|" + key; if (c.sent.has(k)) return false; c.sent.add(k); send(m); return true; };
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") log.push(name + " error: " + m.msg);
    if (m.t !== "state") return;
    const s = (c.s = m.s); seen.add(s.step);
    const pm = s.pm; if (!pm) return;
    for (const k of pm.pending) { send({ t: "card", n: k.n, opt: 0 }); stats.cards++; }
    for (const o of pm.offers) if (o.status === "open" && s.step.startsWith("market.")) send({ t: "offerRespond", id: o.id, accept: true });
    if (s.step === "md.half" && pm.onPitch && !pm.effort) send({ t: "effort", mode: "push" });
    const L = pm.life; if (!L) return;
    stats.maxFol = Math.max(stats.maxFol, L.fol || 0); stats.trophies = Math.max(stats.trophies, (L.trophies || []).length);
    if (L.deal) stats.deals++;
    if (L.offer) { send({ t: "dealRespond", yes: true }); }
    if (name === "Ana" && L.pref == null && L.open) once("pref", { t: "pref", act: "train" }) && stats.prefs++;
    if (L.open && !L.married && L.opts && L.opts.length) {
      stats.optsSeen++; stats.optsMax = Math.max(stats.optsMax, L.opts.length);
      const gs = new Set(L.opts.map((o) => o.g));
      if (L.opts.length !== 3 || gs.size < 2) stats.bothGenders = false;
      if (c.lastPartner && !L.opts.some((o) => o.id === c.lastPartner)) stats.lastKept = false;
      if (name === "Bo" && L.opts.length && stats.turnDowns < 40) { if (once("td", { t: "turnDown", id: L.opts[0].id })) stats.turnDowns++; }
      else if (name === "Cy") { if (once("date", { t: "act", act: "date", partner: L.opts[0].id })) { stats.dates++; c.lastPartner = L.opts[0].id; } }
    }
    const me = s.me;
    if (me) { /* managers would act here */ }
    if ((s.step === "md.lineup" || s.step === "md.half") && me && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (s.step === "off.resign" || s.step === "off.trade") { if (me && !s.teams[me.teamId].ready) send({ t: "ready" }); }
  });
  return c;
}
const host = client("Ana", true);
await new Promise((r) => setTimeout(r, 400));
const others = ["Bo", "Cy"].map((n) => { const c = client(n, false); c.room = host.room; return c; });
await new Promise((r) => setTimeout(r, 500));
for (const c of [host, ...others]) { c.send({ t: "mode", mode: "player" }); await new Promise((r) => setTimeout(r, 120)); c.send({ t: "roll" }); c.send({ t: "char", c: { name: c.name + " Star", pos: c.name === "Ana" ? "GK" : "ST", gender: c.name === "Bo" ? "F" : "M" } }); }
await new Promise((r) => setTimeout(r, 300));
host.send({ t: "settings", s: { seasons: 2 } });
await new Promise((r) => setTimeout(r, 200));
host.send({ t: "start" });
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await new Promise((r) => setTimeout(r, 300));
  if (host.s && host.s.step === "season.end") { if (host.s.final) break; if (host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; await new Promise((r) => setTimeout(r, 400)); } }
}
const s = host.s;
console.log("stats:", JSON.stringify(stats));
console.log("steps seen:", [...seen].join(", "));
console.log("final:", s && s.step, "| season:", s && s.seasonNo, "| final flag:", s && s.final, "| elapsed s:", Math.round((Date.now() - t0) / 1000));
if (log.length) console.log(log.slice(0, 10).join("\n"));
const ok = s && s.step === "season.end" && s.final && s.seasonNo === 2 && stats.cards > 0 && stats.optsSeen > 0 && stats.optsMax === 3 && stats.bothGenders && stats.lastKept && stats.dates > 0 && stats.turnDowns > 0;
srv.kill();
for (const c of [host, ...others]) c.ws.close();
if (!ok) { console.error("FAILED: player-mode-only flow"); process.exit(1); }
console.log("pm only e2e ok");
process.exit(0);
