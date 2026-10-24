# Football Draft Game

Browser multiplayer 6-a-side football draft game, for a room full of laptops. Same architecture as the Driver Draft Game: one authoritative Node process, `ws` WebSockets, a vanilla JS client (no build step) and a pure, deterministic engine.

## Run it

```
npm install
npm start            # http://localhost:3000  (PORT and DATA_DIR are read from the environment)
```

Open the page, create a game, share the 4-letter code. `/screen?room=CODE` is the big-screen view with no controls.

## What is in it

- **Lobby**: up to 30 people. Each one either manages a club or plays as a footballer. Computer clubs fill the league to the minimum (always an even number; 17 to 19 become 20).
- **Pack draft**: 8 packs of 5, simultaneous picks, no overlapping hands, a headliner in every first pack, a dial that helps weaker rosters, a keeper guarantee.
- **Money**: 650 start coins, 45 base income per matchday plus a catch-up share for teams low in the table and +10 for a win or +5 for a draw (shown as a small animation after full time). Draft contracts run 3/3/2/2/2/1/1/1 years by pack round; re-signing your own player costs 75% of the normal fee.
- **Market**: a market-value lottery for free agents and items (offer at least market value times the contract multiplier, extra coins raise your tickets, only the winner pays).
- **Season**: round-robin, 3-1-0 table. Each match is two simulated halves with a half-time window for substitutions, formation and items. Live momentum and possession graphs, a results screen with every scorer and minute, a Golden Boot table, and an item store that is open between matches (with rare Steroids, and Ice Baths for post-match stamina).
- **Off-season**: retirements, ageing, re-signing, a one-round rookie draft (worst team first), a trade window, then free agency.
- **Player mode**: a person creates a footballer (rolled numbers, 81 to 86 overall), grows him with career cards, takes offers from managers and computer clubs, and chooses push or conserve at half-time.
- Idle and disconnected managers are handled (the room stops waiting for them), pace voting, pause and skip for the host, checkpoints saved to `DATA_DIR` and restored on restart.

## Layout

```
engine/    pure game rules (no I/O): params, roster/fit/ratings, match, fixtures, packs, market, bots,
           offseason (retire, age, re-sign, rookies), trade, playermode
server/    room state machine (room.js, offseason.js, usermode.js), WebSocket entry (index.js), static catalogue (describe.js)
public/    the browser client (app.js, draft.js, market.js, match.js, off.js, pm.js, core.js, style.css)
data/      players.json, rookies.json, items.json, teams.json
tests/     invariants (run_all.js), end-to-end over WebSockets (e2e.js, pm_e2e.js), balance simulations
tools/     build_players.py (spreadsheet to players.json), gen_placeholder_rookies.py
```

Team art (badge, wallpaper, home/away/third kits) is dropped into `public/assets/teams/<club>/`; see the README there, and `npm run assets` for what is missing.

Player portraits go in `public/assets/players/`, named after the player's `slug` in `data/players.json` (e.g. `kylian-mbappe.png`; png, webp, svg or jpg). A card shows the portrait in place of the initials; a transparent cutout of the head and shoulders works best, roughly square. Reload the page after adding files. Photos for footballers a person creates in the lobby are separate: those go in `public/assets/faces/`.

All tunable numbers live in `engine/params.js`. Balance tests change those, never the code.

## Tests and balance checks

```
npm test                         # fast invariant tests
npm run e2e                      # real server, WebSocket clients, two seasons incl. off-season and player mode
node tests/t1_titles.js 300 20   # title odds by roster strength (targets: strongest ~30%, top third ~70% in a 20-team league)
node tests/tank.js 100 10 3      # does losing season 1 on purpose pay?
node tests/seasons.js            # multi-season supply and strength drift
```

`TEST_SPEED=10` divides every server timer, which is how the end-to-end tests run a season in seconds.

## Data still to come

- Real STA column (every player is 80 for now), final rookie classes (the five in `data/rookies.json` are generated placeholders), card background textures, final item list.
- Rebuild the player file: `python3 tools/build_players.py <xlsx> data/players.json`.
