// The story around a match: rivals (cosmetic), the stakes line at kick-off, light live commentary, and the season recap.
import { st, esc, send, team, club, crest } from "./core.js";

// ---------- rivals ----------
export const rivalPairs = (S) => (S && S.rivalPairs) || [];
const pubOfTeam = (S, id) => { const p = S.players.find((x) => x.teamId === id); return p ? p.pub : null; };
// A footballer who fell out with a club online: that footballer's team and the club are rivals too.
function feudBetween(S, a, b) {
  return (S.feuds || []).some((f) => { const pt = (S.teams || []).find((t) => t.players && t.players.includes(f.pid)); return !!pt && pt.id !== f.team && ((pt.id === a && f.team === b) || (pt.id === b && f.team === a)); });
}
export function isRival(S, a, b) {
  if (a === b || a == null || b == null) return false;
  if (feudBetween(S, a, b)) return true;
  const pa = pubOfTeam(S, a), pb = pubOfTeam(S, b); if (!pa || !pb || pa === pb) return false;
  return rivalPairs(S).some(([x, y]) => (x === pa && y === pb) || (x === pb && y === pa));
}
// "Rival" button next to another person in the room (needs two or more people with a club)
export function rivalButton(S, p) {
  if (!S.players || p.you || p.mode === "player" || st.watch) return "";
  const you = S.players.find((x) => x.you); if (!you || you.mode === "player") return "";
  const on = rivalPairs(S).some(([x, y]) => (x === you.pub && y === p.pub) || (x === p.pub && y === you.pub));
  return `<button class="btn sm ${on ? "on" : ""}" data-act="rival" data-pub="${p.pub}" data-on="${on ? "0" : "1"}" title="Rivals get extra hype in their matches. Just for fun.">${on ? "🔥 Rival" : "Rival?"}</button>`;
}
export const storyHandlers = {
  rival(a) { send({ t: "rival", pub: a.pub, on: a.on === "1" }); },
};

// ---------- stakes line ----------
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][Math.min(n % 10, 4)] || "th");
export function stakesLines(S, m) {
  const out = [], T = S.table || [], pos = (id) => T.findIndex((r) => r.i === id) + 1, row = (id) => T.find((r) => r.i === id);
  const a = team(m.a), b = team(m.b); if (!a || !b || !T.length) return out;
  const pa = pos(m.a), pb = pos(m.b), ra = row(m.a), rb = row(m.b), played = ra ? ra.p : 0;
  const total = S.season ? S.season.total : 0, left = total ? total - played : 0, me = S.me ? S.me.teamId : -1;
  if (isRival(S, m.a, m.b)) out.push({ k: "rival", t: `Rivalry: ${a.owner || a.name} v ${b.owner || b.name}. Bragging rights are on the line.` });
  const ca = club(a), cb = club(b); if (ca && cb && ca.country && ca.country === cb.country && !out.length) out.push({ k: "derby", t: `A ${ca.country} derby.` });
  if (played >= 2) {
    const top = T[0], lead = T[0].pts - (T[1] ? T[1].pts : 0);
    if (Math.max(pa, pb) <= 2 && played >= 3) out.push({ k: "title", t: `Title clash: ${ord(Math.min(pa, pb))} v ${ord(Math.max(pa, pb))}, ${Math.abs(ra.pts - rb.pts)} point${Math.abs(ra.pts - rb.pts) === 1 ? "" : "s"} apart.` });
    else if (m.a === top.i || m.b === top.i) { const o = m.a === top.i ? b : a; out.push({ k: "leader", t: `League leaders ${team(top.i).name} (${top.pts} pts, ${lead} clear) meet ${o.name}.` }); }
    if (T.length >= 6 && pa > T.length - 3 && pb > T.length - 3) out.push({ k: "drop", t: `A bottom-of-the-table scrap: ${a.name} and ${b.name} both need the points.` });
    if (me === m.a || me === m.b) {
      const mine = me === m.a ? ra : rb, opp = me === m.a ? rb : ra, myPos = me === m.a ? pa : pb, leader = T[0];
      if (myPos > 1 && leader.i !== (me === m.a ? m.b : m.a) && mine.pts + 3 >= leader.pts + (leader.i === me ? 0 : 0) && mine.pts + 3 > leader.pts) out.push({ k: "you", t: `Win and you go top of the table.` });
      else if (myPos === 1 && opp && mine.pts + 3 > (T[1] ? T[1].pts : 0) + 6 && left > 0) out.push({ k: "you", t: `A win would put you ${mine.pts + 3 - (T[1] ? T[1].pts : 0)} points clear.` });
    }
  }
  if (left > 0 && left <= 3) out.push({ k: "late", t: left === 1 ? "The last matchday of the season." : `Only ${left} matchdays left.` });
  if (!out.length) out.push({ k: "plain", t: `Matchday ${(S.season ? S.season.day : 0) + 1}: ${a.name} v ${b.name}.` });
  return out.slice(0, 2);
}
export function stakesStrip(S, m) {
  const L = stakesLines(S, m); if (!L.length) return "";
  const rival = L.some((x) => x.k === "rival");
  return `<div class="stakes ${rival ? "rival" : ""}">${rival ? "🔥 " : ""}${L.map((x) => esc(x.t)).join(" ")}</div>`;
}

