#!/usr/bin/env python3
"""One-time: geography for each day of the plan, for the secret stats.

For each day's start and end place (seed/day_points.json) it finds the nearest Holocene volcano
(Smithsonian Global Volcanism Program) and the nearest coastline or lake (Natural Earth 1:10m), and
writes anything within generous limits to seed/day_geo.json. The site applies the real thresholds
(config secretStats.volcanoMiles and waterMiles), so they can be tuned without rerunning this.

    python3 -I scripts/geo-stats.py <volcanoes.json> <ne_10m_coastline.geojson> <ne_10m_lakes.geojson>

Natural Earth coastlines are generalized to a few hundred metres, so distances under half a mile are
approximate. Only the public data files are read; nothing is downloaded here."""
import json, math, sys, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R_MI = 3958.8

def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    s = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R_MI * math.asin(min(1, math.sqrt(s)))

def seg_dist(p, a, b):
    """Point to segment, in miles, using a local flat approximation (fine for a few miles)."""
    k = math.cos(math.radians(p[0]))
    px, py = p[1] * k, p[0]; ax, ay = a[1] * k, a[0]; bx, by = b[1] * k, b[0]
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy) * 69.17  # degrees to miles

def ocean_name(lat, lon):
    if lat > 66: return "the Arctic Ocean"
    if 17.5 < lat < 31 and -98 < lon < -81: return "the Gulf of Mexico"
    if 8 < lat < 23 and -90 < lon < -59: return "the Caribbean Sea"
    if -56 < lat < 12 and lon > -82 and (lon > -70 or lat < -20): return "the Atlantic Ocean"
    if lat > 23 and lon > -82: return "the Atlantic Ocean"
    return "the Pacific Ocean"

