// Help: a "?" button on every screen that opens a start guide (a short walkthrough of the whole game), a "where am I" panel for the
// step you are on, the screens, the rules in numbers, the rookie draft, Lite v Full, and a FAQ. It lives outside the page that is
// redrawn every second, so reading it is never interrupted.
import { st, esc } from "./core.js";

const R = () => (st.cat && st.cat.rules) || {};
const money = () => { const r = R(); return { roster: r.rosterMax || 10, min: r.rosterMin || 6, packs: r.packs || 8 }; };

// ---------- the start guide ----------
const GUIDE = () => { const m = money(); return [
  { ic: "⚽", t: "What this game is", b: `Everyone in the room runs a football club (or plays as one footballer). You draft a squad, play a full league season against everybody else, then grow the squad through the off-season and go again. Top of the table at the end of a season wins it. After the last season the room sees a hall of champions.`, tip: "Matches play out by themselves. Your decisions happen between them." },
  { ic: "🚪", t: "The lobby", b: `Choose a club (the colours, kits and wallpaper come with it), name your team and choose how to play: <b>Full</b> gives you every screen and decision, <b>Lite</b> lets the club handle the details like a computer club would. You can change your mind at any time. The host sets the number of seasons and the pace, then presses Start. Computer clubs fill the league up to an even number.`, tip: "Not sure? Pick Lite for your first game and graduate to Full from the More screen when you are ready." },
  { ic: "🎴", t: "The pack draft", b: `${m.packs} rounds of packs. In each round everybody gets their own pack of five at the same time. Pick one card and press <b>Lock</b>; when everyone has locked (or the clock ends) all picks are revealed. A card is either a player or an item. Early picks get longer contracts, so deals run out at different times. Nobody pays coins in the draft.`, tip: "A good squad needs one goalkeeper, and a mix of defenders, midfielders and attackers." },
  { ic: "🪙", t: "The market", b: `Players nobody picked, and items, go to a lottery. Offer at least the market value times the contract multiplier (one season costs the least per season, three seasons the least per year). Extra coins buy extra tickets. Only the winner pays, so bidding on several things is safe. Clubs lower in the strength ranking get a small underdog bonus.`, tip: "Your coins also pay for re-signing, trades and the store. Do not spend all of them in round one." },
  { ic: "📋", t: "Your team page", b: `Before each matchday set your formation and your eleven (one keeper and five outfield players), then give items to the players who should wear them. Tired players play below their rating, so rest people on the bench. Press <b>Ready</b>; the match starts when everyone is ready or the clock ends.`, tip: "The Best XI button picks the strongest eleven for the formation you chose." },
  { ic: "🏟️", t: "Matchdays", b: `Each match is two halves with a half-time break. At the break you can swap players, change formation and use your substitution plan. Wins pay 10 extra coins and draws 5, on top of the income every club gets for every matchday (clubs lower in the table get more). After full time you see scorers, ratings, a Player of the Match, and the new table.`, tip: "The substitution plan can make half-time changes for you." },
  { ic: "📈", t: "Contracts and money", b: `Every player has a contract with seasons left. At the end of a contract he leaves unless you re-sign him (your own players cost 65% of the normal fee). The <b>Finance</b> screen shows what you will earn, what each expiring player costs, and how much you would have left. Squads hold ${m.min} to ${m.roster} players.`, tip: "Players age: young players tend to improve, older ones fade and eventually retire." },
  { ic: "🌱", t: "The off-season", b: `Between seasons: retirements, ageing, re-signing, the <b>rookie pack draft</b>, a trade window, then free agency. In the rookie draft the weakest club picks first: open a pack of three unseen rookies and keep one, take a leftover from an earlier pack, or abstain. See the Rookie draft tab for the full rules.`, tip: "Between seasons the History card shows the all-time table and every past season." },
  { ic: "👟", t: "Playing as a footballer", b: `Created footballers grow through weekly choices (train, date, party, rest), career cards, a wallet, boot deals and a following on social media. Managers can make you offers; you choose where to sign. You also open 3 item packs during the draft. At half-time you choose to push or conserve.`, tip: "Your fame brings news stories and, once you are big enough, the style magazines." },
  { ic: "🏁", t: "Ready to play", b: `That is everything. The <b>?</b> button is always at the top of the screen: it opens this guide, the rules in numbers, and answers to common questions. Good luck, manager.`, tip: "If you do nothing for a few seconds the Ready button starts to flash." },
]; };