// ---------- commentary ----------
// One light line per flow reading (about every ten minutes), so the feed never sits empty before the first shot.
const TPL = {
  open: ["Kick-off! {h} get us under way.", "And we are off. {h} v {a}.", "The referee blows and {h} v {a} is live."],
  homeTop: ["{h} are on top and keeping the ball.", "{h} are pushing {a} back.", "Wave after wave from {h}."],
  awayTop: ["{a} have the upper hand now.", "{a} are keeping {h} pinned in.", "{a} are running the game for the moment."],
  even: ["It is end to end, nothing between them.", "A scrappy spell in midfield.", "Both sides are feeling each other out."],
  hot: ["Tempers are rising. Neither side will give an inch.", "The crowd can feel it: this is a rivalry match.", "Every tackle is fully committed."],
  late: ["Into the closing minutes now.", "The clock is running down.", "Time is ticking away."],
};
const pick = (arr, i) => arr[i % arr.length];
export function commentary(S, m, now, rival) {
  const h = team(m.a).name, a = team(m.b).name, out = [], f = (m.flow || []).filter((x) => x.minute - 4 <= now), sub = (s) => s.replace("{h}", h).replace("{a}", a);
  out.push({ minute: 1, text: sub(pick(TPL.open, m.a + m.b)) });
  f.forEach((x, i) => {
    if (i % 2 === 1 && x.minute > 5) return;
    const near = (m.all || m.events || []).some((e) => Math.abs(e.minute - x.minute) <= 2); if (near && i > 0) return;
    const pool = x.minute >= 80 ? TPL.late : rival && i % 2 === 0 ? TPL.hot : x.ph > 0.58 ? TPL.homeTop : x.ph < 0.42 ? TPL.awayTop : TPL.even;
    if (x.minute > 1) out.push({ minute: Math.round(x.minute), text: sub(pick(pool, i + m.a)) });
  });
  return out.filter((c) => c.minute <= now);
}

