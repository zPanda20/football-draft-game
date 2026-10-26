// End-to-end: start the real server, connect three managers over WebSockets, play a whole season.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4300 + Math.floor(Math.random() * 500);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "80", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));

const log = [], seen = new Set();
const planSeen = { n: 0 }, packs = { n: 0 };
function client(name, host) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, token, s: null, name };
  const send = (m) => ws.send(JSON.stringify({ token, ...m }));
  c.send = send;
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") log.push(name + " error: " + m.msg);
    if (m.t !== "state") return;
    const s = (c.s = m.s); seen.add(s.step);
    const me = s.me; if (!me) return;
    if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { send({ t: "pick", idx: 0 }); send({ t: "lock" }); }
    if (s.step === "market.bid" && !me.done) {
      if (!me.bid && s.market.pool.length && me.rosterRoom > 0 && me.coins >= 100) {
        const id = s.market.pool.map((i) => [i, s.pd[i].mv]).filter((x) => x[1] <= me.coins).sort((a, b) => b[1] - a[1])[0];
        if (id) send({ t: "bid", bid: { kind: "p", id: id[0], len: 1, extra: 20 }, lock: true });
        else send({ t: "pass" });
      } else if (!me.bid) send({ t: "pass" });
    }
    if (s.step === "md.lineup" && name === "Ana" && !(me.plan && me.plan.tired && me.plan.tired.on) && me.lineup) { const l = me.lineup, xi = new Set([l.gk, ...l.out]), bench = s.teams[me.teamId].players.find((id) => !xi.has(id) && s.pd[id] && s.pd[id].pos !== "GK");
      send({ t: "plan", plan: { on: true, tired: { on: true, below: 80 }, subs: bench != null ? [{ out: l.out[0], in: bench, when: "always" }] : [] } }); }
    if (s.step === "md.half" && name === "Ana" && me.match && me.match.halftime.plan && !me.match.halftime.plan.over) planSeen.n++;
    if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (s.step === "off.resign" && !s.teams[me.teamId].ready) { for (const r of me.resign || []) if (me.coins >= r.fees[0]) send({ t: "resign", id: r.id, len: 1 }); send({ t: "ready" }); }
    if (s.step === "off.rookie.turn" && me.myTurn) {          // pack draft: Ana opens packs, Bo takes leftovers when there are any, Cy abstains
      const R = s.rookies;
      if (name === "Cy") send({ t: "rookiePass" });
      else if (R.stage === "pack") { send({ t: "rookie", id: R.pack[0] }); packs.n++; }
      else if (name === "Bo" && R.avail.length) send({ t: "rookie", id: R.avail[0] });
      else send({ t: "rookiePack" });
    }
    if (s.step === "off.trade" && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const host = client("Ana", true);
await new Promise((r) => setTimeout(r, 400));
const others = ["Bo", "Cy"].map((n) => { const c = client(n, false); c.room = host.room; return c; });
await new Promise((r) => setTimeout(r, 500));
host.send({ t: "settings", s: { seasons: 2 } });
await new Promise((r) => setTimeout(r, 200));
host.send({ t: "start" });
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await new Promise((r) => setTimeout(r, 300));
  if (host.s && host.s.step === "season.end") { if (host.s.final) break; if (!host.s.contSent || host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; await new Promise((r) => setTimeout(r, 400)); } }
}
const s = host.s; 
const aw = s && s.reveal && s.reveal.awards, hist = s && s.history.every((h) => h.awards && h.awards.ballon.length && h.awards.boot.length);
const xs = s ? Object.values(s.pd).filter((d) => d.x) : [], mo = xs.reduce((n, d) => n + d.x[11], 0);
console.log("my roster", s && s.teams[s.me.teamId].players.length, "| plan applied at half-time in", planSeen.n, "matches | awards:", aw ? ["ballon", "boot", "playmaker", "glove"].map((k) => k + "=" + (aw[k][0] ? aw[k][0].name : "-")).join(", ") : "none", "| potm awards on screen:", mo);
const ok = s && s.step === "season.end" && s.final && s.seasonNo === 2 && planSeen.n > 0 && aw && aw.ballon.length > 0 && aw.boot.length > 0 && hist && xs.length > 0 && xs.every((d) => d.x.length === 14);
console.log("steps seen:", [...seen].join(", "));
console.log("final step:", s && s.step, "| season:", s && s.seasonNo, "| teams:", s && s.N, "| matchdays:", s && s.season.total, "| history:", s && s.history.length);
if (s) console.log("champion:", s.teams[s.reveal.champion].name, "| my coins:", s.me.coins, "| my roster:", s.teams[s.me.teamId].players.length);
if (log.length) console.log(log.join("\n"));
srv.kill();
for (const c of [host, ...others]) c.ws.close();
if (!ok) { console.error("FAILED: season did not finish"); process.exit(1); }
console.log("packs kept by hand:", packs.n);
if (!packs.n) { console.error("FAILED: nobody opened a rookie pack"); process.exit(1); }
console.log("e2e ok");
process.exit(0);
