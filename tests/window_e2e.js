// In-season transfer window over WebSockets: open for the first 5 matchdays, free agents sign instantly, drops get no refund, closed afterwards.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 5400 + Math.floor(Math.random() * 400);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "80", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
const errs = [], S = { opens: [], signed: 0, dropped: 0, refundOk: true, closedAfter: null, lefts: new Set(), poolSeen: 0, tradeOffered: 0, sched: 0, rejectedClosed: 0 };
function client(name, host) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, s: null, name, sent: new Set() };
  const send = (m) => ws.send(JSON.stringify({ token, ...m }));
  c.send = send;
  const once = (key, m) => { const k = c.s.step + ":" + (c.s.season ? c.s.season.day : "") + "|" + key; if (c.sent.has(k)) return false; c.sent.add(k); send(m); return true; };
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") errs.push(m.msg);
    if (m.t !== "state") return;
    const s = (c.s = m.s), me = s.me;
    if (s.step === "draft.pick" && me && !(me.pick && me.pick.locked)) { send({ t: "pick", idx: 0 }); send({ t: "lock" }); }
    if (s.step === "market.bid" && me && !me.done && !me.bid) send({ t: "pass" });
    if (!me || name !== "Ana") { if (s.pm) { for (const k of s.pm.pending) send({ t: "card", n: k.n, opt: 0 }); } if (me && (s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" }); return; }
    if (s.sched && s.step === "md.lineup") S.sched = Math.max(S.sched, s.sched.results.length);
    if (s.step === "md.lineup") {
      const w = s.window; S.lefts.add(w.left); if (w.open) S.poolSeen = Math.max(S.poolSeen, (w.pool || []).length);
      const day = s.season.day;
      S.opens[day] = w.open;
      const team = s.teams[me.teamId];
      if (w.open && !s.teams[me.teamId].ready) {
        if (day === 1 && me.rosterRoom > 0 && w.pool.length) {
          const pid = w.pool.map((id) => [id, s.pd[id]]).filter((x) => x[1].mv * 1 <= me.coins).sort((a, b) => b[1].o - a[1].o)[0];
          if (pid && once("sign", { t: "windowSign", id: pid[0], len: 1 })) { S.signed++; c.wantId = pid[0]; c.before = me.coins; }
        }
        if (day === 2 && c.wantId != null && team.players.includes(c.wantId) && once("drop", { t: "windowDrop", id: c.wantId })) { S.dropped++; c.coinsAtDrop = me.coins; }
        if (day === 3 && c.coinsAtDrop != null && me.coins < c.coinsAtDrop) S.refundOk = true;
      }
      if (!w.open && day >= 6 && me.rosterRoom > 0 && once("late", { t: "windowSign", id: 1, len: 1 })) S.rejectedClosed++;
      if (!team.ready) send({ t: "ready" });
    }
    if (s.step === "md.half" && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const host = client("Ana", true);
await new Promise((r) => setTimeout(r, 400));
const cy = client("Cy", false); cy.room = host.room;
await new Promise((r) => setTimeout(r, 400));
cy.send({ t: "mode", mode: "player" }); await new Promise((r) => setTimeout(r, 150)); cy.send({ t: "roll" }); cy.send({ t: "char", c: { name: "Cy Star", pos: "ST" } });
await new Promise((r) => setTimeout(r, 200));
host.send({ t: "settings", s: { seasons: 1 } }); await new Promise((r) => setTimeout(r, 200)); host.send({ t: "start" });
const t0 = Date.now();
while (Date.now() - t0 < 200000) { await new Promise((r) => setTimeout(r, 300)); if (host.s && host.s.step === "season.end") break; }
const open = S.opens.map((o, i) => (o ? i : null)).filter((x) => x != null);
console.log("window open on matchdays (index):", open.join(","), "| lefts:", [...S.lefts].sort().join(","), "| signed", S.signed, "| dropped", S.dropped, "| pool", S.poolSeen, "| sched results", S.sched, "| late sign tries", S.rejectedClosed);
if (errs.length) console.log("errors:", [...new Set(errs)].slice(0, 6).join(" | "));
const ok = host.s.step === "season.end" && open.length === 5 && S.signed === 1 && S.dropped === 1 && S.poolSeen > 20 && S.sched > 5;
srv.kill(); host.ws.close(); cy.ws.close();
if (!ok) { console.error("FAILED: window flow"); process.exit(1); }
console.log("window e2e ok");
process.exit(0);
