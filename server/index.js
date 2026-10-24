import os from "node:os";
// HTTP + WebSocket server. Serves the browser app from /public and runs every room's game.
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadData } from "../engine/data.js";
import { Room } from "./room.js";
import { buildCatalog, clubsWithArt, listFaces, playerPics } from "./describe.js";
import { withParams } from "../engine/params.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const PUBLIC = join(ROOT, "public");
const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || join(ROOT, "saved");
const ROOMS_DIR = join(DATA_DIR, "rooms");
mkdirSync(ROOMS_DIR, { recursive: true });

const D = loadData();
const catalog = buildCatalog(D, withParams());
const rooms = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2" };

// ---------- rooms ----------
let dirty = new Set(), flushing = false;
function onChange(room) {
  dirty.add(room);
  if (flushing) return;
  flushing = true;
  setImmediate(() => {
    flushing = false;
    const todo = dirty; dirty = new Set();
    for (const r of todo) broadcast(r);
  });
}
function onSave(room, snap) {
  try { writeFileSync(join(ROOMS_DIR, `${room.code}.json`), JSON.stringify(snap)); } catch (e) { console.error("save failed", e.message); }
}
function broadcast(room) {
  for (const ws of room.sockets || []) send(ws, { t: "state", s: room.view(ws.watch ? null : ws.token) });
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function newCode() {
  for (;;) {
    let c = ""; for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}
function makeRoom(hostToken) {
  const room = new Room({ code: newCode(), D, hostToken, onChange, onSave });
  room.sockets = new Set(); rooms.set(room.code, room);
  return room;
}

// restore saved rooms (checkpoints from season boundaries)
for (const f of readdirSync(ROOMS_DIR)) {
  if (!f.endsWith(".json")) continue;
  try {
    const p = join(ROOMS_DIR, f);
    if (Date.now() - statSync(p).mtimeMs > 14 * 864e5) continue;
    const room = Room.restore(JSON.parse(readFileSync(p, "utf8")), { D, onChange, onSave });
    room.sockets = new Set(); rooms.set(room.code, room);
    console.log("restored room", room.code);
  } catch (e) { console.error("could not restore", f, e.message); }
}

// ---------- http ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/index.html";
  if (path === "/screen") path = "/index.html";
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end("Not found"); }
  const ext = extname(file);
  const cache = path.startsWith("/img/") || path.startsWith("/audio/") ? "public, max-age=600" : "no-cache";
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": cache });
  res.end(readFileSync(file));
});

// ---------- websocket ----------
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try { handle(ws, m); } catch (e) { console.error("handler error", e); send(ws, { t: "error", msg: "Something went wrong on the server." }); }
  });
  ws.on("close", () => {
    const room = ws.room; if (!room) return;
    room.sockets.delete(ws);
    if (!ws.watch) {
      const p = room.players.get(ws.token);
      if (p && ![...room.sockets].some((s) => s.token === ws.token && !s.watch)) { p.connected = false; room.changed(); }
    }
  });
});

function attach(ws, room, token, watch) {
  ws.room = room; ws.token = token; ws.watch = watch;
  room.sockets.add(ws);
  send(ws, { t: "hello", room: room.code, token, watch, catalog: { ...catalog, clubs: clubsWithArt(D.clubs, PUBLIC), faces: listFaces(PUBLIC), pics: playerPics(PUBLIC) }, now: Date.now() });
  room.kick();
  room.changed();
}

