#!/usr/bin/env python3
"""Writes data/rookies.json with PLACEHOLDER draft classes so the off-season can be tested.
Replace the file with your hand-made classes. Format: [{"class": 1, "players": [ {id, slug, name, gender, age, nat, club, pos, ovr, pac, sho, pas, dri, def, phy, sta, tier, pot} ]}]
pot is "low" | "med" | "high" (shown to managers; growth is drawn with noise). ids must be unique and >= 1000.
Usage: python3 tools/gen_placeholder_rookies.py [classes=7] [size=34] [from_class=1]  (from_class>1 appends and keeps the existing classes)"""
import json, random, sys
classes = int(sys.argv[1]) if len(sys.argv) > 1 else 7
size = int(sys.argv[2]) if len(sys.argv) > 2 else 34
rng = random.Random(2026)
from_class = int(sys.argv[3]) if len(sys.argv) > 3 else 1   # with 3 args, appends classes from_class..classes to the existing file
first = "Ade Bruno Caio Dario Elio Felix Gael Hugo Ivan Joao Kai Luca Mateo Nico Omar Pablo Quin Rafa Sami Theo Uri Vito Wes Yann Zane Amara Bea Chloe Dina Ella Freya Gia Hana Ines Jade Kira Lena Mila Nora Olga Pia Rosa Sofia Tara Uma Vera Wren Yara Zoe".split()
last = "Alves Baptiste Castro Duarte Esposito Fabri Garner Hallow Ibarra Jansen Keller Lombardi Moreau Novak Olsen Pereira Quiroga Rossi Santos Torres Ueda Vargas Weber Yilmaz Zielinski Adeyemi Brandt Costa Dumas Eriksen Fonseca Greco Holm".split()
nats = ["England", "France", "Spain", "Brazil", "Germany", "Portugal", "Netherlands", "Nigeria", "Argentina", "Italy", "United States", "Japan", "Ghana", "Belgium", "Morocco"]
poses = ["GK"] * 3 + ["CB"] * 4 + ["LB", "RB"] * 2 + ["CDM"] * 3 + ["CM"] * 4 + ["LM", "RM"] + ["CAM"] * 3 + ["LW", "RW"] * 2 + ["ST"] * 5
profile = {  # pac sho pas dri def phy
    "GK": (55, 40, 55, 50, 40, 60), "CB": (62, 40, 55, 52, 74, 74), "LB": (74, 50, 62, 66, 68, 66), "RB": (74, 50, 62, 66, 68, 66),
    "CDM": (62, 52, 70, 64, 72, 72), "CM": (66, 62, 72, 70, 62, 66), "LM": (76, 62, 68, 74, 50, 58), "RM": (76, 62, 68, 74, 50, 58),
    "CAM": (70, 70, 74, 76, 44, 56), "LW": (80, 66, 66, 78, 38, 56), "RW": (80, 66, 66, 78, 38, 56), "ST": (76, 76, 58, 70, 36, 70)}
import os
out = json.load(open('data/rookies.json')) if from_class > 1 and os.path.exists('data/rookies.json') else []
for c in range(from_class, classes + 1):
    if from_class > 1: rng = random.Random(2026 + c)
    ps = []
    for i in range(size):
        pos = poses[i % len(poses)] if i < len(poses) else rng.choice(poses)
        top = i < 3  # a few standouts per class
        ovr = rng.randint(76, 82) if top else rng.randint(62, 76)
        base = profile[pos]; delta = ovr - 68
        stats = [max(35, min(95, round(b + delta + rng.gauss(0, 4)))) for b in base]
        name = f"{rng.choice(first)} {rng.choice(last)}"
        pot = rng.choices(["low", "med", "high"], [3, 5, 3] if not top else [1, 4, 5])[0]
        ps.append({"id": 1000 * c + i, "slug": f"rookie-{c}-{i}", "name": name, "gender": rng.choice(["M", "F"]), "age": rng.randint(18, 20), "nat": rng.choice(nats), "club": "Academy",
                   "pos": pos, "ovr": ovr, "pac": stats[0], "sho": stats[1], "pas": stats[2], "dri": stats[3], "def": stats[4], "phy": stats[5], "sta": 80,
                   "tier": "silver", "pot": pot})
    out.append({"class": c, "placeholder": True, "players": ps})
json.dump(out, open("data/rookies.json", "w"), indent=0)
print(f"{classes} classes of {size} -> data/rookies.json")
