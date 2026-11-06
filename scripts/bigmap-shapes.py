"""One-time: the land and the 18 countries' borders for the full map page, from Natural Earth 1:50m
(public domain), trimmed to the Americas and simplified so the file stays small.
    python3 -I scripts/bigmap-shapes.py <path to ne_50m_admin_0_countries.geojson>
Writes seed/bigmap_shapes.json: { land: [ring, ...], countries: [{country, rings}] }, rings as [lat, lon]."""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRIP = {"United States of America": "United States", "Canada": "Canada", "Mexico": "Mexico", "Belize": "Belize", "Guatemala": "Guatemala",
        "El Salvador": "El Salvador", "Honduras": "Honduras", "Nicaragua": "Nicaragua", "Costa Rica": "Costa Rica", "Panama": "Panama",
        "Colombia": "Colombia", "Ecuador": "Ecuador", "Peru": "Peru", "Bolivia": "Bolivia", "Chile": "Chile", "Argentina": "Argentina",
        "Brazil": "Brazil", "Uruguay": "Uruguay"}
TOL = 0.02    # degrees: about 2 km

def simplify(pts, tol):
    # Douglas-Peucker on [lon, lat] pairs
    if len(pts) < 3: return pts
    def dist(p, a, b):
        dx, dy = b[0]-a[0], b[1]-a[1]
        if dx == dy == 0: return ((p[0]-a[0])**2 + (p[1]-a[1])**2) ** 0.5
        t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx+dy*dy)))
        return ((p[0]-a[0]-t*dx)**2 + (p[1]-a[1]-t*dy)**2) ** 0.5
    stack = [(0, len(pts)-1)]; keep = [False]*len(pts); keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        if j <= i+1: continue
        k, dmax = -1, 0
        for m in range(i+1, j):
            d = dist(pts[m], pts[i], pts[j])
            if d > dmax: k, dmax = m, d
        if dmax > tol:
            keep[k] = True; stack.append((i, k)); stack.append((k, j))
    return [p for p, k in zip(pts, keep) if k]

def rings_of(geom):
    if geom["type"] == "Polygon": return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon": return [poly[0] for poly in geom["coordinates"]]
    return []

def main():
    src = sys.argv[1]
    g = json.load(open(src))
    land, countries = [], []
    for f in g["features"]:
        p = f["properties"]
        if p.get("CONTINENT") not in ("North America", "South America"): continue
        if p.get("NAME") in ("Greenland",): continue
        rings = []
        for ring in rings_of(f["geometry"]):
            r = simplify(ring, TOL)
            if len(r) < 6: continue   # skips specks of islands
            rings.append([[round(lat, 3), round(lon, 3)] for lon, lat in r])
        land.extend(rings)
        name = TRIP.get(p.get("ADMIN")) or TRIP.get(p.get("NAME"))
        if name: countries.append({"country": name, "rings": rings})
    out = {"note": "Land of the Americas and the borders of the 18 trip countries for the full map page. Natural Earth 1:50m (public domain), simplified to about 1.3 km. Rings are [lat, lon]. Built by scripts/bigmap-shapes.py.",
           "land": land, "countries": countries}
    dst = os.path.join(ROOT, "seed", "bigmap_shapes.json")
    json.dump(out, open(dst, "w"), separators=(",", ":"))
    print(f"{len(land)} land rings, {len(countries)} trip countries, {sum(len(r) for r in land)} points, {os.path.getsize(dst)//1024} KB -> {dst}")
    missing = set(TRIP.values()) - {c['country'] for c in countries}
    if missing: print("missing countries:", missing)
main()
