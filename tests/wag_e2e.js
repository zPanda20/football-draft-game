// End-to-end WAG mode: a real server, real WebSocket clients, two seasons at Turbo. Shapes:
//   mixed   manager + footballer + two WAGs (competition, request/accept, attendance, gala)
//   wagonly one WAG alone in the room (nothing else to wait for)
//   nowag   managers + a footballer, nobody is a WAG (old behaviour)
//   off     social events switched off, with WAGs (gifts refused, dating still works)
//   auto    a WAG on Auto, a WAG who never answers (idle) and one who disconnects and reconnects
//   late    a WAG who joins after the game has begun
// Run with: node tests/wag_e2e.js [shape]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const SHAPE = process.argv[2] || "mixed", SEASONS = 2;
const PORT = 5900 + Math.floor(Math.random() * 400);
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "60", DATA_DIR: mkdtempSync(join(tmpdir(), "fdg-")), TEST_PARAMS: JSON.stringify({ social: { wag: { attend: { meet: 1 } } } }) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
const steps = [], errors = [], evidence = { attend: 0, date: 0, content: 0, humanDate: 0, humanAccepts: 0, contacts: 0, competition: 0, notClubbed: 0, giftRefused: 0, giftSent: 0, leaks: 0 }, noticeSeen = new Set(), wagIds = {};
let lastStep = "";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name, role, opts = {}) {
  const token = "tok-" + name, c = { token, s: null, name, role, opts, done: new Set(), msgs: 0, room: opts.room };
  c.send = (m) => c.ws && c.ws.readyState === 1 && c.ws.send(JSON.stringify({ token, ...m }));
  c.open = () => {
    c.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    c.ws.on("open", () => c.send(role === "host" ? { t: "create", name } : { t: "join", name, room: c.room }));
    c.ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.t === "hello") c.room = m.room; if (m.t === "error") errors.push(name + ": " + m.msg); if (m.t === "state") { c.s = m.s; c.msgs++; onState(c, m.s); } });
  };
  c.open(); return c;
}
function onState(c, s) {
  if (c.opts.host && s.step !== lastStep) { lastStep = s.step; steps.push(s.step); }
  for (const n of s.notices || []) if (!noticeSeen.has(c.name + n.id)) { noticeSeen.add(c.name + n.id); if (/chose your invitation|accepted another invitation|not charged/.test(n.text)) evidence.competition++; if (/not charged/.test(n.text)) evidence.notClubbed++; if (/got talking to/.test(n.text)) evidence.contacts++; }
  // privacy: only a WAG gets a wag record, and it is theirs
  if (c.role !== "wag" && s.wag) evidence.leaks++;
  if (c.role === "wag" && s.wag && c.wagId && s.wag.id !== c.wagId) evidence.leaks++;
  if (c.role === "wag" && s.wag) c.wagId = s.wag.id;
  for (const p of s.players || []) if (!p.you && p.wag && (p.wag.img !== undefined || p.wchar)) evidence.leaks++;
  if (s.pm && s.pm.life && s.pm.life.wag) for (const r of s.pm.life.wag.incoming) if (r.who && r.who.wag === undefined) evidence.leaks++;
  const g = s.gala;
  if (g && g.attending && !c.opts.silent && !c.opts.auto) {
    const key = s.step + s.seasonNo;
    if (s.step === "gala.prep" && !c.done.has(key)) { c.done.add(key); const o = g.att.find((a) => !a.you && a.kind !== "guest"); if (o) c.send({ t: "gSeat", target: o.key }); c.send({ t: "gReady" }); }
    if (s.step === "gala.live") { for (const p of g.prompts || []) { const k = "p" + p.id; if (!c.done.has(k)) { c.done.add(k); c.send({ t: "gRespond", id: p.id, mode: "yes" }); } } if (!g.pick && !c.done.has(key)) { c.done.add(key); const o = (g.options || []).find((x) => x.needs) || (g.options || [])[0]; c.send({ t: "gPick", opt: o ? o.id : "pass" }); } }
  }
  if (c.role === "wag") return wagBot(c, s);
  const me = s.me; if (s.pm && s.step === "md.half" && s.pm.onPitch && !s.pm.effort) c.send({ t: "effort", mode: "push" });
  if (c.role === "foot") {
    const lf = s.pm && s.pm.life;
    if (s.step === "md.lineup" && lf) {
      const key = "lf" + s.seasonNo + s.season.day;
      for (const r of lf.wag.incoming) { const k = "r" + r.id; if (!c.done.has(k)) { c.done.add(k); evidence.humanAccepts++; c.send({ t: "wAnswer", id: r.id, yes: true }); } }
      if (lf.wag.booked) c.sawBooked = true;
      if (!lf.act && !c.done.has(key)) { c.done.add(key); c.send({ t: "act", act: "balance" }); }
    }
    return;
  }
  if (!me) return;
  if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { c.send({ t: "pick", idx: 0 }); c.send({ t: "lock" }); }
  if (s.step === "market.bid" && !me.done) { if (!me.bid) c.send({ t: "pass" }); }
  if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) c.send({ t: "ready" });
  if (s.step === "off.resign" && !s.teams[me.teamId].ready) c.send({ t: "ready" });
  if (s.step === "off.rookie.turn" && me.myTurn && s.rookies.avail.length) c.send({ t: "rookie", id: s.rookies.avail[0] });
  if (s.step === "off.trade" && !s.teams[me.teamId].ready) c.send({ t: "ready" });
}
// A WAG bot: season 1 goes to the first match naming a player; later it invites whoever is a contact; one WAG asks the human footballer out.
function wagBot(c, s) {
  const W = s.wag; if (!W) return;
  const lk = "L" + s.seasonNo + ":" + W.next + ":" + (W.last && W.last.act);
  if (W.last && !c.done.has(lk)) { c.done.add(lk); if (W.last.attend != null) evidence.attend++; if (W.last.act === "party") evidence.party = (evidence.party || 0) + 1; if (W.last.act === "business") evidence.business = (evidence.business || 0) + 1; if (W.last.act === "date" && String(W.last.with).startsWith("n:")) evidence.npcDate = (evidence.npcDate || 0) + 1; if (W.last.act === "date" && !W.last.failed) { evidence.date++; if (String(W.last.with).startsWith("u:")) evidence.humanDate++; } if (W.last.act === "content") evidence.content++; }
  if (W.seq && W.seq.done && !c.done.has("sq" + lk)) { c.done.add("sq" + lk); evidence.seqDone = (evidence.seqDone || 0) + 1; if (W.seq.log.some((x) => x.auto)) evidence.seqAuto = (evidence.seqAuto || 0) + 1; if (W.seq.log.some((x) => !x.auto)) evidence.seqChosen = (evidence.seqChosen || 0) + 1; }
  if (c.opts.silent || c.opts.auto) return;
  // the two match-time choices: some WAGs answer them live, the gifter never does (it is chosen for them)
  if (["md.half1", "md.half", "md.half2"].includes(s.step) && W.seq && W.seq.open && !c.opts.gifter) { const k = "q" + s.seasonNo + ":" + W.next + ":" + W.seq.open.beat; if (!c.done.has(k)) { c.done.add(k); const o = W.seq.open.options.filter((x) => x.can); if (o.length) c.send({ t: "wSeq", i: o[(W.next + W.seq.open.beat) % o.length].i }); } }
  if (s.step !== "md.lineup" || !W.chooseOpen) return;
  const key = "w" + s.seasonNo + ":" + W.next; if (c.done.has(key)) return; c.done.add(key);
  const ready = W.contacts.find((x) => x.ready);
  if (c.opts.asker && (W.humans || []).length && !c.done.has("asked")) { const h = W.humans.find((x) => !x.taken); if (h) { c.done.add("asked"); return c.send({ t: "wAsk", to: h.id, kind: "date" }); } }
  const f = W.fixtures[0]; if (f && W.coins >= W.cost.attend && (W.next % 2 === 0 || s.seasonNo === 1 && W.next < 4)) { const sq = (W.roster[f.a] || []).find((p) => !p.taken && !p.human); c.send({ t: "wMatch", c: { fixture: f.i, team: f.a, target: sq ? sq.id : null } }); }
  if (W.seeing.some((x) => x.human) && !c.done.has("hum" + W.next)) return c.send({ t: "wAct", c: { act: "quiet" } });
  if (ready && W.coins >= W.cost.date) return c.send({ t: "wAct", c: { act: "date", partner: ready.id } });
  if (W.social && W.contacts.length === 0 && W.gifts.length && c.opts.gifter && W.coins > 200) { const to = (W.scene[0] || {}).id; if (to) { evidence.giftSent++; c.send({ t: "wGift", to, tier: "flowers", pub: false }); } }
  const rot = ["party", "business", "content", "date", "quiet"][W.next % 5], npc = (W.pool || []).find((x) => x.kind === "npc");
  if (rot === "date" && npc && W.coins >= npc.cost) return c.send({ t: "wAct", c: { act: "date", partner: npc.id } });
  c.send({ t: "wAct", c: { act: rot === "content" && W.contentLeft <= 0 ? "quiet" : rot === "date" ? "quiet" : rot === "party" && W.coins < W.cost.party ? "quiet" : rot } });
}
const roles = { mixed: [["Ana", "host"], ["Fay", "foot"], ["Wen", "wag", { asker: true }], ["Wyn", "wag", { gifter: true }], ["Wil", "wag", {}]], wagonly: [["Wen", "wag", { host: true }]], nowag: [["Ana", "host"], ["Bo", "mgr"], ["Fay", "foot"]], off: [["Ana", "host"], ["Fay", "foot"], ["Wen", "wag", { asker: true, gifter: true }]], auto: [["Ana", "host"], ["Wen", "wag", { auto: true }], ["Wyn", "wag", { silent: true }], ["Wex", "wag", {}]], late: [["Ana", "host"], ["Bo", "mgr"]] }[SHAPE];
const cl = []; let host = null;
for (const [n, r, o] of roles) { const wantHost = r === "host" || (o && o.host); const c = client(n, wantHost ? "host" : r, { ...(o || {}), room: host && host.room }); c.role = r === "host" ? "mgr" : r; c.opts.host = c.opts.host || r === "host"; if (wantHost) host = c; cl.push(c); await wait(450); if (!host.room) await wait(300); for (const x of cl) x.room = host.room; }
for (const c of cl) { if (c.role === "wag") { c.send({ t: "mode", mode: "wag" }); await wait(150); c.send({ t: "wChar", c: { name: c.name + " WAG", gender: "F" } }); } if (c.role === "foot") { c.send({ t: "mode", mode: "player" }); await wait(150); c.send({ t: "char", c: { name: c.name + " Striker", pos: "ST" } }); } }
await wait(300);
host.send({ t: "settings", s: { seasons: SEASONS, pace: 0.5, ...(SHAPE === "off" ? { social: 0 } : {}) } }); await wait(300);
host.send({ t: "start" });
// the big-screen view (/screen) must never carry anybody's private WAG data
const screen = { s: null, bad: 0, frames: 0 }; { const ws = new WebSocket(`ws://localhost:${PORT}/ws`); ws.on("open", () => ws.send(JSON.stringify({ t: "watch", room: host.room }))); ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.t !== "state") return; screen.s = m.s; screen.frames++; if (m.s.wag || m.s.pm || m.s.me || m.s.social && m.s.social.role) screen.bad++; for (const p of m.s.players || []) if (p.wchar || (p.wag && p.wag.img !== undefined) || p.unlocks) screen.bad++; if (/"coins":\d+,"fol":/.test(JSON.stringify(m.s.wag || {}))) screen.bad++; }); }
const t0 = Date.now(); let reconnected = false, lateAdded = false, late = null;
while (Date.now() - t0 < 280000) {
  await wait(300);
  const s = host.s; if (!s) continue;
  if (SHAPE === "auto" && !reconnected && s.step === "md.lineup" && s.season && s.season.day >= 2) { reconnected = true; const w = cl.find((x) => x.name === "Wex"); w.ws.close(); await wait(1500); w.open(); }
  if (SHAPE === "late" && !lateAdded && s.step === "md.lineup" && s.season && s.season.day >= 1) { lateAdded = true; late = client("Lia", "wag", { room: host.room, asker: true }); cl.push(late); await wait(500); late.send({ t: "mode", mode: "wag" }); await wait(200); late.send({ t: "wChar", c: { name: "Late WAG", gender: "F" } }); await wait(200); late.send({ t: "lateJoin" }); }
  if (s.step === "season.end") { if (s.final) break; if (s.contSent !== s.seasonNo) { host.send({ t: "continue" }); s.contSent = s.seasonNo; } }
}
const s = host.s, finished = !!(s && s.step === "season.end" && s.final);
const wags = cl.filter((c) => c.role === "wag"), foots = cl.filter((c) => c.role === "foot");
const check = [];
const must = (ok, msg) => { if (!ok) check.push(msg); };
must(finished, "game did not finish both seasons");
must(errors.length === 0, "server errors: " + errors.join("; "));
must(screen.frames > 10 && screen.bad === 0, "the /screen payload carried private data (" + screen.bad + " frames of " + screen.frames + ")");
must(evidence.leaks === 0, "private data leaked to " + evidence.leaks + " payloads");
// WAGs are never footballers: no player record, no club, no team entry
for (const w of wags) { const y = s.players.find((p) => p.name === w.name); must(y && y.mode === "wag" && y.pid === null && y.teamId === null, w.name + " must be a WAG with no pid and no team"); must(!Object.values(s.pd || {}).some((x) => x.u && x.u.name === w.name + " WAG"), w.name + " has a player record"); }
must(s.teams.filter((t) => t.human).length === cl.filter((c) => c.role === "mgr").length, "WAGs must not count as human clubs");
const galaSteps = steps.filter((x) => x.startsWith("gala."));
const galaOK = SHAPE === "off" || SHAPE === "nowag" || galaSteps.join(",") === Array.from({ length: SEASONS }, () => "gala.prep,gala.live,gala.end").join(",");
must(SHAPE === "nowag" || galaOK, "gala steps wrong: " + galaSteps.join(","));
if (SHAPE === "mixed") { must(evidence.attend >= 2, "attendance did not happen"); must((evidence.party || 0) >= 1 && (evidence.business || 0) >= 1 && (evidence.npcDate || 0) >= 1, "party, business and a pool date should all have happened: " + JSON.stringify(evidence)); must((evidence.seqChosen || 0) >= 1 && (evidence.seqAuto || 0) >= 1, "match-time choices: some answered live, some chosen for the WAG: " + JSON.stringify(evidence)); must(evidence.contacts >= 1, "nobody got a contact"); must(evidence.date >= 1, "no date happened"); must(evidence.humanAccepts >= 1, "the footballer never got a WAG request"); must(evidence.humanDate >= 1, "the WAG and the human footballer never went on their date"); must(evidence.competition >= 1, "two WAGs never competed for an invitation"); }
if (SHAPE === "wagonly") { must(evidence.attend >= 1 || evidence.content >= 1, "a WAG alone never acted"); must(galaSteps.length === SEASONS * 3, "WAG-only gala missing"); }
if (SHAPE === "off") { must(evidence.attend >= 1, "no attendance with social off"); }
if (SHAPE === "auto") { const wex = cl.find((x) => x.name === "Wex"); must(wex.s && wex.s.wag && wex.s.wag.id === wex.wagId, "reconnected WAG lost its record"); const a = cl.find((x) => x.name === "Wen"); must(a.s.wag && a.s.wag.cnt.attend === 0 && a.s.wag.cnt.date === 0 && a.s.wag.coins >= 400, "the Auto WAG must take quiet weeks and spend nothing"); }
if (SHAPE === "late") { const lw = late && late.s && late.s.wag; must(lw && lw.name === "Late WAG", "late WAG never joined: " + JSON.stringify(late && late.s && late.s.players.find((p) => p.you)) + " errors " + errors.join("; ")); if (lw) must(lw.cnt.attend + lw.cnt.content + lw.cnt.quiet + lw.cnt.date + (lw.cnt.party || 0) + (lw.cnt.business || 0) >= 1, "late WAG never played a week"); }
console.log(`shape ${SHAPE}:`, JSON.stringify({ finished, evidence, galaSteps: galaSteps.length, elapsed: Math.round((Date.now() - t0) / 1000) + "s", errors }));
srv.kill(); for (const c of cl) c.ws && c.ws.close();
if (check.length) { console.error("FAILED " + SHAPE + ":\n - " + check.join("\n - ")); process.exit(1); }
console.log("wag e2e ok: " + SHAPE); process.exit(0);