// ---------- where am I: help for the step on screen ----------
const HERE = {
  lobby: ["The lobby", "Pick your club and your style (Full or Lite), name your team and wait for the host to start. The host chooses seasons and pace."],
  "draft.intro": ["Draft starting", "Packs are about to open. Everyone picks at the same time."],
  "draft.pick": ["Pack draft", "Tap a card, then press Lock. All locked picks are revealed together. Your contract length depends on the round."],
  "draft.reveal": ["Draft reveal", "These are the picks everybody made this round."],
  "market.bid": ["Market", "Choose a free agent or an item and make an offer of at least market value x contract multiplier. Extra coins add tickets. Only the winner pays. Press Lock, or Pass."],
  "market.reveal": ["Market results", "Who won what. Winners pay their offer; everyone else keeps their coins."],
  "season.intro": ["A new season", "Matchday 1 is next. Check the fixtures and the transfer window."],
  "md.lineup": ["Before the match", "Choose formation and eleven, give items, then press Ready. In Lite the club picks the eleven; you choose the formation."],
  "md.half1": ["First half", "The first half is playing. At half-time you get a window to make changes."],
  "md.half": ["Half-time", "Make changes: swap players, change formation. Your substitution plan may already have done some. Press Ready."],
  "md.half2": ["Second half", "The second half is playing."],
  "md.result": ["Full time", "Results, ratings and the table. Your coins arrive with a short animation."],
  "season.end": ["Season over", "Champions, awards, the final table, history of every past season and the Golden Boot."],
  "off.retire": ["Retirements", "Older players may retire. Some retire for sure."],
  "off.age": ["Development", "Everyone is a year older: young players tend to improve, older ones decline."],
  "off.resign": ["Re-signing", "Expiring contracts: re-sign at a fee (longer deals cost more) or let the player go to free agency. In Lite the club does this for you."],
  "off.resign.reveal": ["Re-signing results", "Who was re-signed and who goes to free agency."],
  "off.rookie.turn": ["Rookie pack draft", "Weakest club first. On your turn: open a pack (keep one of three), take a leftover from an opened pack, or abstain."],
  "off.rookie.reveal": ["Rookie results", "Who took whom. Unpicked rookies from opened packs join free agency; unopened rookies wait for next year."],
  "off.trade": ["Trade window", "Swap players, items and coins with other managers. Press 'I'm done trading' when finished."],
};
const TABS = [["guide", "Start guide"], ["here", "Where am I?"], ["screens", "Screens"], ["rules", "Rules in numbers"], ["rookie", "Rookie draft"], ["lite", "Lite v Full"], ["faq", "FAQ"]];

