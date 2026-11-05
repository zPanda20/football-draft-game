// Browser check for WAG mode (needs Playwright: PLAYWRIGHT=/path/to/playwright, default /opt/npm-tools/node_modules/playwright).
// A WAG and a footballer play in real browsers beside a manager bot: role choice, profile, weekly choice, a request the footballer accepts in the UI,
// attendance, the gala, laptop and narrow widths. Screenshots go to SHOTS (default the temp folder). Run: node tests/wag_browser.cjs
const { createRequire } = require("module"); const req = createRequire(__dirname + "/../package.json");
const WebSocket = req("ws"); const { spawn } = require("child_process"); const { mkdtempSync, mkdirSync } = require("fs"); const os = require("os"); const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/npm-tools/node_modules/playwright");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "shots-wag"); mkdirSync(SHOTS, { recursive: true });
const PORT = 5800 + Math.floor(Math.random() * 90);
const res = []; const ok = (c, m) => { res.push([!!c, m]); console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  let srv0;
  try { await main(); } catch (e) { console.error("FAIL (exception) " + (e && e.message || e).toString().split("\n").slice(0, 8).join(" | ")); if (srv0) srv0.kill(); process.exit(1); }
  async function main() {
  const srv = spawn("node", ["server/index.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT, TEST_SPEED: "6", DATA_DIR: mkdtempSync(path.join(os.tmpdir(), "fdg-")), TEST_PARAMS: JSON.stringify({ social: { wag: { attend: { meet: 1 } } } }) }, stdio: ["ignore", "pipe", "inherit"] });
  srv0 = srv;
  await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const bot = (name, host, room) => { const token = "tok-" + name, ws = new WebSocket(`ws://localhost:${PORT}/ws`), c = { ws, token, s: null, room }; c.send = (m) => ws.send(JSON.stringify({ token, ...m }));
    ws.on("open", () => c.send(host ? { t: "create", name } : { t: "join", name, room: c.room }));
    ws.on("message", (raw) => { const m = JSON.parse(raw); if (m.t === "hello") c.room = m.room; if (m.t !== "state") return; const s = (c.s = m.s), me = s.me; if (!me) return;
      if (s.step === "draft.pick" && !(me.pick && me.pick.locked)) { c.send({ t: "pick", idx: 0 }); c.send({ t: "lock" }); }
      if (s.step === "market.bid" && !me.done && !me.bid) c.send({ t: "pass" });
      if ((s.step === "md.lineup" || s.step === "md.half") && !s.teams[me.teamId].ready) c.send({ t: "ready" });
      const g = s.gala; if (g && g.attending) { if (s.step === "gala.prep" && !c.p) { c.p = 1; c.send({ t: "gReady" }); } if (s.step === "gala.live" && !g.pick) c.send({ t: "gPick", opt: (g.options || [])[0] ? g.options[0].id : "pass" }); } });
    return c; };
  const host = bot("Ana", true); await wait(600);
  const br = await chromium.launch(); const errs = [];
  const mk = async (name, w, h) => { const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); await ctx.addInitScript((n) => { try { localStorage.setItem("fdg.name", n); localStorage.setItem("fdg.level", "expert"); localStorage.setItem("fdg.seenGuide", "1"); } catch {} }, name);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(name + " PAGEERROR " + e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(name + " CONSOLE " + m.text()); });
    await p.goto(`http://localhost:${PORT}/?room=${host.room}`); await p.waitForTimeout(1500); await p.addStyleTag({ content: "#helpov,.helpov{display:none!important}" }); return p; };
  const W = await mk("Wendy", 1280, 900), F = await mk("Fay", 1280, 900);
  const S = (p) => p.evaluate(() => { const s = window.__st.S; return s ? { step: s.step, wag: s.wag, you: s.players.find((x) => x.you), notices: (s.notices || []).map((n) => n.text), body: document.body.innerText } : null; });
  // role choice
  ok(await W.locator('[data-act="mode"][data-mode="wag"]').count() === 1, "lobby offers 'Be a WAG' beside manager and footballer");
  await W.click('[data-act="mode"][data-mode="wag"]'); await W.waitForSelector("#wname"); await W.waitForTimeout(300);
  await W.fill("#wname", "Wendy Vale"); await W.dispatchEvent("#wname", "change"); await W.click('[data-act="wFace"][data-part="1"][data-v="3"]'); await W.waitForTimeout(300);
  ok((await S(W)).you.mode === "wag" && (await S(W)).you.wag.name === "Wendy Vale", "profile form saves a WAG name");
  ok(await W.locator('[data-act="club"]').first().isVisible().catch(() => false) === false, "a WAG is not asked to choose a club");
  await W.screenshot({ path: SHOTS + "/01-lobby-wag.png" });
  await F.click('[data-act="mode"][data-mode="player"]'); await F.waitForTimeout(400); await F.fill("#charname", "Fay Striker"); await F.dispatchEvent("#charname", "change");
  host.send({ t: "settings", s: { seasons: 1, pace: 0.5 } }); await wait(300); host.send({ t: "start" });
  const seen = new Set(); let asked = false, chose = false, accepted = false, narrow = false, resultSeen = false, t0 = Date.now(), overflowOK = true, strip = false, attendOK = false;
  while (Date.now() - t0 < 200000) {
    await W.waitForTimeout(150);
    const ws = await S(W), fs = await S(F); if (!ws) continue;
    if (ws.step.startsWith("gala.") && !seen.has(ws.step)) { seen.add(ws.step); await W.waitForTimeout(250); await W.screenshot({ path: SHOTS + "/" + ws.step.replace(".", "-") + "-wag.png" }); if (ws.step === "gala.live") { const b = W.locator('[data-act="gPick"]').first(); if (await b.count()) await b.click().catch(() => {}); } if (ws.step === "gala.prep") { const b = W.locator('[data-act="gReady"]'); if (await b.count()) await b.click().catch(() => {}); } continue; }
    if (ws.step === "gala.live") { const b = W.locator('[data-act="gPick"]').first(); if (await b.count()) await b.click().catch(() => {}); }
    if ((ws.step.startsWith("draft.") || ws.step.startsWith("market.")) && !seen.has("pre")) { seen.add("pre"); ok(/profile|WAG/i.test(ws.body) && !/Ready|Place bid/.test(ws.body.slice(0, 600)), "during draft/market the WAG sees a profile and no manager controls"); await W.screenshot({ path: SHOTS + "/02-draft-wag.png" }); }
    // the footballer's side: accept a WAG request in the UI
    if (fs && fs.step === "md.lineup") { const y = F.locator('[data-act="wYes"]').first(); if (await y.count() && !accepted) { const hit = await y.evaluate((b) => { b.click(); return true; }, null, { timeout: 1500 }).catch(() => false); if (hit) { accepted = true; await F.waitForTimeout(300); await F.screenshot({ path: SHOTS + "/05-footballer-accepted.png" }).catch(() => {}); { const fb = await S(F); ok(/booked|date with Wendy Vale|asks you out/i.test(fb.body) || (fb.notices || []).some((n) => /date with Wendy/.test(n)), "the footballer sees the date booked (or already played, once yes was the last thing the room waited for)"); }; } }
      if (!(fs.wag && 0)) { const act = F.locator('[data-act="act"]'); } }
    if (ws.step !== "md.lineup" && asked && !accepted) asked = false;
    if (ws.step === "md.lineup" && ws.wag && ws.wag.chooseOpen) {
      if (!seen.has("home")) { seen.add("home"); await W.waitForTimeout(200); ok(/This week/.test(ws.body) && /A match \(optional\)/.test(ws.body) && /Go on a date/.test(ws.body) && /Go out partying/.test(ws.body) && /Build a business/.test(ws.body) && !/Train/i.test(ws.body.slice(0, 1500)), "WAG home shows a match card and the five weekly activities (no training)"); await W.screenshot({ path: SHOTS + "/03-home-wag.png" }); ok(!/Line-up|Formation|Place bid/.test(ws.body), "no manager controls on the WAG screen");
        await W.setViewportSize({ width: 390, height: 844 }); await W.waitForTimeout(300); const ov = await W.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); overflowOK = overflowOK && ov <= 1; ok(ov <= 1, "narrow viewport (390px) has no horizontal scroll on the WAG home"); await W.screenshot({ path: SHOTS + "/04-home-wag-narrow.png" }); await W.setViewportSize({ width: 1280, height: 900 }); }
      if (!asked && ws.wag.humans.length && !(await W.locator('[data-act="wAsk"]').count())) { await W.click('[data-act="wDo"][data-a="date"]', { timeout: 3000 }).catch(() => {}); await W.waitForTimeout(250); }
      if (!asked && ws.wag.humans.length && (await W.locator('[data-act="wAsk"]').count())) { const b = W.locator('[data-act="wAsk"]').first(); if (await b.isEnabled()) { asked = true; await b.click(); await W.waitForTimeout(400); } }
      if (!ws.wag.act && !chose && asked && (await W.locator('[data-act="wGoMatch"]').isEnabled().catch(() => false))) { chose = true; await W.click('[data-act="wGoMatch"]', { timeout: 4000 }).catch(() => { chose = false; }); await W.waitForTimeout(300); if (chose && !attendOK) { attendOK = true; const st2 = await S(W); ok(/Going/.test(st2.body) || st2.wag.match || st2.wag.attending, "choosing a match is saved, separately from the main thing"); } if (!(await S(W)).wag.act) await W.click('[data-act="wDo"][data-a="quiet"]', { timeout: 4000 }).catch(() => {}); await W.waitForTimeout(200); }
      if (chose && ws.wag.act === null) chose = false;
    }
    if (ws.step === "md.result" && !strip) { strip = true; await W.waitForTimeout(300); const t = (await S(W)).body; ok(/WAG|💰/.test(t), "the full-time screen keeps the WAG's strip"); await W.screenshot({ path: SHOTS + "/06-result-wag.png" }); }
    if ((ws.notices || []).some((n) => /got talking to/.test(n))) resultSeen = true;
    if (ws.step === "season.end") break;
  }
  const last = await S(W);
  ok(accepted, "a human footballer accepted a WAG request in the browser");
  ok(resultSeen, "the attendance result reached the WAG as a notice (a contact for next matchday)");
  ok(seen.has("gala.prep") && seen.has("gala.live"), "the WAG saw the gala steps");
  ok(overflowOK, "no horizontal overflow");
  ok(errs.length === 0, "no page errors or console errors" + (errs.length ? ": " + errs.slice(0, 4).join(" | ") : ""));
  await br.close(); srv.kill(); for (const c of [host]) c.ws.close();
  const failed = res.filter((r) => !r[0]); console.log(`\n${res.length - failed.length}/${res.length} browser checks passed; shots in ${SHOTS}`); process.exit(failed.length ? 1 : 0);
  }
})();
