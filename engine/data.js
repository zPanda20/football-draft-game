import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Loads the static data files. Rooms copy `players` into their own mutable records (ratings change with age).
export function loadData() {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (f) => JSON.parse(readFileSync(join(here, "..", "data", f), "utf8"));
  const D = { players: read("players.json"), items: read("items.json") };
  D.clubs = read("teams.json");
  try { D.rookies = read("rookies.json"); } catch (e) { D.rookies = []; }
  return D;
}
