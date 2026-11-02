// The main menu: a name window (Beginner or Expert) and then the options on the left over the wallpaper.
// Beginner = Glass look + the gentle Lite path. Expert = Synth look + every screen. Both can be changed later.
import { st, $, esc, store, toast, send } from "./core.js";
import { lookHandlers } from "./look.js";

export const level = () => { const v = store("level"); return v === "beginner" || v === "expert" ? v : null; };
let step = "name";

// The projector page (/screen) has no name to type: it goes straight to the menu.
export function menuReset() { step = st.watch ? "menu" : "name"; }

const WALL = { beginner: "/assets/menu/glass.jpg", expert: "/assets/menu/synth.jpg" };

function nameWindow() {
  const lv = level();
  return `<div class="menu" data-step="name">
    <div class="mw g" style="background-image:url(${WALL.beginner})"></div><div class="mw s" style="background-image:url(${WALL.expert})"></div><div class="mveil both"></div>
    <div class="nwin">
      <span class="logo"><b></b> Football Draft</span>
      <h1>Welcome</h1>
      <label for="nm">What should we call you?</label>
      <input id="nm" maxlength="24" placeholder="Your name" autocomplete="nickname" value="${esc(store("name") || "")}">
      <div class="lvls">
        <button class="lvl glass ${lv === "beginner" ? "was" : ""}" data-act="lvl" data-v="beginner"><b>Beginner</b><span>Guided, one step at a time</span></button>
        <button class="lvl synth ${lv === "expert" ? "was" : ""}" data-act="lvl" data-v="expert"><b>Expert</b><span>Every screen from the start</span></button>
      </div>
      <p class="tiny">You can change this later from the menu.</p>
    </div></div>`;
}

const tJoin = (sz) => `<div class="mt join ${sz}"><h2>Join a game</h2><p>Type the 4-letter code from your host.</p>
  <div class="mrow"><input class="big" id="jc" maxlength="4" placeholder="CODE" autocomplete="off" value="${esc(st.room || "")}"><button class="btn pri big" data-act="join">Join</button></div></div>`;
const tHost = (sz) => `<button class="mt host ${sz}" data-act="create"><h2>Host a game</h2><p>Start a room and share the code.</p><span class="go">Create game</span></button>`;
const tHow = (sz) => `<button class="mt how ${sz}" data-act="helpOpen"><h2>How to play</h2><p>A two-minute tour of the game.</p><span class="go">Show me</span></button>`;
const tScreen = (sz) => `<div class="mt scr ${sz}"><h2>Big-screen view</h2><p>For the projector. No controls.</p>
  <div class="mrow"><input id="wc" maxlength="4" placeholder="CODE" autocomplete="off"><button class="btn" data-act="watch">Watch</button></div></div>`;

function menuWindow() {
  const lv = level() || "expert", name = store("name") || "";
  const saved = store("room");
  const tiles = lv === "beginner"
    ? `${tJoin("xl")}${tHow("l")}<div class="mpair">${tHost("s")}${tScreen("s")}</div>`
    : `${tJoin("xl")}${tHost("l")}<div class="mpair">${tScreen("s")}${tHow("s")}</div>`;
  return `<div class="menu" data-step="menu" data-lv="${lv}">
    <div class="mw one" style="background-image:url(${WALL[lv]})"></div><div class="mveil"></div>
    <div class="mcol">
      <div class="mhead"><span class="logo"><b></b> Football Draft</span>
        ${name && !st.watch ? `<span class="who">Hi, <b>${esc(name)}</b><button class="lnk" data-act="menuName">Change name or level</button></span>` : ""}</div>
      ${saved && !st.watch ? `<div class="mrejoin"><span>Rejoin room <b class="code">${esc(saved)}</b></span><button class="btn sm pri" data-act="rejoin">Rejoin</button></div>` : ""}
      ${tiles}
    </div></div>`;
}

export function menuView() { return step === "name" ? nameWindow() : menuWindow(); }

// Beginners start every new room on the gentle Lite path (once per room, so a later switch to Full sticks).
export function levelDefault(S) {
  if (level() !== "beginner" || st.watch || !S || S.step !== "lobby") return;
  const y = S.players && S.players.find((p) => p.you); if (!y || y.mode === "player") return;
  if (store("lvlroom") === S.room) return;
  store("lvlroom", S.room);
  if (!y.lite) send({ t: "lite", all: false });
}

export const menuHandlers = {
  lvl(a) {
    const nm = (($("#nm") && $("#nm").value) || "").trim();
    if (!nm) { toast("Type your name first."); const i = $("#nm"); if (i) i.focus(); return; }
    store("name", nm.slice(0, 24)); store("level", a.v);
    lookHandlers.look({ v: a.v === "beginner" ? "glass" : "synth" });
    step = "menu"; st.landing && st.landing();
    const j = $("#jc"); if (j && st.room) j.focus();
  },
  menuName() { step = "name"; st.landing && st.landing(); const i = $("#nm"); if (i) { i.focus(); i.select(); } },
};