function tabGuide() {
  const G = GUIDE(), i = Math.max(0, Math.min(G.length - 1, st.ui.helpStep || 0)), s = G[i];
  return `<div class="gd"><div class="gd-ic">${s.ic}</div><div class="gd-n">Step ${i + 1} of ${G.length}</div><h2>${esc(s.t)}</h2><p>${s.b}</p><div class="gd-tip">💡 ${esc(s.tip)}</div></div>
    <div class="gd-nav"><button class="btn" data-act="helpStep" data-d="-1" ${i === 0 ? "disabled" : ""}>← Back</button><div class="gd-dots">${G.map((_, k) => `<i class="${k === i ? "on" : ""}" data-act="helpGo" data-i="${k}"></i>`).join("")}</div>${i === G.length - 1 ? `<button class="btn pri" data-act="helpClose">Let's play</button>` : `<button class="btn pri" data-act="helpStep" data-d="1">Next →</button>`}</div>`;
}
function tabHere() {
  const S = st.S, h = (S && HERE[S.step]) || ["This screen", "Use the guide for the big picture."];
  return `<div class="card"><h3>${esc(h[0])}</h3><p>${esc(h[1])}</p></div><p class="small mute mt">Press the <b>Start guide</b> tab for the whole game in ten short steps.</p>`;
}
function tabScreens() {
  const rows = [
    ["📋", "Team", "Formation, eleven, items and the substitution plan. Lite shows formation, a likely XI and hints."],
    ["🏆", "Standings", "League table, last matchday's results, leaders. Tap a team to see its likely line-up and schedule."],
    ["🛒", "Store", "Rare items appear in limited numbers. Boots add attack for one player, an ice bath restores stamina."],
    ["💰", "Finance", "Coins now, income to come, what every expiring player would cost, retirement risk."],
    ["📊", "Stats", "Every player's season: goals, assists, chances created, tackles, saves, ratings and awards."],
    ["🔁", "Transfers", "The in-season window: trade, drop and sign. Offers from others pop up as a window on any screen."],
    ["📰", "News", "The Daily Whistle: stories about created footballers, with papers and magazines such as The Sun, The Athletic, The Telegraph, L'Équipe, GQ, Harper's Bazaar and Vogue."],
    ["⋯", "More", "Lite only: every hidden screen, the switches, and Graduate to Full."],
    ["📜", "History", "Between seasons: the all-time table and every past season's final table."],
  ];
  return `<div class="col" style="gap:8px">${rows.map(([ic, n, t]) => `<div class="morerow"><span class="ic">${ic}</span><div><b>${n}</b><div class="small mute">${esc(t)}</div></div></div>`).join("")}</div>`;
}
function tabRules() {
  const r = R(), m = money(), lm = r.lenMult || { 1: 1, 2: 1.6, 3: 2.1 };
  const rows = [
    ["Starting coins", "800"], ["Squad size", `${m.min} to ${m.roster} players (1 keeper + 5 outfield in the XI)`], ["Draft", `${m.packs} rounds, 5 cards a pack, no coins spent; contracts 3,3,2,2,2,1,1,1 seasons by round`],
    ["Market offer", `at least market value x ${lm[1]} (1 season), x ${lm[2]} (2), x ${lm[3]} (3). Extra coins up to +${Math.round((r.extraCap || 2) * 100)}% buy tickets`],
    ["Income", "about 54 coins a matchday, up to 35% more for clubs at the bottom of the table; +10 for a win, +5 for a draw"], ["Table", "3 points a win, 1 a draw. Ties: goal difference, then goals scored"],
    ["Re-signing your own player", "65% of the normal fee"], ["Rookies", "3-season contract, no fee"], ["Retirement", "from 36 (20%), rising each year, certain at 40"],
    ["Items worn at once", `${r.playerItemCap ?? 2} for a created footballer; ${r.activeCap ?? "a few"} team items`], ["Transfer window", "open before matchdays 1 to 5"],
  ];
  return `<table class="tb"><tbody>${rows.map(([a, b]) => `<tr><td style="white-space:nowrap"><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join("")}</tbody></table><p class="tiny mute mt">Every number lives in one file (engine/params.js) and can be tuned.</p>`;
}
function tabRookie() {
  return `<div class="gd"><h2>The rookie pack draft</h2><ol class="steps">
    <li>The weakest club (the one that finished lowest) goes first. Each club gets one turn.</li>
    <li><b>Open a pack.</b> Three rookies nobody has seen are revealed to the whole room. You keep one. The other two become <b>leftovers</b> anyone can take later.</li>
    <li><b>Take a leftover.</b> Instead of opening a pack, you can pick any rookie already revealed in an earlier pack.</li>
    <li><b>Abstain.</b> You can take nobody. That is allowed even if rookies are left.</li>
    <li>The draft ends when every club has had a turn, or when every rookie has been revealed (then the rest simply choose from the leftovers).</li>
    <li>Leftovers nobody took join <b>free agency</b>. Rookies who were never in a pack wait for <b>next year's draft</b> and do not age in between.</li>
    <li>Rookies sign for 3 seasons with no fee. Their potential (low, medium or high) shows how much they tend to grow.</li></ol></div>`;
}
function tabLite() {
  return `<div class="gd"><h2>Lite or Full?</h2><p><b>Full</b> gives you every screen and every decision. <b>Lite</b> is not an easy mode: it plays like a computer club. The club picks the eleven for the formation you choose, makes the half-time changes, re-signs expiring players and sits out the trade window. There is no hidden bonus and no softer economy, so Full managers should win more often over time.</p>
    <p>Lite hides the finance tabs, the substitution plan, the trade and drop tabs and the stats table. The menu shrinks to Team, Standings, Store and Ready, with a checklist for your first matchday. Everything hidden is one tap away under <b>More</b>.</p>
    <p>Each person chooses for themselves, and anyone can flip a single switch, or press <b>Graduate to Full</b>, whenever they like. Lite and Full managers share a league.</p></div>`;
}
const FAQ = [
  ["Nothing is happening. What am I waiting for?", "The top bar says what is needed. The room waits for managers who still have a decision; idle managers (nobody clicking for a while) are skipped quickly."],
  ["What does Auto do?", "Auto hands your club to the computer: lineup, half-time and re-signing are decided the way a computer club decides. You can switch it off at any time."],
  ["Why is the Ready button flashing?", "You have not clicked anything for 10 seconds and the match cannot start until you are ready. It flashes harder in Lite mode."],
  ["Can I undo Ready?", "Yes, until the match starts. Tap the button again."],
  ["How do I know a player is tired?", "The bar under a card and the percentage show stamina. A tired player plays below his rating; the loss is shown in red."],
  ["What is potential?", "Rookies carry Low, Medium or High potential: how much they usually grow while young. A few future stars always have high potential."],
  ["Why can't I afford a re-sign?", "Longer deals cost more now and less per year. Check the Finance screen: it shows the cost of every expiring player and what you would have left."],
  ["What happens if I disconnect?", "The room carries on without you; your club plays as a computer club until you are back. Reopen the page with the same link."],
  ["How do I change the pace?", "Use the - and + next to the pace label in the top bar: everyone's vote counts. The host can also pause and skip."],
];
function tabFaq() { return `<div class="col" style="gap:6px">${FAQ.map(([q, a], i) => `<details ${i === 0 ? "open" : ""}><summary><b>${esc(q)}</b></summary><p class="small mute" style="margin:4px 0 0">${esc(a)}</p></details>`).join("")}</div>`; }

function body() {
  const t = st.ui.helpTab || "guide";
  return ({ guide: tabGuide, here: tabHere, screens: tabScreens, rules: tabRules, rookie: tabRookie, lite: tabLite, faq: tabFaq }[t] || tabGuide)();
}
export function drawHelp() {
  let ov = document.getElementById("helpov");
  if (!st.ui.helpOpen) { if (ov) ov.remove(); document.body.classList.remove("helping"); return; }
  if (!ov) {
    ov = document.createElement("div"); ov.id = "helpov"; document.body.appendChild(ov);
    ov.addEventListener("click", (e) => {                                  // the overlay sits outside #app, so it handles its own clicks
      if (e.target === ov) return helpHandlers.helpClose();                // a click on the dim backdrop closes it
      const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
      const f = helpHandlers[b.dataset.act]; if (f) { e.preventDefault(); f({ ...b.dataset }); }
    });
  }
  document.body.classList.add("helping");
  const t = st.ui.helpTab || "guide";
  ov.innerHTML = `<div class="help-card" role="dialog" aria-modal="true" aria-label="Help"><div class="help-head"><b>Help</b><span class="grow"></span><button class="btn sm" data-act="helpClose" aria-label="Close help">✕</button></div>
    <div class="help-tabs">${TABS.map(([k, n]) => `<button class="${t === k ? "on" : ""}" data-act="helpTab" data-k="${k}">${n}</button>`).join("")}</div><div class="help-body">${body()}</div></div>`;
}
export function helpButton() { return `<button class="btn sm helpbtn" data-act="helpOpen" title="Help and start guide" aria-label="Help">?</button>`; }
const seen = () => { try { return localStorage.getItem("fd_guide") === "1"; } catch { return true; } };
const mark = () => { try { localStorage.setItem("fd_guide", "1"); } catch {} };
export function maybeFirstGuide(S) { if (S && S.step === "lobby" && !st.watch && !seen() && !st.ui.helpAsked) { st.ui.helpAsked = true; st.ui.helpOpen = true; st.ui.helpTab = "guide"; st.ui.helpStep = 0; drawHelp(); } }
export const helpHandlers = {
  helpOpen() { st.ui.helpOpen = true; const S = st.S; if (!st.ui.helpTab) st.ui.helpTab = "guide"; drawHelp(); },
  helpClose() { st.ui.helpOpen = false; mark(); drawHelp(); },
  helpTab(a) { st.ui.helpTab = a.k; drawHelp(); },
  helpStep(a) { st.ui.helpStep = Math.max(0, Math.min(GUIDE().length - 1, (st.ui.helpStep || 0) + +a.d)); drawHelp(); },
  helpGo(a) { st.ui.helpStep = +a.i; drawHelp(); },
};
addEventListener("keydown", (e) => { if (e.key === "Escape" && st.ui.helpOpen) { st.ui.helpOpen = false; mark(); drawHelp(); } else if (st.ui.helpOpen && (st.ui.helpTab || "guide") === "guide" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) helpHandlers.helpStep({ d: e.key === "ArrowRight" ? 1 : -1 }); });
