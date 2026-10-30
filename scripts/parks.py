#!/usr/bin/env python3
"""One-time (rerun if the route changes): national park boundaries along the route corridor, from
OpenStreetMap through the Overpass API. Only true national parks are kept, by name: "National Park",
"Parque Nacional", "Parc national" (not provincial, state or regional parks, which OpenStreetMap
sometimes tags the same way). Writes seed/national_parks.json with simplified outer rings.

    python3 -I scripts/parks.py          (several minutes; Overpass is a shared free service)"""
import json, math, os, sys, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "noshortcuts.club site robot (hello@noshortcuts.club)"
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
NAME_OK = ("national park", "parque nacional", "parc national", "national park and preserve")
NAME_BAD = ("provincial", "state park", "regional", "municipal", "county", "territorial", "recreation area", "national forest", "wildlife", "ecological reserve")

import subprocess, tempfile
def overpass(q, tries=6):
    """Through curl: Python's own downloader has no root certificates on this Mac."""
    for i in range(tries):
        url = MIRRORS[i % len(MIRRORS)]
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f: f.write(q); qf = f.name
            r = subprocess.run(["curl", "-s", "--max-time", "200", "-A", UA, "--data-urlencode", f"data@{qf}", url], capture_output=True, text=True, timeout=220)
            os.unlink(qf)
            if r.returncode == 0 and r.stdout.strip().startswith("{"):
                j = json.loads(r.stdout)
                if "elements" in j: return j
            print("  overpass retry on another mirror:", url.split("/")[2], (r.stdout or r.stderr)[:60].replace("\n", " "), flush=True)
        except Exception as e:
            print("  overpass retry on another mirror:", url.split("/")[2], str(e)[:60], flush=True)
        time.sleep(10)
    return {"elements": []}

def tiles():
    pts = json.load(open(os.path.join(ROOT, "seed", "route_line.json")))["points"]
    bands = {}
    for lat, lon in pts:
        b = int(math.floor(lat / 4)) * 4
        lo, hi = bands.get(b, (lon, lon)); bands[b] = (min(lo, lon), max(hi, lon))
    return [(b, lo - 1.0, b + 4, hi + 1.0) for b, (lo, hi) in sorted(bands.items())]

def is_national_park(tags):
    n = (tags.get("name:en") or tags.get("name") or "").lower()
    d = (tags.get("designation") or tags.get("protection_title") or "").lower()
    text = n + " | " + d
    if any(b in text for b in NAME_BAD): return False
    return any(k in text for k in NAME_OK)

def chain(ways):
    """Join way coordinate lists into closed rings by matching endpoints."""
    ways = [list(w) for w in ways if len(w) > 1]
    rings = []
    while ways:
        ring = ways.pop()
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]: ring += w[1:]; ways.pop(i); changed = True; break
                if w[-1] == ring[-1]: ring += list(reversed(w))[1:]; ways.pop(i); changed = True; break
                if w[-1] == ring[0]: ring = w[:-1] + ring; ways.pop(i); changed = True; break
                if w[0] == ring[0]: ring = list(reversed(w))[:-1] + ring; ways.pop(i); changed = True; break
        if len(ring) > 3: rings.append(ring)
    return rings

def simplify(ring, tol):
    def dist(p, a, b):
        ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
        if dx == dy == 0: return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    def dp(pts):
        if len(pts) < 3: return pts
        a, b = pts[0], pts[-1]; idx, dmax = 0, 0
        for i in range(1, len(pts) - 1):
            d = dist(pts[i], a, b)
            if d > dmax: idx, dmax = i, d
        return dp(pts[:idx + 1])[:-1] + dp(pts[idx:]) if dmax > tol else [a, b]
    sys.setrecursionlimit(10000)
    return dp(ring)

def main():
    found = {}
    found_file = os.path.join(ROOT, "seed", "national_parks.found.json")
    if os.path.exists(found_file) and "--retile" not in sys.argv:
        for el in json.load(open(found_file)): found[(el["type"], el["id"])] = el
        print(len(found), "parks from the saved search; use --retile to search again", flush=True)
    for (s, w, n, e) in ([] if found else tiles()):
        q = f'[out:json][timeout:180];(relation["boundary"="national_park"]({s},{w},{n},{e});relation["boundary"="protected_area"]["protect_class"="2"]({s},{w},{n},{e});relation["leisure"="nature_reserve"]["protect_class"="2"]({s},{w},{n},{e});way["boundary"="national_park"]({s},{w},{n},{e}););out tags center;'
        res = overpass(q)
        hits = [el for el in res.get("elements", []) if is_national_park(el.get("tags", {}))]
        for el in hits: found[(el["type"], el["id"])] = el
        print(f"tile {s}..{n} lat, {w:.0f}..{e:.0f} lon: {len(res.get('elements', []))} tagged, {len(hits)} national parks", flush=True)
        time.sleep(3)
    json.dump(list(found.values()), open(found_file, "w"))
    print(len(found), "national parks along the corridor; fetching outlines", flush=True)
    out_file = os.path.join(ROOT, "seed", "national_parks.json")
    parks = json.load(open(out_file))["parks"] if os.path.exists(out_file) else []
    done_ids = {pk["osm"] for pk in parks}
    keys = [k for k in found if f"{k[0]}/{k[1]}" not in done_ids]
    print(len(parks), "outlines already saved;", len(keys), "to fetch", flush=True)
    for i in range(0, len(keys), 6):
        batch = keys[i:i + 6]
        rel_ids = [str(k[1]) for k in batch if k[0] == "relation"]; way_ids = [str(k[1]) for k in batch if k[0] == "way"]
        parts = []
        if rel_ids: parts.append(f"relation(id:{','.join(rel_ids)});")
        if way_ids: parts.append(f"way(id:{','.join(way_ids)});")
        res = overpass(f"[out:json][timeout:180];({''.join(parts)});out geom;")
        for el in res.get("elements", []):
            tags = el.get("tags", {})
            if el["type"] == "way": ways = [[(p["lon"], p["lat"]) for p in el.get("geometry", [])]]
            else: ways = [[(p["lon"], p["lat"]) for p in m.get("geometry", [])] for m in el.get("members", []) if m["type"] == "way" and m.get("role") in ("outer", "")]
            rings = [simplify(r, 0.003) for r in chain(ways)]
            rings = [[[round(x, 4), round(y, 4)] for x, y in r] for r in rings if len(r) > 3]
            if not rings: continue
            parks.append({"name": tags.get("name:en") or tags.get("name"), "country": tags.get("addr:country") or tags.get("is_in:country") or "", "osm": f"{el['type']}/{el['id']}", "rings": rings})
        json.dump({"note": "National parks along the route corridor from OpenStreetMap (ODbL), kept when named a National Park / Parque Nacional / Parc national. Simplified outer rings as [lon, lat]. Used to count parks entered.", "parks": parks}, open(out_file, "w"), separators=(",", ":"), ensure_ascii=False)
        print(f"  outlines saved: {len(parks)}", flush=True)
        time.sleep(4)
    parks.sort(key=lambda p: p["name"] or "")
    json.dump({"note": "National parks along the route corridor from OpenStreetMap (ODbL), kept when named a National Park / Parque Nacional / Parc national. Simplified outer rings as [lon, lat]. Used to count parks entered.", "parks": parks},
              open(os.path.join(ROOT, "seed", "national_parks.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    print("wrote", len(parks), "parks:", ", ".join(p["name"] for p in parks[:40]))

if __name__ == "__main__": main()
