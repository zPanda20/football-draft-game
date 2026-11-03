#!/usr/bin/env python3
"""Draws the thunder-plate portraits (public/assets/portraits/*.svg): original storm-themed footballer busts.
Run: python3 tools/make_portraits.py   Each portrait belongs to a plate in data/unlocks.json (kind "portrait")."""
import os, math
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "portraits")
BOLT = "M0,-30 L-14,2 L-3,2 L-9,28 L14,-8 L3,-8 Z"   # a lightning bolt centred on 0,0

def bolt(x, y, s=1.0, rot=0, fill="#ffe75a", glow=True, op=1):
    f = ' filter="url(#glow)"' if glow else ""
    return f'<path d="{BOLT}" transform="translate({x},{y}) rotate({rot}) scale({s})" fill="{fill}" opacity="{op}"{f}/>'

def hair(style, col, hi):
    if style == "spike":      # spiky, bolt-shaped tufts
        return f'<g fill="{col}"><path d="M52,92 L44,52 L70,70 L76,36 L98,66 L112,30 L126,68 L150,40 L148,78 L162,70 L150,96 C140,70 60,70 52,92 Z"/></g><path d="M76,36 L98,66 L84,62 Z" fill="{hi}" opacity=".5"/>'
    if style == "slick":      # swept-back with a lightning parting
        return f'<g><path d="M50,98 C46,50 80,34 104,34 C140,34 158,58 152,98 C146,74 120,58 100,58 C78,58 56,74 50,98 Z" fill="{col}"/><path d="M96,40 L88,58 L98,58 L90,76" stroke="{hi}" stroke-width="4" fill="none" stroke-linejoin="round"/></g>'
    if style == "long":       # long storm-blown hair
        return f'<g fill="{col}"><path d="M44,150 C28,100 40,44 100,34 C160,44 172,100 156,150 C150,120 146,98 146,98 C140,70 60,70 54,98 C54,98 50,120 44,150 Z"/></g><path d="M60,60 C80,44 120,44 144,64" stroke="{hi}" stroke-width="3" fill="none" opacity=".55"/>'
    if style == "shaved":     # shaved, bolt shaved into the side
        return f'<g><path d="M52,96 C50,56 78,44 100,44 C124,44 150,56 148,96 C138,72 62,72 52,96 Z" fill="{col}" opacity=".55"/><path d="M124,52 L116,66 L124,66 L118,80" stroke="{hi}" stroke-width="4" fill="none" stroke-linejoin="round"/></g>'
    return ""

def portrait(name, bg, skin, skin_d, hairstyle, hcol, hhi, kit, kit2, eye, extra=""):
    b1, b2 = bg
    bolts = bolt(40, 54, .9, -20, "#fff6b0", True, .9) + bolt(166, 70, 1.15, 14, "#fff6b0", True, .85) + bolt(150, 150, .6, 30, "#ffe75a", True, .7)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="{name}">
<defs><radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="{b1}"/><stop offset="1" stop-color="{b2}"/></radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="kit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{kit}"/><stop offset="1" stop-color="{kit2}"/></linearGradient>
<clipPath id="c"><circle cx="100" cy="100" r="98"/></clipPath></defs>
<g clip-path="url(#c)"><rect width="200" height="200" fill="url(#bg)"/>
<g opacity=".35"><circle cx="100" cy="210" r="90" fill="#000"/></g>{bolts}
<path d="M18,205 C22,160 56,146 100,146 C144,146 178,160 182,205 Z" fill="url(#kit)"/>
<path d="M76,146 L100,170 L124,146 Z" fill="{skin_d}"/><path d="M76,146 L100,170 L124,146" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none"/>
<g transform="translate(100,186) scale(.55)">{bolt(0,0,1,0,"#ffe75a",False)}</g>
<rect x="86" y="118" width="28" height="34" rx="10" fill="{skin_d}"/>
{hair("long", hcol, hhi) if hairstyle == "long" else ""}
<ellipse cx="100" cy="98" rx="46" ry="54" fill="{skin}"/>
<ellipse cx="54" cy="102" rx="7" ry="12" fill="{skin}"/><ellipse cx="146" cy="102" rx="7" ry="12" fill="{skin}"/>
{hair(hairstyle, hcol, hhi) if hairstyle != "long" else ""}
<path d="M72,88 L90,92" stroke="{hcol}" stroke-width="5" stroke-linecap="round"/><path d="M128,88 L110,92" stroke="{hcol}" stroke-width="5" stroke-linecap="round"/>
<g filter="url(#glow)"><ellipse cx="80" cy="102" rx="8" ry="6" fill="{eye}"/><ellipse cx="120" cy="102" rx="8" ry="6" fill="{eye}"/></g>
<ellipse cx="80" cy="102" rx="3" ry="4.5" fill="#101820"/><ellipse cx="120" cy="102" rx="3" ry="4.5" fill="#101820"/>
<path d="M98,108 C96,120 94,124 100,126" stroke="{skin_d}" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M84,134 C96,142 108,140 118,130" stroke="#5b2a2a" stroke-width="4" fill="none" stroke-linecap="round"/>
{extra}</g>
<circle cx="100" cy="100" r="97" fill="none" stroke="{eye}" stroke-width="3" opacity=".85"/></svg>'''
    return svg

P = {
  "storm-king":    dict(name="Storm King", bg=("#3a2a7a", "#0b0820"), skin="#e8b48a", skin_d="#c98f66", hairstyle="spike", hcol="#f2f4ff", hhi="#9fd8ff", kit="#4c3ad0", kit2="#1d1458", eye="#7ad7ff"),
  "gold-flash":    dict(name="Gold Flash", bg=("#7a5a12", "#1a1204"), skin="#7a4a2e", skin_d="#5e3822", hairstyle="shaved", hcol="#1b1109", hhi="#ffd75a", kit="#e0a81b", kit2="#8a5a05", eye="#fff1a0"),
  "storm-chaser":  dict(name="Storm Chaser", bg=("#12445a", "#04141c"), skin="#f1c9a5", skin_d="#d3a37c", hairstyle="long", hcol="#2b6fa8", hhi="#bff0ff", kit="#1aa3b8", kit2="#0a4b5c", eye="#b9fff0"),
  "red-bolt":      dict(name="Red Bolt", bg=("#7a1020", "#1a0408"), skin="#a8663f", skin_d="#874c2b", hairstyle="slick", hcol="#220d0b", hhi="#ff6b6b", kit="#d8242f", kit2="#6a0c14", eye="#ffb08a"),
  "high-voltage":  dict(name="High Voltage", bg=("#1a5a2a", "#04140a"), skin="#c98f66", skin_d="#a8714c", hairstyle="spike", hcol="#39e08a", hhi="#d6ffe6", kit="#18a64a", kit2="#07401c", eye="#e5ff7a"),
  "night-surge":   dict(name="Night Surge", bg=("#2a2a3a", "#06060c"), skin="#3d2a22", skin_d="#2a1c16", hairstyle="slick", hcol="#ffffff", hhi="#c7d0ff", kit="#6b6f86", kit2="#22232e", eye="#ff8cf0"),
}
os.makedirs(OUT, exist_ok=True)
for k, v in P.items():
    open(os.path.join(OUT, k + ".svg"), "w").write(portrait(**v))
print("wrote", len(P), "portraits to", os.path.normpath(OUT))
