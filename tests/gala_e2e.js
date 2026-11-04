// End-to-end: a real server, real WebSocket clients, a Turbo league. The gala is held once per season with everyone connected,
// and the game still reaches the end. Shapes: mixed (2 managers + 1 footballer), managers (2), players (3 footballers), off (switch off), idle (a silent manager).
// Run with: node tests/gala_e2e.js [mixed|managers|players|off|idle]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const SHAPE = process.argv[2] || "mixed", SEASONS = 2;
const PORT = 5300 + Math.floor(Math.random() * 500);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "60", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
const steps = [], log = [], seasonsWithGala = new Set(), roundups = [];
let galaEnters = 0, lastStep = "";
function client(name, host, opts = {}) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`), c = { ws, token, s: null, name, opts, done: new Set() };
  const send = (m) => ws.send(JSON.stringify({ token, ...m })); c.send = send;
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") log.push(name + " error: " + m.msg);
    if (m.t !== "state") return;
    const s = (c.s = m.s), me = s.me;
    if (host && s.step !== lastStep) { lastStep = s.step; steps.push(s.step); if (s.step === "gala.prep") { galaEnters++; seasonsWithGala.add(s.seasonNo); } }
    if (s.step === "gala.end" && s.gala && s.gala.roundup && host) roundups.push(s.gala.roundup.head);
    if (c.opts.silent) return;
    const g = s.gala;
    if (g && g.attending) {                                                          // every guest plays the gala
      const key = s.step + s.seasonNo;
      if (s.step === "gala.prep" && !c.done.has(key)) {
        c.done.add(key);
        if (g.kind === "player") { const first = (g.people || [])[0]; if (first) c.send({ t: "gInvite", to: first.id }); }
        const other = g.att.find((a) => !a.you && a.kind !== "guest"); if (other) c.send({ t: "gSeat", target: other.key });
        for (const i of g.invites || []) if (!i.out && i.status === "open") c.send({ t: "gAnswer", id: i.id, yes: true });
        c.send({ t: "gReady" });
      }
      if (s.step === "gala.live") {
        for (const p of g.prompts || []) { const k = "p" + p.id; if (!c.done.has(k)) { c.done.add(k); c.send({ t: "gRespond", id: p.id, mode: p.modes[0][0] }); } }
        if (!g.pick && !c.done.has(key)) { c.done.add(key); const o = (g.options || []).find((x) => x.needs) || (g.options || [])[0]; c.send({ t: "gPick", opt: o ? o.id : "pass" }); }
      }
    }
    if (s.pm && s.step === "md.half" && s.pm.onPitch && !s.pm.effort) c.send({ t: "effort", mode: "push" });
    if (!me) return;
    if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { c.send({ t: "pick", idx: 0 }); c.send({ t: "lock" }); }
    if (s.step === "market.bid" && !me.done) { if (!me.bid) c.send({ t: "pass" }); }
    if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) c.send({ t: "ready" });
    if (s.step === "off.resign" && !s.teams[me.teamId].ready) c.send({ t: "ready" });
    if (s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) c.send({ t: "rookie", id: s.rookies.avail[0] });
    if (s.step === "off.trade" && !s.teams[me.teamId].ready) c.send({ t: "ready" });
  });
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const host = client("Ana", true); await wait(400);
const names = { mixed: ["Bo", "Cy"], managers: ["Bo"], players: ["Bo", "Cy", "Dee"], off: ["Bo", "Cy"], idle: ["Bo", "Cy"] }[SHAPE];
const others = names.map((n) => { const c = client(n, false, { silent: SHAPE === "idle" && n === "Bo" }); c.room = host.room; return c; }); await wait(500);
if (SHAPE === "mixed" || SHAPE === "off") { others[1].send({ t: "mode", mode: "player" }); await wait(200); others[1].send({ t: "char", c: { name: "Cy Striker", pos: "ST" } }); }
if (SHAPE === "players") { host.send({ t: "mode", mode: "player" }); await wait(200); host.send({ t: "char", c: { name: "Ana Striker", pos: "ST" } }); for (const [i, c] of others.entries()) { c.send({ t: "mode", mode: "player" }); await wait(200); c.send({ t: "char", c: { name: "Fb" + i, pos: i % 2 ? "CM" : "ST" } }); } }
await wait(300);
host.send({ t: "settings", s: { seasons: SEASONS, pace: 0.5, ...(SHAPE === "off" ? { gala: 0 } : {}) } }); await wait(300);
host.send({ t: "start" });
const t0 = Date.now(); const tStart = t0;
while (Date.now() - t0 < 240000) {
  await wait(300);
  if (host.s && host.s.step === "season.end") { if (host.s.final) break; if (host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; } }
}
const s = host.s;
const galaSteps = steps.filter((x) => x.startsWith("gala."));
const finished = s && s.step === "season.end" && s.final;
const expectGala = SHAPE !== "off";
const once = SHAPE === "off" ? galaEnters === 0 : galaEnters === SEASONS && seasonsWithGala.size === SEASONS;
const ordered = galaSteps.join(",") === (expectGala ? Array.from({ length: SEASONS }, () => "gala.prep,gala.live,gala.end").join(",") : "");
console.log(`shape ${SHAPE}:`, JSON.stringify({ finished, galaEnters, seasons: [...seasonsWithGala], galaSteps: galaSteps.length, roundups, elapsed: Math.round((Date.now() - tStart) / 1000) + "s" }));
if (log.length) console.log(log.join("\n"));
srv.kill(); for (const c of [host, ...others]) c.ws.close();
if (!(finished && once && ordered)) { console.error("FAILED: " + SHAPE); process.exit(1); }
console.log("gala e2e ok: " + SHAPE); process.exit(0);
