// WAG state survives a server restart from the two checkpoints the Room really writes (pre-season and season end).
// Run with: node tests/wag_restore_e2e.js. Nothing here claims a restore from the middle of a matchday: Room only saves at those two points.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 6300 + Math.floor(Math.random() * 300), DATA = mkdtempSync(join(tmpdir(), "fdg-"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null;
async function boot() { srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "60", DATA_DIR: DATA, TEST_PARAMS: JSON.stringify({ social: { wag: { attend: { meet: 1 } } } }) }, stdio: ["ignore", "pipe", "inherit"] }); await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r())); }
const check = []; const must = (ok, m) => { if (!ok) check.push(m); console.log((ok ? "ok   " : "FAIL ") + m); };
function client(name, role, room) {
  const token = "tok-" + name, c = { token, name, role, room, s: null, done: new Set() };
  c.send = (m) => c.ws && c.ws.readyState === 1 && c.ws.send(JSON.stringify({ token, ...m }));
  c.open = () => { c.ws = new WebSocket(`ws://localhost:${PORT}/ws`); c.ws.on("open", () => c.send(role === "host" && !c.room ? { t: "create", name } : { t: "join", name, room: c.room }));
    c.ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.t === "hello") c.room = m.room; if (m.t === "state") { c.s = m.s; (c.seen = c.seen || new Set()).add(m.s.step); play(c, m.s); } }); };
  c.open(); return c;
}
function play(c, s) {
  const g = s.gala; if (g && g.attending) { const key = s.step + s.seasonNo; if (s.step === "gala.prep" && !c.done.has(key)) { c.done.add(key); c.send({ t: "gReady" }); } if (s.step === "gala.live" && !g.pick && !c.done.has(key)) { c.done.add(key); c.send({ t: "gPick", opt: (g.options || [])[0] ? g.options[0].id : "pass" }); } }
  if (c.role === "wag") { const W = s.wag; if (W && s.step === "md.lineup" && W.chooseOpen && !c.done.has("w" + s.seasonNo + W.next)) { c.done.add("w" + s.seasonNo + W.next); const ready = W.contacts.find((x) => x.ready); const f = W.fixtures[0]; if (ready && W.coins >= W.cost.date) c.send({ t: "wAct", c: { act: "date", partner: ready.id } }); else if (f && W.coins >= W.cost.attend) c.send({ t: "wAct", c: { act: "attend", fixture: f.i, team: f.a, target: ((W.roster[f.a] || []).find((p) => !p.taken && !p.human) || {}).id || null } }); else c.send({ t: "wAct", c: { act: "quiet" } }); } return; }
  const me = s.me; if (!me) return;
  if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { c.send({ t: "pick", idx: 0 }); c.send({ t: "lock" }); }
  if (s.step === "market.bid" && !me.done && !me.bid) c.send({ t: "pass" });
  if ((s.step === "md.lineup" || s.step === "md.half" || s.step === "off.resign" || s.step === "off.trade") && !s.teams[me.teamId].ready) c.send({ t: "ready" });
  if (s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) c.send({ t: "rookie", id: s.rookies.avail[0] });
}
async function until(c, f, ms = 120000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (c.s && f(c.s)) return true; await wait(200); } return false; }
await boot();
const host = client("Ana", "host"); await wait(500);
const wag = client("Wen", "wag", host.room), wag2 = client("Wyn", "wag", host.room); await wait(600);
for (const [c, n] of [[wag, "Wen Vale"], [wag2, "Wyn Park"]]) { c.send({ t: "mode", mode: "wag" }); await wait(150); c.send({ t: "wChar", c: { name: n, gender: "F" } }); }
await wait(300); host.send({ t: "settings", s: { seasons: 2, pace: 0.5 } }); await wait(300); host.send({ t: "start" });
// checkpoint 1: pre-season
// market.done is a short step at this speed: look at every state received, not only the latest one
must(await until(host, () => host.seen && (host.seen.has("market.done") || host.seen.has("season.intro"))), "reached the pre-season checkpoint");
await wait(500);
const pre = { id: wag.s.wag.id, name: wag.s.wag.name, coins: wag.s.wag.coins, fol: wag.s.wag.fol };
srv.kill("SIGKILL"); await wait(800); for (const c of [host, wag, wag2]) c.ws.close();
await boot(); const room = host.room;
const host2 = client("Ana", "host", room), wag3 = client("Wen", "wag", room), wag4 = client("Wyn", "wag", room); wag3.role = wag.role; host2.role = "host";
must(await until(wag3, (s) => !!s.wag), "after a restart from the pre-season save the WAG still has a record");
must(wag3.s.wag.id === pre.id && wag3.s.wag.name === pre.name && wag3.s.wag.coins === 400 && wag3.s.wag.fol === 3000, "pre-season restore keeps id and name and returns the WAG to its checkpoint state (starting purse; anything spent after the checkpoint is not restored, as for every other player): " + JSON.stringify([pre, wag3.s.wag.id, wag3.s.wag.name, wag3.s.wag.coins, wag3.s.wag.fol]));
must(wag3.s.players.find((p) => p.you).mode === "wag" && wag3.s.players.find((p) => p.you).pid === null, "the restored WAG is still a WAG with no player record");
must(!host2.s.wag && host2.s.teams.filter((t) => t.human).length === 1, "managers still do not see a wag record, and WAGs do not count as clubs");
// play on to the season-end checkpoint
must(await until(host2, (s) => s.step === "season.end" && !s.final, 150000), "season 1 played out after the restore");
await wait(600);
const end = { coins: wag3.s.wag.coins, fol: wag3.s.wag.fol, cnt: { ...wag3.s.wag.cnt }, seeing: wag3.s.wag.seeing.length };
must(end.cnt.attend + end.cnt.date + end.cnt.content >= 3, "the WAG played real weeks in season 1: " + JSON.stringify(end.cnt));
srv.kill("SIGKILL"); await wait(800); for (const c of [host2, wag3, wag4]) c.ws.close();
await boot();
const host3 = client("Ana", "host", room), wag5 = client("Wen", "wag", room); host3.role = "host";
must(await until(wag5, (s) => !!s.wag), "after a restart from the season-end save the WAG still has a record");
must(wag5.s.wag.coins === end.coins && wag5.s.wag.fol === end.fol && JSON.stringify(wag5.s.wag.cnt) === JSON.stringify(end.cnt) && wag5.s.wag.seeing.length === end.seeing, "season-end restore keeps coins, followers, counters and relationships");
host3.send({ t: "continue" });
must(await until(host3, (s) => s.step === "season.end" && s.final, 200000), "the restored game plays season 2 to the end with the WAG taking part");
must(wag5.s.wag.cnt.attend + wag5.s.wag.cnt.date + wag5.s.wag.cnt.content + wag5.s.wag.cnt.quiet > end.cnt.attend + end.cnt.date + end.cnt.content + end.cnt.quiet, "the WAG kept playing weeks after the restore");
srv.kill(); for (const c of [host3, wag5]) c.ws.close();
if (check.length) { console.error("FAILED:\n - " + check.join("\n - ")); process.exit(1); }
console.log("wag restore e2e ok"); process.exit(0);
