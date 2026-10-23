# Football Draft Game

Browser multiplayer football (6v6) draft game. Same architecture as the Driver Draft Game: an authoritative Node server, WebSockets, a vanilla JS client and a pure, deterministic engine.

Status: milestone 1 (headless engine). `npm test` runs the invariant tests, `npm run sim` plays one season, and `node tests/t1_titles.js 200 20` checks title odds against the roster-strength targets. All tunable numbers live in `engine/params.js`.

Rebuild the player file: `python3 tools/build_players.py <xlsx> data/players.json`.
