// End-to-end for player mode: two managers and one player-mode user, over WebSockets, through the first off-season.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4300 + Math.floor(Math.random() * 500);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "80", TEST_STEROIDS: "2", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));

const log = [], seen = new Set();
function client(name, host) {
  const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, token, s: null, name };
  const send = (m) => ws.send(JSON.stringify({ token, ...m }));
  c.send = send;
  const sentKeys = new Set(), once = (key, m) => { const k = (c.s ? c.s.step + ":" + (c.s.season ? c.s.season.day : "") + ":" + (c.s.seasonNo || "") : "") + "|" + key; if (sentKeys.has(k)) return false; sentKeys.add(k); send(m); return true; };
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t === "error") log.push(name + " error: " + m.msg);
    if (m.t !== "state") return;
    const s = (c.s = m.s); seen.add(s.step);
    for (const n of s.notices || []) stats.notices.add(n.text);
    for (const id of Object.keys(s.pd || {})) if ((s.pd[id].sp || 0) > stats.maxSusp) stats.maxSusp = s.pd[id].sp;
    if (s.pm) {
      const pm = s.pm;
      if (s.store && s.store.open && s.step === "md.lineup" && pm.coins >= 50 && !(pm.items["boots-mizuno-low"] > 0) && once("pbuy", { t: "buy", id: "boots-mizuno-low" })) stats.wallet++;
      if (pm.items["boots-mizuno-low"] > 0 && pm.equip.length === 0) once("peq", { t: "equipSelf", ids: ["boots-mizuno-low"] });
      if (s.store && s.store.open && pm.coins >= 30 && (s.store.stock.steroids || 0) > 0) once("psteroid", { t: "buy", id: "steroids" });
      for (const o of pm.offers) if (o.status === "open" && s.step.startsWith("market.") && !stats.done) { stats.offers++; if (o.from === "human" || stats.offers > 6) { send({ t: "offerRespond", id: o.id, accept: true }); } }
      if (pm.offers.some((o) => o.status === "accepted")) stats.accepted = 1;
      for (const c of pm.pending) { send({ t: "card", n: c.n, opt: 0 }); stats.cards++; }
      if (s.step === "md.half" && pm.onPitch && !pm.effort) { send({ t: "effort", mode: "push" }); }
      if (pm.effort) stats.effort++;
    }
    const me = s.me; if (!me) return;
    if (name === "Ana" && s.seekers && s.seekers.length && s.step === "market.bid" && !offered && me.rosterRoom > 0) { offered = true; stats.humanOffer++; send({ t: "offer", pid: s.seekers[0].id, len: 1 }); }
    if (s.store && s.store.open && s.step === "md.lineup" && !s.teams[me.teamId].ready) {
      if ((s.store.stock.steroids || 0) > 0 && me.coins >= 30 && !(me.items.steroids > 0)) { if (once("buyst", { t: "buy", id: "steroids" })) stats.bought++; }
      if (me.items.steroids > 0 && !(me.active || []).includes("steroids")) {
        const best = s.teams[me.teamId].players.map((id) => [id, s.pd[id].o, s.pd[id].sp || 0]).filter((x) => !x[2]).sort((a, b) => b[1] - a[1])[0];
        if (best && once("eqst", { t: "items", ids: ["steroids"], equip: { steroids: best[0] } })) stats.equipped++;
      }
      if (name === "Ana" && me.coins >= 50 && !(me.items["boots-mizuno-low"] > 0)) once("abuy", { t: "buy", id: "boots-mizuno-low" });
      const users = s.teams[me.teamId].players.filter((id) => s.pd[id].u);
      if (me.items["boots-mizuno-low"] > 0 && users.length && once("gift", { t: "gift", id: "boots-mizuno-low", pid: users[0] })) stats.gifts++;
    }
    if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { send({ t: "pick", idx: 0 }); send({ t: "lock" }); }
    if (s.step === "market.bid" && !me.done) {
      if (!me.bid && s.market.pool.length && me.rosterRoom > 0 && me.coins >= 100) {
        const id = s.market.pool.map((i) => [i, s.pd[i].mv]).filter((x) => x[1] <= me.coins).sort((a, b) => b[1] - a[1])[0];
        if (id) send({ t: "bid", bid: { kind: "p", id: id[0], len: 1, extra: 20 }, lock: true });
        else send({ t: "pass" });
      } else if (!me.bid) send({ t: "pass" });
    }
    if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (s.step === "off.resign" && !s.teams[me.teamId].ready) { for (const r of me.resign || []) if (me.coins >= r.fees[0]) send({ t: "resign", id: r.id, len: 1 }); send({ t: "ready" }); }
    if (s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) send({ t: "rookie", id: s.rookies.avail[0] });
    if (s.step === "off.trade" && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const host = client("Ana", true);
let offered = false;
await new Promise((r) => setTimeout(r, 400));
const others = ["Bo", "Cy"].map((n) => { const c = client(n, false); c.room = host.room; return c; });
const cy = others[1], stats = { offers: 0, accepted: 0, cards: 0, effort: 0, humanOffer: 0, bought: 0, equipped: 0, gifts: 0, notices: new Set(), wallet: 0, maxSusp: 0, rejected: 0 };
await new Promise((r) => setTimeout(r, 500));
cy.send({ t: "mode", mode: "player" });
await new Promise((r) => setTimeout(r, 200));
cy.send({ t: "roll" }); cy.send({ t: "char", c: { name: "Cy Striker", pos: "ST" } });
await new Promise((r) => setTimeout(r, 300));
console.log("lobby char:", JSON.stringify(cy.s.players.find((p) => p.you).char));
host.send({ t: "settings", s: { seasons: 2 } });
await new Promise((r) => setTimeout(r, 200));
host.send({ t: "start" });
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  await new Promise((r) => setTimeout(r, 300));
  if (host.s && host.s.step === "season.end") { if (host.s.final) break; if (!host.s.contSent || host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; await new Promise((r) => setTimeout(r, 400)); } }
}
const s = host.s;
const pmv = cy.s && cy.s.pm, up = cy.s && pmv && cy.s.pd[pmv.pid];
console.log("store:", JSON.stringify({ ...stats, notices: [...stats.notices] }));
console.log("player:", up && JSON.stringify({ ovr: up.o, team: up.t, contract: up.c, age: up.a }), "| stats", JSON.stringify(stats), "| pm.log", pmv && pmv.log.length);
const ok = s && s.step === "season.end" && s.final && s.seasonNo === 2 && up && up.t != null && stats.cards > 0 && pmv.log.length > 0 && stats.effort > 0 && stats.bought > 0 && stats.equipped > 0;
console.log("steps seen:", [...seen].join(", "));
console.log("final step:", s && s.step, "| season:", s && s.seasonNo, "| teams:", s && s.N, "| matchdays:", s && s.season.total, "| history:", s && s.history.length);
if (s) console.log("champion:", s.teams[s.reveal.champion].name, "| my coins:", s.me.coins, "| my roster:", s.teams[s.me.teamId].players.length);
if (log.length) console.log(log.join("\n"));
srv.kill();
for (const c of [host, ...others]) c.ws.close();
if (!ok) { console.error("FAILED: player mode flow incomplete"); process.exit(1); }
console.log("pm e2e ok");
process.exit(0);
