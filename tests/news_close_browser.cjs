// Browser check: the close button on a news story really closes it (full banner and slim tabloid strip), the next story then shows,
// and a click on the banner body does nothing. Run: node tests/news_close_browser.cjs
const { createRequire } = require("module"); const req = createRequire(__dirname + "/../package.json");
const { spawn } = require("child_process"); const { mkdtempSync } = require("fs"); const os = require("os"); const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/npm-tools/node_modules/playwright");
const PORT = 5900 + Math.floor(Math.random() * 90);
const res = []; const ok = (c, m) => { res.push([!!c, m]); console.log((c ? "ok   " : "FAIL ") + m); };
(async () => {
  const srv = spawn("node", ["server/index.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT, DATA_DIR: mkdtempSync(path.join(os.tmpdir(), "fdg-")) } });
  try {
    await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("http://localhost") && r()));
    const br = await chromium.launch(), errs = [];
    for (const mini of [false, true]) {
      const ctx = await br.newContext({ viewport: { width: 1100, height: 800 } });
      await ctx.addInitScript((m) => { try { localStorage.setItem("fdg.name", "Tester"); localStorage.setItem("fdg.help", "1"); if (m) localStorage.setItem("fdg.tabmini", "1"); } catch (e) {} }, mini);
      const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(1200);
      // Feed the real banner code two stories (the same call the app makes on every state update).
      await p.evaluate(async () => { const L = await import("/life.js"), C = await import("/core.js"); if (!C.st.cat) C.st.cat = { art: {} }; const mk = (id, src, head) => ({ id, pub: 1e9 + id, kind: "troll", icon: "📰", src, head, sub: "Details inside.", name: "A. Player", club: "Test FC" });
        L.newsTick({ news: { top: 0, list: [] } }); L.newsTick({ news: { top: 0, list: [mk(1, "sun", "FIRST STORY"), mk(2, "tmz", "SECOND STORY")] } }); });
      const tag = mini ? "slim tabloid strip" : "full banner";
      await p.waitForSelector("#newsban.in", { timeout: 3000 });
      ok((await p.locator("#newsban").innerText()).includes("FIRST STORY") && (mini ? await p.locator("#newsban.mini").count() === 1 : true), tag + ": the first story is showing");
      await p.locator("#newsban").click({ position: { x: 300, y: 20 } }); await p.waitForTimeout(500);
      ok(await p.locator("#newsban.in").count() === 1 && (await p.locator("#newsban").innerText()).includes("FIRST STORY"), tag + ": clicking the story itself does not close it");
      await p.locator("#newsban .nb-x").click(); await p.waitForTimeout(900);
      ok((await p.locator("#newsban").count()) === 1 && (await p.locator("#newsban").innerText()).includes("SECOND STORY"), tag + ": the close button closes it and the next story comes up");
      await p.locator("#newsban .nb-x").click(); await p.waitForTimeout(900);
      ok(await p.locator("#newsban").count() === 0, tag + ": closing the last story removes the banner");
      await ctx.close();
    }
    ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
    await br.close();
  } catch (e) { ok(false, "exception " + (e && e.message)); } finally { srv.kill(); }
  const failed = res.filter((r) => !r[0]); console.log(`\n${res.length - failed.length}/${res.length} news close checks passed`); process.exit(failed.length ? 1 : 0);
})();
