// End-to-end: a Turbo room with two managers and a footballer; a fourth person joins late as a footballer, and the game still runs to the end.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4800 + Math.floor(Math.random() * 500);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "80", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));

const log = [], seen = new Set();
function client(name, host) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`), c = { ws, token, s: null, name };
  const send = (m) => ws.send(JSON.stringify({ token, ...m })); c.send = send;
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") { c.err = m.msg; log.push(name + " error: " + m.msg); }
    if (m.t !== "state") return;
    const s = (c.s = m.s); seen.add(s.step);
    const me = s.me; if (!me || s.pm || name === "Dee") { if (s.pm && s.step === "md.half" && s.pm.onPitch && !s.pm.effort) send({ t: "effort", mode: "push" }); }
    if (!me) return;
    if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { send({ t: "pick", idx: 0 }); send({ t: "lock" }); }
    if (s.step === "market.bid" && !me.done) { if (!me.bid) send({ t: "pass" }); }
    if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (s.step === "off.resign" && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) send({ t: "rookie", id: s.rookies.avail[0] });
    if (s.step === "off.trade" && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const host = client("Ana", true); await wait(400);
const [bo, cy] = ["Bo", "Cy"].map((n) => { const c = client(n, false); c.room = host.room; return c; }); await wait(500);
cy.send({ t: "mode", mode: "player" }); await wait(200); cy.send({ t: "char", c: { name: "Cy Striker", pos: "ST" } });
host.send({ t: "settings", s: { seasons: 2, pace: 0.5 } }); await wait(300);
host.send({ t: "start" });
// wait until the matches have begun, then somebody arrives late
let t0 = Date.now(); while (Date.now() - t0 < 120000 && !(host.s && /^md\./.test(host.s.step))) await wait(200);
const dee = client("Dee", false); dee.room = host.room; await wait(800);
const me0 = dee.s && dee.s.players.find((p) => p.you);
const joinedAsLate = !!(me0 && me0.late && me0.mode === "player" && me0.char && me0.pid == null);
dee.send({ t: "char", c: { name: "Dee Late", pos: "CM" } }); await wait(300);
dee.send({ t: "lateJoin" }); await wait(800);
const me1 = dee.s.players.find((p) => p.you), deePid = me1.pid;
const inPool = host.s.seekers ? true : true;
const cyRom = cy.s.pm && cy.s.pm.life && cy.s.pm.life.rom;
const datable = !!(cyRom && cyRom.people.some((x) => x.pid === deePid));
console.log("late join:", JSON.stringify({ joinedAsLate, deePid, datable, pace: host.s.speed.pace, step: host.s.step }));
let tStart = Date.now(); t0 = Date.now();
while (Date.now() - t0 < 200000) {
  await wait(300);
  if (host.s && host.s.step === "season.end") { if (host.s.final) break; if (host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; } }
}
const s = host.s, dpm = dee.s && dee.s.pm;
console.log("final:", s && s.step, "| season:", s && s.seasonNo, "| pace:", s && s.speed.pace, "| Dee has a team:", dpm ? dee.s.pd[dpm.pid].t : "no pm", "| elapsed", Math.round((Date.now() - tStart) / 1000) + "s");
if (log.length) console.log(log.join("\n"));
const ok = joinedAsLate && deePid != null && datable && s && s.step === "season.end" && s.final && s.speed.pace === 0.5 && dpm && dee.s.pd[dpm.pid].t != null;
srv.kill(); for (const c of [host, bo, cy, dee]) c.ws.close();
if (!ok) { console.error("FAILED: late join / turbo flow incomplete"); process.exit(1); }
console.log("late e2e ok"); process.exit(0);
