// End-to-end for the shared love life, wedding ceremony, steroids for footballers and gifts: one manager and two footballers over WebSockets.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4800 + Math.floor(Math.random() * 400);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "60", TEST_STEROIDS: "3", TEST_ELITE: "1", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));

const T = { requests: 0, accepted: 0, joint: 0, excl: 0, wedPlanned: 0, ceremony: null, ceremonySeenBy: new Set(), notices: [], gifted: 0, giftOk: 0, steroidBought: 0, mgrNotified: 0, elite: 0, eliteBought: 0, itemCap: null, wedAsk: 0, agreed: 0, waiting: 0, beefReplied: 0, beefNews: 0 };
const sent = new Set();
function client(name, host) {
  const token = "rom-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`), c = { ws, token, s: null, name };
  const send = (m) => ws.send(JSON.stringify({ token, ...m }));
  c.send = send;
  c.once = (key, m) => { const k = name + "|" + (c.s ? c.s.step + ":" + (c.s.season ? c.s.season.day : "") + ":" + (c.s.seasonNo || "") : "") + "|" + key; if (sent.has(k)) return false; sent.add(k); send(m); return true; };
  ws.on("open", () => send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "hello") c.room = m.room;
    if (m.t !== "state") return;
    const s = (c.s = m.s);
    for (const n of s.notices || []) { T.notices.push(name + ": " + n.text); if (name !== "Pia" && name !== "Quin" && /used steroids/.test(n.text)) T.mgrNotified = 1; }
    if (s.news && s.news.list.some((n) => n.kind === "troll" && /HITS BACK|ROASTS|PETTY|RISES ABOVE|PERSONAL|BACK LINE|VIRAL|BANGER|KINDNESS|DROPS THE MIC|SLIDES INTO/.test(n.head))) T.beefNews = 1;
    if (s.ceremony) { T.ceremony = s.ceremony; T.ceremonySeenBy.add(name); }
    if (name === "Pia" && s.step === "season.end" && s.reveal && s.reveal.kind === "season") { const pid = s.pm.pid, mt = s.teams.find((t) => t.players.includes(pid)); T.title = { champion: s.reveal.champion, myTeam: mt ? mt.id : null, pid, mode: s.players.find((p) => p.you).mode }; }
    if (s.pm && s.pm.life) {
      const pm = s.pm, lf = pm.life, R = lf.rom;
      T.itemCap = s.cat ? null : T.itemCap;
      if (s.store && s.store.open) {
        const elite = Object.keys(s.store.stock).filter((k) => k.startsWith("boots-") && s.store.stock[k] > 0);
        if (elite.length) T.elite++;
      }
      // Pia (first footballer) asks Quin out, then asks to go exclusive, proposes, plans; Quin always says yes
      for (const r of R.incoming) { if (c.once("reply" + r.id, { t: "romReply", id: r.id, yes: true })) T.accepted++; }
      // the other footballer has to agree a plan sent to them (type, matchday, guests)
      if (R.wed && R.wed.status === "agreeing" && R.wed.plan && !R.wed.plan.mine) { if (c.once("agree" + R.wed.plan.tier + R.wed.plan.day, { t: "wedAgree", yes: true })) T.agreed++; }
      if (R.wed && R.wed.status === "agreeing" && R.wed.plan && R.wed.plan.mine) T.waiting++;
      if (R.beef && c.once("beef" + R.beef.id, { t: "beefReply", mode: "funny" })) T.beefReplied++;
      if (name === "Pia") {
        const q = R.people[0];
        if (q && s.step === "md.lineup" && q.can.date && !lf.act && !R.partner) { if (c.once("ask", { t: "romAsk", to: q.pid, kind: "date" })) T.requests++; }
        if (lf.act && lf.act.joint) T.joint++;
        if (q && R.partner && R.partner.human != null && !R.partner.excl && q.can.excl && R.partner.dates >= 3) { if (c.once("excl", { t: "romAsk", to: q.pid, kind: "excl" })) T.excl++; }
        if (q && R.partner && R.partner.excl && q.can.wed) { if (c.once("wed", { t: "romAsk", to: q.pid, kind: "wed" })) T.wedAsk++; }
        if (R.canPlan) { if (R.days.length && c.once("plan", { t: "wedPlan", tier: "quiet", day: R.days[0], guests: R.guests.map((g) => g.pub) })) T.wedPlanned++; }
        // make sure a date happens every week with the partner once exclusive
        if (s.step === "md.lineup" && !lf.act && R.partner && R.partner.human != null && q && q.can.date) c.once("again", { t: "romAsk", to: q.pid, kind: "date" });
        if (s.store && s.store.open && (s.store.stock.steroids || 0) > 0 && pm.coins >= 30 && !(pm.items.steroids > 0)) { if (c.once("steroid", { t: "buy", id: "steroids" })) T.steroidBought++; }
        if (pm.items.steroids > 0 && !pm.equip.includes("steroids") && s.step === "md.lineup") c.once("eqst", { t: "equipSelf", ids: ["steroids"] });
        const elite = Object.keys(s.store.stock).find((k) => k.startsWith("boots-") && s.store.stock[k] > 0);
        if (s.store.open && elite && pm.coins >= 250 && s.step === "md.lineup") { if (c.once("elite", { t: "buy", id: elite })) T.eliteBought++; }
      }
    }
    const me = s.me;
    if (me && s.store && s.store.open && s.step === "md.lineup") {
      if (me.coins >= 50 && !(me.items["boots-mizuno-low"] > 0)) c.once("abuy", { t: "buy", id: "boots-mizuno-low" });
      const users = s.teams[me.teamId].players.filter((id) => s.pd[id].u);
      if (me.items["boots-mizuno-low"] > 0 && users.length) { if (c.once("gift", { t: "gift", id: "boots-mizuno-low", pid: users[0] })) T.gifted++; }
      T.itemsSeen = me.items;
    }
    for (const u of s.players) if (u.you && u.mode === "player") T.mode = true;
    if (s.step === "draft.pick" && me && !(me.pick && me.pick.locked)) { send({ t: "pick", idx: 0 }); send({ t: "lock" }); }
    if (s.pm && s.step === "draft.pick" && s.pm.packs > 0) send({ t: "itemPack" });
    if (s.pm && s.pm.pack) send({ t: "packPick", idx: 0 });
    if (s.step === "market.bid" && me && !me.done) {
      if (!me.bid && s.market.pool.length && me.rosterRoom > 0 && me.coins >= 100) { const id = s.market.pool.map((i) => [i, s.pd[i].mv]).filter((x) => x[1] <= me.coins).sort((a, b) => b[1] - a[1])[0]; if (id) send({ t: "bid", bid: { kind: "p", id: id[0], len: 1, extra: 20 }, lock: true }); else send({ t: "pass" }); } else if (!me.bid) send({ t: "pass" });
    }
    if (s.pm) for (const o of s.pm.offers) if (o.status === "open" && s.step.startsWith("market.") && (o.from === "human" || name === "Quin")) send({ t: "offerRespond", id: o.id, accept: true });
    if (name === "Ana" && s.seekers && s.step.startsWith("market.") && me && me.rosterRoom > 0) { const sk = s.seekers.find((x) => x.owner === "Pia" && !x.mine.length); if (sk) c.once("offerPia", { t: "offer", pid: sk.id, len: 1 }); }
    if (s.pm && s.pm.life) { const it = s.pm.items["boots-mizuno-low"]; if (it > 0 && name === "Pia") T.giftOk = 1; }
    if (me && (s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) send({ t: "ready" });
    if (me && s.step === "off.resign" && !s.teams[me.teamId].ready) { for (const r of me.resign || []) if (me.coins >= r.fees[0]) send({ t: "resign", id: r.id, len: 1 }); send({ t: "ready" }); }
    if (me && s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) send({ t: "rookie", id: s.rookies.avail[0] });
    if (me && s.step === "off.trade" && !s.teams[me.teamId].ready) send({ t: "ready" });
  });
  return c;
}
const host = client("Ana", true);
await new Promise((r) => setTimeout(r, 400));
const pia = client("Pia", false), quin = client("Quin", false), bo = client("Bo", false);
for (const c of [pia, quin, bo]) c.room = host.room;
await new Promise((r) => setTimeout(r, 600));
pia.send({ t: "mode", mode: "player" }); quin.send({ t: "mode", mode: "player" });
await new Promise((r) => setTimeout(r, 300));
pia.send({ t: "char", c: { name: "Pia Striker", pos: "ST", gender: "F" } }); quin.send({ t: "char", c: { name: "Quin Keeper", pos: "CM", gender: "M" } });
host.send({ t: "settings", s: { seasons: 2 } });
await new Promise((r) => setTimeout(r, 300));
host.send({ t: "start" });
const t0 = Date.now(); let ended = false;
while (Date.now() - t0 < 240000) {
  await new Promise((r) => setTimeout(r, 300));
  if (host.s && host.s.step === "season.end") { if (host.s.final) { ended = true; break; } if (host.s.contSent !== host.s.seasonNo) { host.send({ t: "continue" }); host.s.contSent = host.s.seasonNo; await new Promise((r) => setTimeout(r, 400)); } }
  if (!process.env.ROM_FULL && T.ceremony && T.ceremonySeenBy.size >= 4 && T.mgrNotified) { await new Promise((r) => setTimeout(r, 600)); break; }
}
const pS = pia.s;
console.log(JSON.stringify({ ...T, ceremonySeenBy: [...T.ceremonySeenBy], notices: T.notices.length, ceremony: T.ceremony && { a: T.ceremony.a.name, b: T.ceremony.b.name, tier: T.ceremony.tier, guests: T.ceremony.guests } }));
const mgrNotes = T.notices.filter((n) => n.startsWith("Ana:") || n.startsWith("Bo:"));
console.log("manager notices:", mgrNotes.slice(0, 6).join(" | "));
const pm = pS && pS.pm, partner = pm && pm.life.rom.partner;
console.log("pia partner:", JSON.stringify(partner && { name: partner.name, excl: partner.excl, married: partner.married, dates: partner.dates, good: partner.good }));
const qS = quin.s && quin.s.pm && quin.s.pm.life.rom.partner;
const mine = (tag) => T.notices.some((n) => n.includes(tag));
const checks = {
  requestSent: T.requests > 0, accepted: T.accepted > 0, jointDate: T.joint > 0, planAgreed: T.waiting > 0 && T.agreed > 0, beefBroadcast: T.beefReplied === 0 || T.beefNews === 1, exclusive: !!(partner && partner.human != null && partner.excl) && !!(qS && qS.excl),
  wedding: !!T.ceremony && T.ceremonySeenBy.size >= 4, elite: T.elite > 0, steroids: T.steroidBought > 0,
  giftSent: T.gifted > 0 && !!T.giftOk, steroidNotice: T.mgrNotified > 0, gotNotice: mine("asks you out"),
};
console.log("checks:", JSON.stringify(checks));
srv.kill();
for (const c of [host, pia, quin, bo]) c.ws.close();
const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
if (bad.length) { console.error("FAILED:", bad.join(", ")); process.exit(1); }
console.log("rom e2e ok");
process.exit(0);
