"""Convert the EA FC / FM26 spreadsheet (Players Data sheet) into data/players.json.

usage: python3 tools/build_players.py <xlsx> data/players.json
STA is a placeholder (80 for everyone) until the real column exists: if the sheet has an STA column it is used.
"""
import sys, json, re, unicodedata
import pandas as pd

PLACEHOLDER_STA = 80

def slug(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def main(src, dst):
    df = pd.read_excel(src, sheet_name="Players Data")
    has_sta = "STA" in df.columns
    out, seen = [], set()
    for i, r in df.iterrows():
        sl = slug(r["Player"]); base = sl; k = 2
        while sl in seen: sl = f"{base}-{k}"; k += 1
        seen.add(sl)
        ovr = int(r["OVR"])
        out.append({
            "id": len(out), "slug": sl, "name": str(r["Player"]), "gender": str(r["Gender"]), "age": int(r["Age"]),
            "nat": str(r["Nationality"]), "club": str(r["Team"]), "pos": str(r["POS"]), "ovr": ovr,
            "pac": int(r["PAC"]), "sho": int(r["SHO"]), "pas": int(r["PAS"]), "dri": int(r["DRI"]), "def": int(r["DEF"]), "phy": int(r["PHY"]),
            "sta": int(r["STA"]) if has_sta else PLACEHOLDER_STA,
            "tier": "ruby" if ovr >= 90 else "gold" if ovr >= 85 else "silver",
        })
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=0)
    print(f"wrote {len(out)} players to {dst} (STA {'from sheet' if has_sta else 'placeholder ' + str(PLACEHOLDER_STA)})")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