def main(volc_file, coast_file, lakes_file):
    pts = json.load(open(os.path.join(ROOT, "seed", "day_points.json")))["days"]
    tracks_file = os.path.join(ROOT, "seed", "day_tracks.json")
    tracks = json.load(open(tracks_file))["days"] if os.path.exists(tracks_file) else {}
    parks_file = os.path.join(ROOT, "seed", "national_parks.json")
    parks = json.load(open(parks_file))["parks"] if os.path.exists(parks_file) else []
    def inside(lat, lon, ring):
        ok = False; j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi: ok = not ok
            j = i
        return ok
    for pk in parks:
        pk["_bb"] = [(min(x for x, y in r), min(y for x, y in r), max(x for x, y in r), max(y for x, y in r)) for r in pk["rings"]]
    def parks_entered(points):
        hits = []
        for pk in parks:
            for ring, bb in zip(pk["rings"], pk["_bb"]):
                if any(bb[0] <= p[1] <= bb[2] and bb[1] <= p[0] <= bb[3] and inside(p[0], p[1], ring) for p in points):
                    hits.append(pk["name"]); break
        return hits
    seen_parks = set()
    # Fallback altitude for days without a track: the cached elevations along the stylized route line,
    # between the day's start and end fractions. Coarse, so it is marked and never used as a record.
    plan = json.load(open(os.path.join(ROOT, "site", "data", "plan.json")))
    route_pts = json.load(open(os.path.join(ROOT, "seed", "route_line.json")))["points"]
    elev_file = os.path.join(ROOT, "seed", "route_elevation.json")
    elev = json.load(open(elev_file))["elevation_m"] if os.path.exists(elev_file) else None
    cum_mi = []; tot = 0.0
    for d in plan["days"]: tot += float(d.get("plan_miles") or 0); cum_mi.append(tot)
    line_cum = [0.0]
    for i in range(1, len(route_pts)): line_cum.append(line_cum[-1] + hav(route_pts[i - 1], route_pts[i]))
    def route_max_alt(day_no):
        if not elev or not tot: return None
        f0 = (cum_mi[day_no - 2] if day_no >= 2 else 0) / tot; f1 = cum_mi[day_no - 1] / tot
        a, b = f0 * line_cum[-1], f1 * line_cum[-1]
        vals = [elev[i] for i in range(len(route_pts)) if a - 10 <= line_cum[i] <= b + 10]
        return max(vals) if vals else None
    volcs = [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0], f["properties"]) for f in json.load(open(volc_file))["features"] if f.get("geometry")]
    # Segments, bucketed into 0.5 degree cells
    cell = lambda lat, lon: (int(math.floor(lat * 2)), int(math.floor(lon * 2)))
    grid = defaultdict(list)
    def add_line(coords, name, kind):
        for i in range(len(coords) - 1):
            a, b = coords[i], coords[i + 1]
            seg = ((a[1], a[0]), (b[1], b[0]), name, kind)
            for la in range(int(math.floor(min(a[1], b[1]) * 2)), int(math.floor(max(a[1], b[1]) * 2)) + 1):
                for lo in range(int(math.floor(min(a[0], b[0]) * 2)), int(math.floor(max(a[0], b[0]) * 2)) + 1):
                    grid[(la, lo)].append(seg)
    def walk(geom, name, kind):
        t = geom["type"]
        if t == "LineString": add_line(geom["coordinates"], name, kind)
        elif t == "MultiLineString":
            for c in geom["coordinates"]: add_line(c, name, kind)
        elif t == "Polygon":
            for ring in geom["coordinates"]: add_line(ring, name, kind)
        elif t == "MultiPolygon":
            for poly in geom["coordinates"]:
                for ring in poly: add_line(ring, name, kind)
    for f in json.load(open(coast_file))["features"]:
        if f.get("geometry"): walk(f["geometry"], None, "coast")
    for f in json.load(open(lakes_file))["features"]:
        if f.get("geometry"):
            p = f["properties"]
            if not (p.get("name") or p.get("name_alt")): continue       # unnamed ponds would be fake "dips"
            walk(f["geometry"], p.get("name") or p.get("name_alt"), "lake")
    print(f"{len(volcs)} volcanoes, {sum(len(v) for v in grid.values())} shoreline segments in {len(grid)} cells")

    def nearest_water(p):
        best = None
        c = cell(p[0], p[1])
        for dla in (-1, 0, 1):
            for dlo in (-1, 0, 1):
                for a, b, name, kind in grid.get((c[0] + dla, c[1] + dlo), ()):
                    d = seg_dist(p, a, b)
                    if best is None or d < best[0]: best = (d, name, kind)
        return best
    def nearest_volcano(p):
        best = None
        for la, lo, props in volcs:
            if abs(la - p[0]) > 0.5 or abs(lo - p[1]) > 0.6: continue
            d = hav(p, (la, lo))
            if best is None or d < best[0]: best = (d, props)
        return best

    out = {"note": "Per-day geography for the secret stats: nearest Holocene volcano (Smithsonian GVP) and nearest shoreline (Natural Earth 1:10m coastline and lakes) to any point of the day's planned track (Komoot), or to the day's start and end place when there is no track. Distances in miles; only hits within 15 mi (volcano) and 5 mi (water) are kept. Thresholds live in config.", "days": {}}
    for day, e in sorted(pts.items(), key=lambda kv: int(kv[0])):
        rec = {}
        # Every point of the day's real track when we have it (Komoot), else the start and end places
        if day in tracks:
            samples = [(p[0], p[1], "route") for p in tracks[day]["points"]]
            rec["from"] = "track"
        else:
            samples = [(e[w]["lat"], e[w]["lon"], w) for w in ("start", "end")]
            rec["from"] = "places"
        for lat, lon, which in samples:
            pt = (lat, lon)
            v = nearest_volcano(pt)
            if v and v[0] <= 15:
                cand = {"name": v[1]["Volcano_Name"], "dist_mi": round(v[0], 2), "elevation_m": v[1].get("Elevation"), "type": v[1].get("Primary_Volcano_Type"), "at": which}
                if "volcano" not in rec or cand["dist_mi"] < rec["volcano"]["dist_mi"]: rec["volcano"] = cand
            w = nearest_water(pt)
            if w and w[0] <= 5:
                name = w[1] if w[2] == "lake" else ocean_name(pt[0], pt[1])
                cand = {"name": name, "kind": "lake" if w[2] == "lake" else "sea", "dist_mi": round(w[0], 2), "at": which}
                if "water" not in rec or cand["dist_mi"] < rec["water"]["dist_mi"]: rec["water"] = cand
        if day in tracks:
            tr = tracks[day]
            if tr.get("max_alt_m") is not None: rec["max_alt_m"] = tr["max_alt_m"]; rec["alt_source"] = "track"
        else:
            ra = route_max_alt(int(day))
            if ra is not None: rec["max_alt_m"] = ra; rec["alt_source"] = "route"
        if day in tracks:
            tr = tracks[day]
            new_parks = [n for n in parks_entered(tr["points"]) if n not in seen_parks]
            if new_parks: rec["parks"] = new_parks; seen_parks.update(new_parks)
        if any(k in rec for k in ("volcano", "water", "parks", "max_alt_m")): out["days"][day] = rec
    json.dump(out, open(os.path.join(ROOT, "seed", "day_geo.json"), "w"), indent=1, ensure_ascii=False)
    v2 = {d["volcano"]["name"] for d in out["days"].values() if "volcano" in d and d["volcano"]["dist_mi"] <= 2}
    w25 = {d["water"]["name"] for d in out["days"].values() if "water" in d and d["water"]["dist_mi"] <= 0.25}
    print("national parks entered (plan):", sorted(seen_parks))
    print(f"days with data: {len(out['days'])}; volcanoes within 2 mi: {len(v2)} {sorted(v2)[:12]}; waters within 0.25 mi: {len(w25)} {sorted(w25)}")

if __name__ == "__main__":
    main(*sys.argv[1:4])
