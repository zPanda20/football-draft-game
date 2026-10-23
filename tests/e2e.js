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
    if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const host = client("Ana", true);
await new Promise((r) => setTimeout(r, 400));
const others = ["Bo", "Cy"].map((n) => { const c = client(n, false); c.room = host.room; return c; });
await new Promise((r) => setTimeout(r, 500));
host.send({ t: "start" });
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  await new Promise((r) => setTimeout(r, 300));
  if (host.s && host.s.step === "season.end") break;
}
const s = host.s;
const ok = s && s.step === "season.end";
console.log("steps seen:", [...seen].join(", "));
console.log("final step:", s && s.step, "| teams:", s && s.N, "| matchdays:", s && s.season.total);
if (s) console.log("champion:", s.teams[s.reveal.champion].name, "| my coins:", s.me.coins, "| my roster:", s.teams[s.me.teamId].players.length);
if (log.length) console.log(log.join("\n"));
srv.kill();
for (const c of [host, ...others]) c.ws.close();
if (!ok) { console.error("FAILED: season did not finish"); process.exit(1); }
console.log("e2e ok");
process.exit(0);
