// Browser check for the WAG week: five activities, a separate match card, the date pool with portraits, the rosters tab with player cards,
// and the two match-time choices that run on the match timers (never holding the match). Run: node tests/wag_week_browser.cjs

const { createRequire } = require("module"); const req = createRequire(__dirname + "/../package.json");
const WebSocket = req("ws"); const { spawn } = require("child_process"); const { mkdtempSync, mkdirSync } = require("fs"); const os = require("os"); const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/npm-tools/node_modules/playwright");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "shots-wagweek"); mkdirSync(SHOTS, { recursive: true });
const PORT = 5800 + Math.floor(Math.random() * 90);
const res = []; const ok = (c, m) => { res.push([!!c, m]); console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  let srv0;
  try { await main(); } catch (e) { console.error("FAIL (exception) " + (e && e.message || e).toString().split("\n").slice(0, 8).join(" | ")); if (srv0) srv0.kill(); process.exit(1); }
  async function main() {
  const srv = spawn("node", ["server/index.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT, TEST_SPEED: "4", DATA_DIR: mkdtempSync(path.join(os.tmpdir(), "fdg-")), TEST_PARAMS: JSON.stringify({ social: { wag: { attend: { meet: 1 } } } }) }, stdio: ["ignore", "pipe", "inherit"] });
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
  const mk = async (name, w, h) => { const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); await ctx.addInitScript((n) => { try { localStorage.setItem("fdg.name", n); localStorage.setItem("fdg.help", "1"); } catch (e) {} }, name);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(name + " PAGEERROR " + e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(name + " CONSOLE " + m.text()); });
    await p.goto(`http://localhost:${PORT}/?room=${host.room}`); await p.waitForTimeout(1500); await p.addStyleTag({ content: "#helpov,.helpov{display:none!important}" }); return p; };
  const W = await mk("Wendy", 1280, 1000);
  const S = (p) => p.evaluate(() => { const s = window.__st.S; return s ? { step: s.step, wag: s.wag, body: document.body.innerText } : null; });
  await W.click('[data-act="mode"][data-mode="wag"]'); await W.waitForSelector("#wname"); await W.fill("#wname", "Wendy Vale"); await W.dispatchEvent("#wname", "change"); await W.waitForTimeout(300);
  host.send({ t: "settings", s: { seasons: 1, pace: 0.5 } }); await wait(300); host.send({ t: "start" });
  const seen = new Set(); let lineups = 0, lastKey = "", t0 = Date.now(), overflow = true, sawHalf1Seq = false, sawBeat2 = false, doneOnResult = false, idleDone = false, backToMenu = 0, plan = null;
  const key = (s) => s.step + ":" + (s.wag ? s.wag.next : "");
  while (Date.now() - t0 < 240000) {
    await W.waitForTimeout(120);
    const s = await S(W); if (!s || !s.wag) continue;
    if (s.step === "md.lineup" && s.wag.chooseOpen && key(s) !== lastKey) {
      lastKey = key(s); lineups++; await W.waitForTimeout(250);
      if (lineups === 1) {
        ok(await W.locator(".wact").count() === 5, "five weekly activities as cards: date, party, quiet night in, content, business");
        ok(!/\bTrain/i.test(s.body.slice(0, 2000)), "no training option for a WAG");
        ok(/A match \(optional\)/.test(s.body) && await W.locator('[data-act="wGoMatch"]').count() === 1, "the match is a separate card with its own button");
        // rosters tab: player cards for every team
        await W.click('[data-act="wTab"][data-tab="rosters"]'); await W.waitForTimeout(250);
        const cards = await W.locator(".rostc .pcard").count(); ok(cards >= 5, `the rosters tab shows player cards (${cards})`);
        const first = await W.locator(".rost").innerText(); await W.locator('[data-act="wRoster"]').nth(3).click(); await W.waitForTimeout(250); const second = await W.locator(".rost").innerText();
        ok(first !== second, "choosing another club shows that club's players"); await W.screenshot({ path: SHOTS + "/01-rosters.png" });
        ok(await W.locator(".rostc .pinfo").count() > 0, "cards open the full card (info button)");
        await W.click('[data-act="wTab"][data-tab="week"]'); await W.waitForTimeout(200);
        // the pool, with pictures
        await W.click('[data-act="wDo"][data-a="date"]'); await W.waitForTimeout(300);
        const faces = await W.locator(".datecards .pface").count(), imgs = await W.locator('.datecards img.pface[src^="/assets/partners/"]').count(), pcards = await W.locator(".datecards .pcard").count();
        ok(faces === 3 && imgs === 3, `the pool shows three people who are not players, each with a picture (${imgs}/${faces})`);
        ok(pcards >= 1, `footballers on the scene appear as player cards (${pcards})`);
        await W.screenshot({ path: SHOTS + "/02-pool.png" });
        await W.setViewportSize({ width: 390, height: 844 }); await W.waitForTimeout(300); const ov = await W.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); overflow = overflow && ov <= 1; ok(ov <= 1, "narrow viewport: no horizontal overflow on the pool (" + ov + ")"); await W.screenshot({ path: SHOTS + "/03-pool-narrow.png" });
        await W.setViewportSize({ width: 1280, height: 1000 }); await W.waitForTimeout(250);
        await W.locator('[data-act="wInvite"][data-id^="n:"]').first().click(); await W.waitForTimeout(300);
        plan = "date";
      } else if (lineups === 2) { plan = "party"; await W.click('[data-act="wDo"][data-a="party"]'); }
      else if (lineups === 3) { plan = "business+match"; await W.click('[data-act="wGoMatch"]'); await W.waitForTimeout(200); await W.click('[data-act="wDo"][data-a="business"]'); }
      else if (lineups === 4) { plan = "content-idle"; await W.click('[data-act="wDo"][data-a="content"]'); }
      else { plan = "quiet"; await W.click('[data-act="wDo"][data-a="quiet"]'); }
      backToMenu++;
    }
    if (plan === "date" && s.step === "md.half1" && !seen.has("date")) { seen.add("date"); ok(s.wag.last && s.wag.last.act === "date" && String(s.wag.last.with).startsWith("n:"), "inviting a pool person who is not a player: the date happens at kick-off"); }
    if (plan === "party" && s.step === "md.half1" && s.wag.seq && s.wag.seq.open && !sawHalf1Seq) {
      sawHalf1Seq = true; await W.waitForTimeout(200);
      ok(await W.locator(".wseq .wopt").count() === 3, "during the first half a night out offers three choices, on the match screen");
      await W.screenshot({ path: SHOTS + "/04-sequence.png" });
      await W.locator(".wseq .wopt:not([disabled])").nth(1).click(); await W.waitForTimeout(300);
      const q = (await S(W)).wag.seq; ok(q.log.length === 1 && !q.log[0].auto, "choosing applies at once and the result is shown");
    }
    if (plan === "party" && (s.step === "md.half" || s.step === "md.half2") && s.wag.seq && s.wag.seq.open && s.wag.seq.beat === 1 && !sawBeat2) {
      sawBeat2 = true; ok(await W.locator(".wseq .wopt").count() === 3, "the second choice opens at half-time and stays open through the second half");
      await W.locator(".wseq .wopt:not([disabled])").last().click(); await W.waitForTimeout(300);
    }
    if (plan === "business+match" && ["md.half1", "md.half2"].includes(s.step) && !seen.has("quick")) { seen.add("quick"); ok(s.wag.seq === null && await W.locator(".wseq").count() === 0 && s.wag.attending, "at a match, business is the quick version: no match-time choices"); }
    if (plan === "content-idle" && s.step === "md.result" && s.wag.seq && !idleDone) { idleDone = true; ok(s.wag.seq.done && s.wag.seq.log.length === 2 && s.wag.seq.log.every((x) => x.auto), "choices left alone were made for the WAG before full time, so nothing waited for them"); }
    if (plan === "party" && s.step === "md.result" && s.wag.seq && !doneOnResult) { doneOnResult = true; ok(s.wag.seq.done && s.wag.seq.log.length === 2, "the party sequence is complete at full time"); await W.screenshot({ path: SHOTS + "/05-result.png" }); }
    if (s.step === "season.end") break;
  }
  ok(lineups >= 5, `the WAG went back to the menu with everyone else every matchday (${lineups} menus)`);
  ok(sawHalf1Seq && sawBeat2, "both choices were available live"); ok(overflow, "no horizontal overflow");
  ok(errs.length === 0, "no page errors or console errors" + (errs.length ? ": " + errs.slice(0, 4).join(" | ") : ""));
  await br.close(); srv.kill(); host.ws.close();
  const failed = res.filter((r) => !r[0]); console.log(`\n${res.length - failed.length}/${res.length} browser checks passed; shots in ${SHOTS}`); process.exit(failed.length ? 1 : 0);
  }
})();