// ---------- season recap ----------
// Streaks and head-to-head from the season's results (v.sched.results = [day, a, b, ga, gb]).
export function recapCard(S) {
  const R = S.sched && S.sched.results; if (!R || !R.length || !S.table || !S.table.length) return "";
  const N = S.teams.length, runs = [...Array(N)].map(() => ({ win: 0, unb: 0, cw: 0, cu: 0 })), big = { d: 0 };
  const days = R.slice().sort((x, y) => x[0] - y[0]);
  for (const [, a, b, ga, gb] of days) {
    for (const [t, f, g] of [[a, ga, gb], [b, gb, ga]]) {
      const r = runs[t]; r.cw = f > g ? r.cw + 1 : 0; r.cu = f >= g ? r.cu + 1 : 0; r.win = Math.max(r.win, r.cw); r.unb = Math.max(r.unb, r.cu);
    }
    if (Math.abs(ga - gb) > big.d) big.d = Math.abs(ga - gb), big.m = [a, b, ga, gb];
  }
  const bestW = runs.map((r, i) => [i, r.win]).sort((x, y) => y[1] - x[1])[0], bestU = runs.map((r, i) => [i, r.unb]).sort((x, y) => y[1] - x[1])[0];
  const T = S.table, champ = T[0], gap = champ.pts - (T[1] ? T[1].pts : 0), me = S.me ? S.me.teamId : -1;
  const attack = T.slice().sort((x, y) => y.gf - x.gf)[0], defence = T.slice().sort((x, y) => x.ga - y.ga)[0];
  const lines = [];
  lines.push(`<b>${esc(team(champ.i).name)}</b> win the league on ${champ.pts} points${gap ? `, ${gap} clear of ${esc(team(T[1].i).name)}` : ""}.`);
  if (bestW[1] >= 3) lines.push(`Longest winning run: <b>${esc(team(bestW[0]).name)}</b>, ${bestW[1]} in a row.`);
  if (bestU[1] >= 5 && bestU[0] !== bestW[0]) lines.push(`Longest unbeaten run: <b>${esc(team(bestU[0]).name)}</b>, ${bestU[1]} matches.`);
  lines.push(`Best attack: <b>${esc(team(attack.i).name)}</b> (${attack.gf} goals). Best defence: <b>${esc(team(defence.i).name)}</b> (${defence.ga} against).`);
  if (big.m) lines.push(`Biggest win: ${esc(team(big.m[0]).name)} ${big.m[2]}–${big.m[3]} ${esc(team(big.m[1]).name)}.`);
  if (me >= 0) { const p = T.findIndex((r) => r.i === me) + 1; const r = T[p - 1]; lines.push(`You finished <b>${ord(p)}</b> of ${T.length} with ${r.pts} points (${r.w}W ${r.d}D ${r.l}L).`); }
  // rivalries: your results against marked rivals, and the biggest swing between two rival teams
  const rivs = [];
  for (const [x, y] of rivalPairs(S)) {
    const ta = S.players.find((p) => p.pub === x), tb = S.players.find((p) => p.pub === y); if (!ta || !tb || ta.teamId == null || tb.teamId == null) continue;
    let wa = 0, wb = 0, dr = 0, gA = 0, gB = 0;
    for (const [, a, b, ga, gb] of days) {
      if (a === ta.teamId && b === tb.teamId) { gA += ga; gB += gb; ga > gb ? wa++ : ga < gb ? wb++ : dr++; }
      else if (a === tb.teamId && b === ta.teamId) { gA += gb; gB += ga; gb > ga ? wa++ : gb < ga ? wb++ : dr++; }
    }
    if (wa + wb + dr) rivs.push(`🔥 <b>${esc(ta.name)}</b> v <b>${esc(tb.name)}</b>: ${wa}–${dr}–${wb} (goals ${gA}–${gB}). ${wa === wb ? "Honours even." : esc((wa > wb ? ta : tb).name) + " take the bragging rights."}`);
  }
  return `<div class="card recap"><h3>Season recap</h3><div class="row wrap" style="gap:10px;margin-bottom:6px">${crest(team(champ.i), 36)}<b style="font-size:20px">${esc(team(champ.i).name)}</b></div>${lines.map((l) => `<p class="small" style="margin:5px 0">${l}</p>`).join("")}${rivs.length ? `<div class="mt"><h3>Rivalries</h3>${rivs.map((l) => `<p class="small" style="margin:5px 0">${l}</p>`).join("")}</div>` : ""}</div>`;
}
