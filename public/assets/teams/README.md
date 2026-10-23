# Team art

One folder per club (the folder name is the club's `slug` in `data/teams.json`). Drop files in with these names:

| File | Used for |
|------|----------|
| `badge.png` | crest everywhere: tables, fixtures, club picker, and the small badge on player cards in the pack draft |
| `wallpaper.jpg` | page background while you manage (or pick) that club, lightly tinted |
| `kit-home.png` | home kit: lobby preview, line-up header, home side of the live match |
| `kit-away.png` | away kit: lobby preview, away side of the live match |
| `kit-third.png` | third kit: lobby preview |

`png`, `webp`, `svg`, `jpg` and `jpeg` all work. Transparent PNG or SVG is best for badges and kits. Reload the page after adding files; no restart needed.

A throwback or alt club (e.g. `juventus-throwback`) with no badge or wallpaper of its own borrows the main club's.
Player cards match on the real club name (see `aliases` in `data/teams.json`): a card for a player at Real Madrid shows the `real-madrid` badge.
Run `npm run assets` to see what is still missing.
