"""One-time: the detail layers for the full map page (roads, rivers, lakes, named mountain ranges and
other landforms), from Natural Earth 1:10m (public domain), trimmed to the Americas and simplified.
    python3 -I scripts/bigmap-detail.py <folder with ne_10m_roads.geojson, ne_10m_rivers_lake_centerlines.geojson,
                                         ne_10m_lakes.geojson, ne_10m_geography_regions_polys.geojson>
Writes seed/bigmap_detail.json. Lines and rings are [lat, lon] with 3 decimals."""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LON = (-172, -32); LAT = (-58, 73)          # the Americas
TOL = 0.015

def simplify(pts, tol):
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

def inside(pts):
    return any(LON[0] <= p[0] <= LON[1] and LAT[0] <= p[1] <= LAT[1] for p in pts[::max(1, len(pts)//20)])

def lines_of(geom):
    if geom["type"] == "LineString": return [geom["coordinates"]]
    if geom["type"] == "MultiLineString": return geom["coordinates"]
    return []
def rings_of(geom):
    if geom["type"] == "Polygon": return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon": return [poly[0] for poly in geom["coordinates"]]
    return []
def ll(pts): return [[round(lat, 3), round(lon, 3)] for lon, lat in pts]
def load(folder, name): return json.load(open(os.path.join(folder, name + ".geojson")))["features"]

def main():
    folder = sys.argv[1]
    roads = []
    for f in load(folder, "ne_10m_roads"):
        p = f["properties"]
        if p.get("continent") not in ("North America", "South America", "North America x-fade"): continue
        t = {"Major Highway": "M", "Secondary Highway": "S", "Beltway": "S"}.get(p.get("type"))   # the minor "Road" class is left out: too many for one file
        if not t: continue
        for line in lines_of(f["geometry"]):
            s = simplify(line, TOL)
            if len(s) >= 2 and inside(s): roads.append({"t": t, "p": ll(s)})
    rivers = []
    for f in load(folder, "ne_10m_rivers_lake_centerlines"):
        p = f["properties"]
        if (p.get("scalerank") or 0) > 8: continue
        for line in lines_of(f["geometry"]):
            s = simplify(line, TOL)
            if len(s) >= 2 and inside(s): rivers.append(ll(s))
    lakes = []
    for f in load(folder, "ne_10m_lakes"):
        for ring in rings_of(f["geometry"]):
            s = simplify(ring, TOL)
            if len(s) >= 4 and inside(s): lakes.append(ll(s))
    ranges = []
    keep = {"Range/mtn": "range", "Plateau": "plateau", "Desert": "desert", "Plain": "plain", "Basin": "basin", "Valley": "valley", "Lowland": "lowland", "Isthmus": "isthmus", "Peninsula": "peninsula", "Tundra": "tundra", "Depression": "basin"}
    for f in load(folder, "ne_10m_geography_regions_polys"):
        p = f["properties"]
        if p.get("REGION") not in ("North America", "South America"): continue
        kind = keep.get(p.get("FEATURECLA"))
        if not kind or not p.get("NAME"): continue
        rings = rings_of(f["geometry"])
        if not rings: continue
        big = max(rings, key=len)
        lon = sum(q[0] for q in big) / len(big); lat = sum(q[1] for q in big) / len(big)
        ranges.append({"n": p["NAME"], "k": kind, "lat": round(lat, 3), "lon": round(lon, 3), "r": p.get("SCALERANK") or 0})
    out = {"note": "Detail for the full map page: roads (t: M major, S secondary, R other), rivers, lakes and named landforms. Natural Earth 1:10m (public domain), Americas only, simplified to about 1 km. [lat, lon]. Built by scripts/bigmap-detail.py.",
           "roads": roads, "rivers": rivers, "lakes": lakes, "ranges": ranges}
    dst = os.path.join(ROOT, "seed", "bigmap_detail.json")
    json.dump(out, open(dst, "w"), separators=(",", ":"), ensure_ascii=False)
    pts = sum(len(r["p"]) for r in roads) + sum(len(r) for r in rivers) + sum(len(r) for r in lakes)
    print(f"{len(roads)} roads, {len(rivers)} rivers, {len(lakes)} lakes, {len(ranges)} landforms, {pts} points, {os.path.getsize(dst)//1024} KB -> {dst}")
main()
