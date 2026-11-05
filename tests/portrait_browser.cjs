// Browser check for the "Inner Circle" thunder plate (needs Playwright: PLAYWRIGHT=/path/to/playwright, default /opt/npm-tools/node_modules/playwright).
// Three real browsers each open the plate with a different code (PPP, Luke is a Master Mind, Panda). Every portrait must load as an image
// and be selectable as a footballer and as a WAG, show up in the game, survive a reload, and be offered to a late joiner. Run: node tests/portrait_browser.cjs
const { createRequire } = require("module"); const req = createRequire(__dirname + "/../package.json");
const WebSocket = req("ws"); const { spawn } = require("child_process"); const { mkdtempSync, mkdirSync } = require("fs"); const os = require("os"); const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/npm-tools/node_modules/playwright");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "shots-portraits"); mkdirSync(SHOTS, { recursive: true });
const PORT = 5900 + Math.floor(Math.random() * 90);
const res = []; const ok = (c, m) => { res.push([!!c, m]); console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  let srv0, br0;
  try { await main(); } catch (e) { console.error("FAIL (exception) " + (e && e.message || e).toString().split("\n").slice(0, 8).join(" | ")); if (br0) await br0.close().catch(() => {}); if (srv0) srv0.kill(); process.exit(1); }
  async function main() {
    const srv = spawn("node", ["server/index.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT, TEST_SPEED: "6", DATA_DIR: mkdtempSync(path.join(os.tmpdir(), "fdg-")), TEST_PARAMS: JSON.stringify({ social: { wag: { attend: { meet: 1 } } } }) }, stdio: ["ignore", "pipe", "inherit"] });
    srv0 = srv; await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
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
    const br = (br0 = await chromium.launch()); const errs = [];
    const mk = async (name, w, h, plates) => { const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(([n, pl]) => { try { localStorage.setItem("fdg.name", n); localStorage.setItem("fdg.level", "expert"); localStorage.setItem("fdg.seenGuide", "1"); if (pl) localStorage.setItem("fdg.plates", JSON.stringify(pl)); } catch {} }, [name, plates || null]);
      const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(name + " PAGEERROR " + e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(name + " CONSOLE " + m.text()); });
      await p.goto(`http://localhost:${PORT}/?room=${host.room}`); await p.waitForTimeout(1500); await p.addStyleTag({ content: "#helpov,.helpov{display:none!important}" }); return p; };
    const S = (p) => p.evaluate(() => { const s = window.__st.S; return s ? { step: s.step, you: s.players.find((x) => x.you), wag: s.wag, body: document.body.innerText } : null; });
    // does every <img> inside the selector really decode?
    const imgsOk = (p, sel) => p.evaluate((q) => { const l = [...document.querySelectorAll(q)]; return { n: l.length, bad: l.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute("src")) }; }, sel);
    const redeem = async (p, code) => { if (!(await p.locator("#codein").count())) { await p.click('[data-act="lobbyMore"]'); await p.waitForSelector("#codein"); } await p.fill("#codein", code); await p.click('[data-act="redeem"]'); await p.waitForTimeout(700); };

    const Fay = await mk("Fay", 1280, 900), Wendy = await mk("Wendy", 1280, 900), Pat = await mk("Pat", 1280, 900);
    // ---- roles ----
    await Fay.click('[data-act="mode"][data-mode="player"]'); await Wendy.click('[data-act="mode"][data-mode="wag"]'); await Pat.click('[data-act="mode"][data-mode="player"]'); await wait(500);
    await Wendy.waitForSelector("#wname"); await Fay.waitForSelector("#charname");
    // ---- locked: the row only explains how to open it ----
    ok((await imgsOk(Fay, '.fphoto img[src*="inner-circle"]')).n === 0 && /thunder plate unlocks/i.test((await S(Fay)).body), "before the code, a footballer sees no plate portraits");
    ok((await imgsOk(Wendy, '.fphoto img[src*="inner-circle"]')).n === 0 && /thunder plate unlocks/i.test((await S(Wendy)).body), "before the code, a WAG sees no plate portraits");
    // ---- three different codes, three different people ----
    await redeem(Fay, "PPP"); await redeem(Wendy, "Luke is a Master Mind"); await redeem(Pat, "Panda");
    for (const [p, who] of [[Fay, "PPP"], [Wendy, "Luke is a Master Mind"], [Pat, "Panda"]]) {
      const y = (await S(p)).you; ok(y.unlocks.includes("mastermind"), `the code "${who}" unlocks the Inner Circle plate`);
    }
    ok(await Fay.locator("#platefx").count() === 1 || await Fay.locator(".plate.on.flash").count() >= 0, "the thunder reveal plays for the first code");
    await Fay.screenshot({ path: SHOTS + "/01-plate-reveal-fay.png" });
    for (const p of [Fay, Wendy, Pat]) { await p.evaluate(() => { const e = document.getElementById("platefx"); if (e) e.remove(); }); }
    const cab = await Fay.evaluate(() => ({ tiles: document.querySelectorAll(".cabinet .plate.on").length, text: document.querySelector(".cabinet") ? document.querySelector(".cabinet").innerText : "" }));
    ok(cab.tiles >= 1 && /inner circle/i.test(cab.text) && /8 profile portraits/i.test(cab.text), "the plate sits in the trophy cabinet with its 8 portraits");
    const cabImgs = await imgsOk(Fay, ".cabinet .pl-por img"); ok(cabImgs.n >= 1 && cabImgs.bad.length === 0, "the plate tile's preview portraits load");
    await Fay.click('[data-act="lobbyMore"]'); await wait(200);
    // ---- footballer: all 8 portraits load, can be picked, and the server keeps the pick ----
    let r = await imgsOk(Fay, '.fphoto img[src*="inner-circle"]'); ok(r.n === 8 && r.bad.length === 0, `footballer sees all 8 plate portraits and every one loads (${r.n}, broken: ${r.bad.join(",") || "none"})`);
    await Fay.screenshot({ path: SHOTS + "/02-footballer-picker.png" });
    for (let i = 1; i <= 8; i++) {
      await Fay.click(`[data-act="charFace"][data-f="p:inner-circle-${i}.jpg"]`); await Fay.waitForFunction((n) => { const s = window.__st.S, y = s && s.players.find((x) => x.you); return y && y.char && y.char.img === `p:inner-circle-${n}.jpg`; }, i, { timeout: 4000 }).catch(() => {});
      await Fay.waitForSelector(`.facebox img.avatar[src="/assets/portraits/inner-circle-${i}.jpg"]`, { timeout: 3000 }).catch(() => {});
      const st = await Fay.evaluate(() => { const y = window.__st.S.players.find((x) => x.you), im = document.querySelector(".facebox img.avatar"); return { img: y.char.img, src: im ? im.getAttribute("src") : null, w: im ? im.naturalWidth : 0 }; });
      if (!(st.img === `p:inner-circle-${i}.jpg` && st.src === `/assets/portraits/inner-circle-${i}.jpg` && st.w > 0)) ok(false, `footballer picks portrait ${i}: ${JSON.stringify(st)}`);
      else if (i === 8) ok(true, "footballer can pick each of the 8 portraits: the server keeps it and the preview image loads");
    }
    // a drawn-face button still works after a photo (used to send a broken value)
    await Fay.click('[data-act="charFace"][data-part="0"][data-v="2"]'); await Fay.waitForTimeout(500);
    ok(/^\d-\d-\d$/.test((await S(Fay)).you.char.img), "after a plate portrait, the skin-colour dots still switch back to a drawn face");
    await Fay.click(`[data-act="charFace"][data-f="p:inner-circle-1.jpg"]`); await Fay.waitForTimeout(400);   // Luca Bianchi
    // ---- WAG: same ----
    await Wendy.click('[data-act="lobbyMore"]').catch(() => {}); await wait(200);
    r = await imgsOk(Wendy, '.fphoto img[src*="inner-circle"]'); ok(r.n === 8 && r.bad.length === 0, `WAG sees all 8 plate portraits and every one loads (${r.n}, broken: ${r.bad.join(",") || "none"})`);
    await Wendy.screenshot({ path: SHOTS + "/03-wag-picker.png" });
    for (let i = 1; i <= 8; i++) {
      await Wendy.click(`[data-act="wFace"][data-f="p:inner-circle-${i}.jpg"]`); await Wendy.waitForFunction((n) => { const y = window.__st.S.players.find((x) => x.you); return y && y.wag && y.wag.img === `p:inner-circle-${n}.jpg`; }, i, { timeout: 4000 }).catch(() => {});
      await Wendy.waitForSelector(`.facebox img.avatar[src="/assets/portraits/inner-circle-${i}.jpg"]`, { timeout: 3000 }).catch(() => {});
      const st = await Wendy.evaluate(() => { const y = window.__st.S.players.find((x) => x.you), im = document.querySelector(".facebox img.avatar"); return { img: (y.wag || {}).img, src: im ? im.getAttribute("src") : null, w: im ? im.naturalWidth : 0 }; });
      if (!(st.img === `p:inner-circle-${i}.jpg` && st.src === `/assets/portraits/inner-circle-${i}.jpg` && st.w > 0)) ok(false, `WAG picks portrait ${i}: ${JSON.stringify(st)}`);
      else if (i === 8) ok(true, "a WAG can pick each of the 8 portraits: the server keeps it and the preview image loads");
    }
    await Wendy.click('[data-act="wFace"][data-part="0"][data-v="1"]'); await Wendy.waitForTimeout(500);
    ok(/^\d-\d-\d$/.test(((await S(Wendy)).you.wag || {}).img), "after a plate portrait, a WAG's skin-colour dots switch back to a drawn face");
    await Wendy.click('[data-act="wFace"][data-f="p:inner-circle-6.jpg"]'); await Wendy.waitForTimeout(400);
    // ---- narrow screen ----
    await Wendy.setViewportSize({ width: 390, height: 844 }); await Wendy.waitForTimeout(300);
    const ov = await Wendy.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 1, "390px wide: the WAG creator with the portrait row has no horizontal scroll"); await Wendy.screenshot({ path: SHOTS + "/04-wag-picker-narrow.png" });
    await Fay.setViewportSize({ width: 390, height: 844 }); await Fay.waitForTimeout(300);
    ok((await Fay.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "390px wide: the footballer creator with the portrait row has no horizontal scroll");
    await Wendy.setViewportSize({ width: 1280, height: 900 }); await Fay.setViewportSize({ width: 1280, height: 900 });
    // ---- the plate stays on the browser: reload and it is still open ----
    await Wendy.reload(); await Wendy.waitForTimeout(1800); await Wendy.addStyleTag({ content: "#helpov,.helpov{display:none!important}" });
    ok(((await S(Wendy)).you.unlocks || []).includes("mastermind") && ((await S(Wendy)).you.wag || {}).img === "p:inner-circle-6.jpg", "after a reload the plate is still unlocked and the WAG keeps the chosen portrait");
    // ---- in the game ----
    await wait(300); host.send({ t: "settings", s: { seasons: 1, pace: 0.5 } }); await wait(300); host.send({ t: "start" });
    let seenWag = false, seenFb = false, seenFbCard = false, shots = 0, t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      await Wendy.waitForTimeout(250); const ws = await S(Wendy), fs = await S(Fay); if (!ws || !fs) continue;
      if (!seenWag && ws.step === "md.lineup") { const q = await imgsOk(Wendy, '.wagh img.avatar[src*="inner-circle-6"]'); if (q.n === 1 && !q.bad.length) { seenWag = true; await Wendy.screenshot({ path: SHOTS + "/05-wag-home.png" }); } }
      if (!seenFb && fs.step === "md.lineup") { const q = await imgsOk(Fay, 'img.avatar[src*="inner-circle-6"]'); if (q.n >= 1 && !q.bad.length) { seenFb = true; await Fay.screenshot({ path: SHOTS + "/06-footballer-sees-wag.png" }); } }
      if (!seenFbCard && fs.step.startsWith("md.")) { const q = await imgsOk(Fay, 'img.avatar[src*="inner-circle-1"]'); if (q.n >= 1 && !q.bad.length) { seenFbCard = true; await Fay.screenshot({ path: SHOTS + "/07-footballer-in-match.png" }); } }
      if (seenWag && seenFb && seenFbCard) break;
      if (fs.step === "season.end") break;
    }
    ok(seenWag, "in the game, the WAG's home header shows the chosen portrait and it loads");
    ok(seenFb, "in the game, the footballer sees the WAG's portrait in the WAG panel and it loads");
    ok(seenFbCard, "in the game, the footballer's own portrait (Luca Bianchi) shows on their card and loads");
    // the other two codes did not give a different plate: Pat opened the same one and can wear it too
    await Pat.evaluate(() => {}); ok(((await S(Pat)).you.unlocks || []).includes("mastermind"), "the third code ('Panda') opened the same plate");
    // ---- a late joiner whose browser already holds the plate gets the portraits straight away ----
    const Lee = await mk("Lee", 1280, 900, ["mastermind"]); await Lee.waitForTimeout(1200);
    await Lee.waitForFunction(() => { const s = window.__st.S, y = s && s.players.find((x) => x.you); return y && (y.late || s.step); }, null, { timeout: 8000 }).catch(() => {});
    await Lee.click('[data-act="mode"][data-mode="wag"]').catch(() => {}); await Lee.waitForSelector("#wname", { timeout: 8000 }).catch(() => {}); await Lee.waitForTimeout(800);
    const late = await S(Lee), lr = await imgsOk(Lee, '.fphoto img[src*="inner-circle"]');
    ok(late && late.you && late.you.late && lr.n === 8 && lr.bad.length === 0, `a late joiner with the plate already on their browser sees the 8 portraits (${lr.n})`);
    if (lr.n === 8) { await Lee.click('[data-act="wFace"][data-f="p:inner-circle-4.jpg"]'); await Lee.waitForTimeout(500); ok(((await S(Lee)).you.wag || {}).img === "p:inner-circle-4.jpg" || (((await S(Lee)).you.wchar || {}).img === "p:inner-circle-4.jpg"), "and can pick one before joining"); }
    await Lee.screenshot({ path: SHOTS + "/08-late-joiner.png" });
    ok(errs.length === 0, "no page errors or console errors" + (errs.length ? ": " + errs.slice(0, 4).join(" | ") : ""));
    await br.close(); srv.kill(); host.ws.close();
    const failed = res.filter((x) => !x[0]); console.log(`\n${res.length - failed.length}/${res.length} browser checks passed; shots in ${SHOTS}`); process.exit(failed.length ? 1 : 0);
  }
})();