const CHOICES = new Set(["pick", "lock", "bid", "bidLock", "bidUnlock", "pass", "buy", "lineup", "lineupAuto", "items", "resign", "rookie", "tradeOffer", "tradeRespond", "tradeCancel", "ready", "auto", "continue", "offer", "offerWithdraw", "offerRespond", "card", "effort", "gift", "equipSelf", "act", "lifeBuy", "newsDecide", "redeem", "unlocks"]);
function handle(ws, m) {
  const tok = typeof m.token === "string" ? m.token.slice(0, 64) : null;
  switch (m.t) {
    case "create": {
      if (!tok) return;
      const room = makeRoom(tok);
      room.addPlayer(tok, m.name);
      return attach(ws, room, tok, false);
    }
    case "join": {
      const room = rooms.get(String(m.room || "").toUpperCase());
      if (!room || !tok) return send(ws, { t: "error", msg: "No room with that code." });
      const p = room.addPlayer(tok, m.name);
      if (!p) return send(ws, { t: "error", msg: "The game has already started. You can watch it from the big-screen view." });
      return attach(ws, room, tok, false);
    }
    case "watch": {
      const room = rooms.get(String(m.room || "").toUpperCase());
      if (!room) return send(ws, { t: "error", msg: "No room with that code." });
      return attach(ws, room, "watch-" + Math.random().toString(36).slice(2), true);
    }
  }
  const room = ws.room; if (!room || ws.watch) return;
  const t = ws.token;
  { // any click wakes an idle player; real choices also count as having acted in the open window
    const pl = room.players.get(t);
    if (pl) {
      if (pl.idle) room.wake(pl);
      if (CHOICES.has(m.t)) room.touch(pl);
    }
  }
  switch (m.t) {
    case "active": break; // sent by the browser on any click while idle; the wake-up above is all that is needed
    case "club": room.setClub(t, m.slug); break;
    case "mode": room.setMode(t, m.mode === "player" ? "player" : "manager"); break;
    case "roll": room.rollChar(t); break;
    case "char": room.setChar(t, m.c || {}); break;
    case "offer": room.makeOffer(t, m.pid | 0, m.len | 0); break;
    case "offerWithdraw": room.withdrawOffer(t, m.id | 0); break;
    case "offerRespond": room.respondOffer(t, m.id | 0, !!m.accept); break;
    case "card": room.answerCareer(t, m.n | 0, m.opt | 0); break;
    case "effort": room.setEffort(t, m.mode); break;
    case "redeem": room.redeem(t, String(m.code || "").slice(0, 60)); break;
    case "unlocks": room.setUnlocks(t, Array.isArray(m.ids) ? m.ids.slice(0, 40).map(String) : []); break;
    case "act": room.chooseActivity(t, m.act == null ? null : String(m.act), !!m.marry); break;
    case "lifeBuy": room.lifeBuy(t, String(m.id || "")); break;
    case "newsDecide": room.newsDecide(t, m.id | 0, !!m.yes); break;
    case "teamName": room.setTeamName(t, m.name); break;
    case "settings": room.setSettings(t, m.s || {}); break;
    case "pace": room.setPace(t, m.pace); break;
    case "speedVote": room.voteSpeed(t, m.dir); break;
    case "start": room.start(t); break;
    case "pick": room.pickCard(t, m.idx); break;
    case "lock": room.lockCard(t, m.on !== false); break;
    case "bid": room.placeBid(t, m.bid || {}, !!m.lock); break;
    case "bidLock": room.lockBid(t); break;
    case "bidUnlock": room.unlockBid(t); break;
    case "pass": room.marketPass(t); break;
    case "buy": room.buy(t, m.id); break;
    case "lineup": room.setLineup(t, m.lineup); break;
    case "lineupAuto": room.lineupAuto(t, m.formation); break;
    case "resign": room.resignPlayer(t, m.id | 0, m.len | 0); break;
    case "rookie": room.pickRookie(t, m.id | 0); break;
    case "tradeOffer": room.tradeOffer(t, m.to, m.give, m.get); break;
    case "tradeRespond": room.tradeRespond(t, m.id | 0, !!m.accept); break;
    case "tradeCancel": room.tradeCancel(t, m.id | 0); break;
    case "items": room.setActiveItems(t, m.ids, m.equip); break;
    case "gift": room.gift(t, m.id, m.pid | 0); break;
    case "equipSelf": room.equipSelf(t, m.ids); break;
    case "ready": room.setReady(t, m.on !== false); break;
    case "auto": room.setAuto(t, !!m.on); break;
    case "chat": room.addChat(t, m.text); break;
    case "continue": room.continueGame(t); break;
    case "skip": if (room.isHost(t)) room.skip(); break;
    case "pause": if (room.isHost(t)) room.pause(); break;
    case "resume": if (room.isHost(t)) room.resume(); break;
    default: return;
  }
  room.changed();
}

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  // forget rooms nobody has touched for a day
  for (const [c, r] of rooms) if (!r.sockets.size && Date.now() - (r.deadline || r.created) > 864e5 * 2 && r.phase === "lobby") rooms.delete(c);
}, 25000);

server.listen(PORT, () => {
  console.log(`Football Draft Game on http://localhost:${PORT}  (saves to ${DATA_DIR})`);
  try {
    for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === "IPv4" && !n.internal) console.log(`  Others on the same wifi: http://${n.address}:${PORT}`);
  } catch (e) {}
});
