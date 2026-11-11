/* The full map page. One tall scroll: the view is pinned while the map moves under it. It opens on the
   whole route, zooms in on Deadhorse over the first stretch of the scroll, then follows the real planned
   route (the Komoot tracks, day by day) south to Ushuaia.

   Three layers, all in Web Mercator so they line up: a drawn base (land and the 18 countries' borders,
   always there), standard map tiles over it (roads, rivers, relief and towns come from the tile
   provider set in config home.map.tiles; blank = no tiles), and the route with its labels on top:
   every day's end, days off, segment starts, the highest point so far, where the ride is expected to
   be, and the tracker's last position when it is on. Two boxes: totals so far (top left) and the day
   under the middle of the screen (bottom left) with any secret stats earned that day. The day under
   the middle is highlighted (a persimmon halo, a dot at each end) and the map zooms out enough to show
   the whole of it. The controls work a segment at a time: segment pills, a day back or on, a slider
   across the segment, a day to type, and a place to ask about ("when will Andy be in ..."), which
   scrolls to the first day there (a place that is not on the plan is looked up, config home.map.geocoder,
   and answered with the closest the ride comes to it). A scroll cue shows while the map is zoomed all the way out. The
   browser's own scroll memory is switched off so the page always opens on the whole road. Dragging
   the map, pinching, ctrl+scroll or the − / + buttons look around freely (an offset and a zoom change
   on top of the scroll camera); scrolling again, or "Back to the route", drops them. Honours ?day=N.
   No dates. */
(function () {
  "use strict";
  var Trip = window.Trip, NS = "http://www.w3.org/2000/svg";
  var TILE = 256;
  // Web Mercator "world units": the whole world is 256 units wide at zoom 0
  function proj(lat, lon) {
    var la = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return [(lon + 180) / 360 * TILE, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * TILE];
  }
  function mk(name, attrs) { var e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function pathOf(points) { return points.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(4) + " " + q[1].toFixed(4); }).join(""); }
  function text(x, y, str, cls, anchor) { var t = mk("text", { x: x, y: y, "class": cls || "", "text-anchor": anchor || "start" }); t.textContent = str; return t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  var INTRO = 0.1;    // the first stretch of the scroll zooms in from the whole route
  var state = { ctx: null, zoom: 8.8, f: 0, u: 1, shapes: null, tracks: null, detail: null, cam: null, far: true, day: 1, statCache: {}, tiles: {}, tileZ: -1, lastCam: null, anchors: null, builtZoom: null, hiDay: 0, dayPaths: {}, free: null, lastF: -1 };
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";   // a reload or a return opens on the whole road, not wherever the scroll was

  // ---- the route as one line: the day tracks in order, straight lines where a day has none ----
  function buildCamPath(ctx) {
    var plan = ctx.plan, pts = ctx.dayPoints && ctx.dayPoints.days, tracks = state.tracks && state.tracks.days;
    var line = [], dayStart = [], dayEnd = [];
    plan.days.forEach(function (d) {
      var t = tracks && tracks[String(d.day)], p = pts && pts[String(d.day)];
      var seg = (t && t.length > 1) ? t : (p && p.start && p.end && d.kind === "ride" ? [[p.start.lat, p.start.lon], [p.end.lat, p.end.lon]] : []);
      dayStart[d.day] = line.length;
      seg.forEach(function (q) { line.push(q); });
      dayEnd[d.day] = line.length - 1;
    });
    if (line.length < 2 && ctx.route) line = ctx.route.points.slice();
    var cum = [0];
    for (var i = 1; i < line.length; i++) cum.push(cum[i - 1] + Trip.haversineMi(line[i - 1], line[i]));
    var total = cum[cum.length - 1] || 1;
    // fraction at which each day starts and ends (days with no line share their neighbours' point)
    var fStart = [], fEnd = [], last = 0;
    plan.days.forEach(function (d) {
      var s = dayStart[d.day], e = dayEnd[d.day];
      if (e >= s && s < line.length) { fStart[d.day] = cum[s] / total; fEnd[d.day] = cum[e] / total; last = fEnd[d.day]; }
      else { fStart[d.day] = last; fEnd[d.day] = last; }
    });
    state.cam = { line: line, cum: cum, total: total, fStart: fStart, fEnd: fEnd, dayStart: dayStart, dayEnd: dayEnd };
    state.anchors = null; state.dayPaths = {}; state.hiDay = 0;
  }
  function pointAt(g) {
    var c = state.cam, target = Math.max(0, Math.min(1, g)) * c.total, lo = 0, hi = c.cum.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (c.cum[mid] < target) lo = mid + 1; else hi = mid; }
    var i = Math.max(1, lo), a = c.line[i - 1], b = c.line[i], span = c.cum[i] - c.cum[i - 1] || 1, t = (target - c.cum[i - 1]) / span;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function dayAtG(g) {
    var plan = state.ctx.plan, n = 1;
    for (var d = 1; d <= plan.days.length; d++) { if (state.cam.fStart[d] <= g) n = d; else break; }
    return n;
  }
  function gOfDay(n) { var c = state.cam; return (c.fStart[n] + c.fEnd[n]) / 2; }
  function countryOfDay(countries, n) { var name = ""; (countries || []).forEach(function (c) { if (c.first_day <= n) name = c.country; }); return name; }
  function centroid(ring) { var x = 0, y = 0; ring.forEach(function (p) { var q = proj(p[0], p[1]); x += q[0]; y += q[1]; }); return [x / ring.length, y / ring.length]; }

  // ---- the drawn base: land and borders (what shows if tiles are off or slow) ----
  function buildBase(ctx) {
    var svg = document.getElementById("bigmap-base");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var fine = state.shapes, land = mk("g", { "class": "land" });
    var landRings = fine ? fine.land : (ctx.americas ? ctx.americas.shapes.map(function (s) { return s.ring.map(function (ll) { return [ll[1], ll[0]]; }); }) : []);
    landRings.forEach(function (ring) { land.appendChild(mk("path", { d: pathOf(ring) + "Z" })); });
    svg.appendChild(land);
    var countries = fine ? fine.countries : (ctx.outlines ? ctx.outlines.countries.map(function (co) { return { country: co.country, rings: co.rings.map(function (r) { return r.map(function (ll) { return [ll[1], ll[0]]; }); }) }; }) : []);
    var borders = mk("g", { "class": "borders" });
    countries.forEach(function (co) { co.rings.forEach(function (ring) { borders.appendChild(mk("path", { "class": "border", d: pathOf(ring) + "Z" })); }); });
    svg.appendChild(borders);
    if (!tilesOn() && state.detail) {                     // no tiles: the drawn roads, rivers and lakes
      var d = state.detail, g = mk("g", { "class": "detail" });
      g.appendChild(mk("path", { "class": "lake", d: (d.lakes || []).map(function (ring) { return pathOf(ring) + "Z"; }).join("") }));
      g.appendChild(mk("path", { "class": "river", d: (d.rivers || []).map(pathOf).join("") }));
      ["S", "M"].forEach(function (t) { g.appendChild(mk("path", { "class": "road " + t, d: (d.roads || []).filter(function (r) { return r.t === t; }).map(function (r) { return pathOf(r.p); }).join("") })); });
      svg.appendChild(g);
      var lf = mk("g", { "class": "landforms" });
      (d.ranges || []).forEach(function (r) { var q = proj(r.lat, r.lon); lf.appendChild(text(q[0], q[1], r.n, "landform", "middle")); });
      svg.appendChild(lf);
    }
    // country names: shown zoomed out, the big countries only (tiles name the rest up close).
    // They go on the top layer, since the tiles cover this one.
    state.names = [];
    countries.forEach(function (co) {
      var big = null; co.rings.forEach(function (ring) { if (!big || ring.length > big.length) big = ring; });
      if (!big) return;
      var xs = big.map(function (p) { return proj(p[0], p[1])[0]; }), ys = big.map(function (p) { return proj(p[0], p[1])[1]; });
      var size = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
      state.names.push({ q: centroid(big), name: co.country, small: size < 6 });   // under about 900 km across: named by the tiles up close instead
    });
  }

  // ---- the top layer: the route, the marks, the labels ----
  function build(ctx) {
    var svg = document.getElementById("bigmap"), c = ctx.config, plan = ctx.plan, M = c.copy.map || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!plan || !state.cam) return;
    var day = ctx.day, u = state.u, pts = ctx.dayPoints && ctx.dayPoints.days, tracks = state.tracks && state.tracks.days;
    var done = "", rest = "";
    plan.days.forEach(function (d) {
      var t = tracks && tracks[String(d.day)], p = pts && pts[String(d.day)];
      var seg = (t && t.length > 1) ? t : (p && p.start && p.end && d.kind === "ride" ? [[p.start.lat, p.start.lon], [p.end.lat, p.end.lon]] : null);
      if (!seg) return;
      if (d.day <= day) done += pathOf(seg); else rest += pathOf(seg);
    });
    if (!done && !rest && ctx.route) { var h = Trip.splitAtFraction(ctx.route.points, Trip.fractionAtDay(plan, day)); done = pathOf(h[0]); rest = pathOf(h[1]); }
    var names = mk("g", { "class": "names" });
    (state.names || []).forEach(function (nm) { names.appendChild(text(nm.q[0], nm.q[1], nm.name, "country-name" + (nm.small ? " small" : ""), "middle")); });
    svg.appendChild(names);
    svg.appendChild(mk("path", { "class": "route-casing", d: done + rest }));
    state.rest = mk("path", { "class": "route-rest", d: rest }); svg.appendChild(state.rest);
    svg.appendChild(mk("path", { "class": "route-done", d: done }));
    // the day under the middle of the screen: a halo behind its track, a dot at each end (camera() moves them)
    state.hiHalo = mk("path", { "class": "route-day-halo" }); svg.appendChild(state.hiHalo);
    state.hiPath = mk("path", { "class": "route-day" }); svg.appendChild(state.hiPath);
    state.hiDots = mk("g", { "class": "day-ends" }); svg.appendChild(state.hiDots);
    state.hiDay = 0;

    var marks = mk("g", { "class": "marks" }), labels = mk("g", { "class": "labels" });
    var lastRestPlace = "", lastSection = 0;
    plan.days.forEach(function (d) {
      var p = pts && pts[String(d.day)], e = p && (d.kind === "rest" ? (p.end || p.start) : p.end);
      if (!e) return;
      var q = proj(e.lat, e.lon);
      if (d.section !== lastSection) {
        lastSection = d.section;
        var st = p.start || e, qs = proj(st.lat, st.lon);
        marks.appendChild(mk("circle", { "class": "seg-dot", cx: qs[0], cy: qs[1], r: 3 * u }));
        labels.appendChild(text(qs[0] + 5 * u, qs[1] - 5 * u, (M.segment || "SEGMENT") + " " + d.section + " · " + (d.from || "") + " · DAY " + d.day, "seg-label"));
      }
      if (d.kind === "rest") {
        marks.appendChild(mk("circle", { "class": "rest-dot", cx: q[0], cy: q[1], r: 2.6 * u }));
        if (e.place !== lastRestPlace) { labels.appendChild(text(q[0] + 5 * u, q[1] + 4 * u, (e.place || d.to || "") + " · " + (M.restDay || "DAY OFF") + " · DAY " + d.day)); lastRestPlace = e.place; }
      } else marks.appendChild(mk("circle", { "class": "day-dot", cx: q[0], cy: q[1], r: 1.4 * u }));
    });
    svg.appendChild(marks); svg.appendChild(labels);

    var st2 = statsFor(day), hp = st2 && st2.highest && pts && pts[String(st2.highest.day)];
    if (hp && hp.end) {
      var qh = proj(hp.end.lat, hp.end.lon);
      svg.appendChild(mk("circle", { "class": "mile-dot", cx: qh[0], cy: qh[1], r: 3 * u }));
      labels.appendChild(text(qh[0] + 5.5 * u, qh[1] + 1 * u, (M.highest || "HIGHEST POINT") + " · " + Trip.fmtInt(Math.round(st2.highest.m * 3.28084)) + " FT · " + (st2.highest.place || "") + " · DAY " + st2.highest.day));
    }
    var dEnd = pts && pts[String(day)], exp = dEnd && dEnd.end ? [dEnd.end.lat, dEnd.end.lon] : pointAt(gOfDay(day));
    var qe = proj(exp[0], exp[1]), dd = Trip.day(plan, day);
    svg.appendChild(mk("circle", { "class": "pos-dot", cx: qe[0], cy: qe[1], r: 3.6 * u }));
    svg.appendChild(text(qe[0] + 6 * u, qe[1] - 5 * u, (ctx.live ? (M.expected || "EXPECTED TODAY") : "DAY " + day) + " · " + (dd.to || dd.from || ""), "pos-label"));
    var pos = ctx.data.position;
    if (ctx.live && ctx.ok("position") && pos && pos.available && pos.lat != null) {
      var qp = proj(pos.lat, pos.lon);
      svg.appendChild(mk("circle", { "class": "pos-ring", cx: qp[0], cy: qp[1], r: 3.6 * u }));   // live: pulses
      svg.appendChild(mk("circle", { "class": "pos-dot", cx: qp[0], cy: qp[1], r: 3.6 * u }));
      svg.appendChild(text(qp[0] + 6 * u, qp[1] + 9 * u, (M.actual || "LAST SEEN") + " · " + (pos.place || ""), "pos-label"));
    }
  }

  // ---- secret stats as of a day (memoised), and what a given day added ----
  function statsFor(n) {
    var ctx = state.ctx;
    if (!window.Stats || n < 1) return null;
    if (state.statCache[n] !== undefined) return state.statCache[n];
    try { state.statCache[n] = window.Stats.asOf(ctx.plan, ctx.config, n, ctx.data.calories, ctx.geo, ctx.countries, { rides: ctx.data.rides, geoLive: ctx.data.geoLive, weather: ctx.data.dayWeather }); }
    catch (e) { state.statCache[n] = null; }
    return state.statCache[n];
  }
  function eventsFor(n) {
    var ctx = state.ctx, E = (ctx.config.copy.map && ctx.config.copy.map.events) || {}, out = [], d = Trip.day(ctx.plan, n);
    (ctx.countries || []).forEach(function (c) { if (c.first_day === n && n > 1) out.push((E.borders || "CROSSED INTO") + " " + c.country); });
    if (d.kind === "rest") out.push(E.restDays || "DAY OFF");
    var a = statsFor(n), b = statsFor(n - 1);
    if (!a || !b) return out;
    function added(list) { return (a[list] || []).filter(function (x) { return (b[list] || []).indexOf(x) < 0; }); }
    added("volcanoNames").forEach(function (x) { out.push((E.volcanoes || "VOLCANO") + " · " + x); });
    added("waterNames").forEach(function (x) { out.push((E.waters || "SWAM IN") + " " + x); });
    added("parkNames").forEach(function (x) { out.push((E.parks || "NATIONAL PARK") + " · " + x); });
    added("capitalNames").forEach(function (x) { out.push((E.capitals || "CAPITAL CITY") + " · " + x); });
    if (a.boats > b.boats) out.push(E.boats || "BOAT CROSSING");
    if (a.hotSprings > b.hotSprings) out.push(E.hotSprings || "HOT SPRINGS");
    if (a.chains > b.chains) out.push(E.chains || "CHAIN WORN OUT");
    if (a.llamas > b.llamas) out.push((E.llamas || "LLAMAS") + " +" + (a.llamas - b.llamas));
    return out;
  }

  // ---- tiles ----
  function tilesOn() { var m = state.ctx.config.home.map || {}; return !!(m.tiles && /\{z\}/.test(m.tiles)); }
  function tileUrl(z, x, y) { var m = state.ctx.config.home.map; return m.tiles.replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{s}", "abc"[(x + y) % 3]); }
  function drawTiles(cx, cy, s, Wpx, Hpx, zoom) {
    var box = document.getElementById("bigmap-tiles");
    if (!tilesOn()) { box.hidden = true; return; }
    box.hidden = false;
    var m = state.ctx.config.home.map, zi = Math.max(2, Math.min(Number(m.tilesMaxZoom) || 16, Math.round(zoom)));
    var n = Math.pow(2, zi), tpx = TILE * s / n;               // a tile's size on screen
    var left = cx - Wpx / (2 * s), top = cy - Hpx / (2 * s);  // the view's top-left, in world units
    var x0 = Math.floor(left * n / TILE), x1 = Math.floor((left + Wpx / s) * n / TILE);
    var y0 = Math.max(0, Math.floor(top * n / TILE)), y1 = Math.min(n - 1, Math.floor((top + Hpx / s) * n / TILE));
    if (zi !== state.tileZ) { state.tileZ = zi; Object.keys(state.tiles).forEach(function (k) { state.tiles[k].remove(); }); state.tiles = {}; }
    var keep = {};
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) {
      var key = zi + "/" + x + "/" + y, img = state.tiles[key];
      if (!img) {
        img = document.createElement("img"); img.alt = ""; img.decoding = "async"; img.loading = "eager"; img.draggable = false;
        img.src = tileUrl(zi, ((x % n) + n) % n, y);
        img.addEventListener("load", function () { this.classList.add("in"); });
        box.appendChild(img); state.tiles[key] = img;
      }
      img.style.transform = "translate(" + ((x * TILE / n - left) * s).toFixed(2) + "px," + ((y * TILE / n - top) * s).toFixed(2) + "px)";
      img.style.width = img.style.height = (tpx + 0.5).toFixed(2) + "px";
      keep[key] = true;
    }
    Object.keys(state.tiles).forEach(function (k) { if (!keep[k]) { state.tiles[k].remove(); delete state.tiles[k]; } });
  }

  // ---- the camera: scroll fraction f -> centre and zoom ----
  function nearZoom() { var m = state.ctx.config.home.map || {}; return window.innerWidth < 640 ? (Number(m.zoomNearPhone) || 8.1) : (Number(m.zoomNear) || 8.6); }
  // how far out the map sits over a day: close enough to see the road, far enough to see the whole day.
  // Each ride day gets a zoom that fits its track (capped at zoomNear, floored a little under it); the
  // zoom runs smoothly from one day's to the next across the day boundaries.
  function dayFitZoom(n, Wpx, Hpx) {
    var c = state.cam, s = c.dayStart[n], e = c.dayEnd[n];
    if (!(e > s)) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = s; i <= e; i++) { var q = proj(c.line[i][0], c.line[i][1]); if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
    var pad = window.innerWidth < 640 ? 2.6 : 1.8;      // the boxes and controls cover part of a phone screen
    var w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
    return Math.log(Math.min(Wpx / (w * pad), Hpx / (h * pad))) / Math.LN2;
  }
  function buildAnchors(Wpx, Hpx) {
    var zN = nearZoom(), lo = zN - (Number((state.ctx.config.home.map || {}).zoomOutMax) || 1.8), c = state.cam, days = [];
    state.ctx.plan.days.forEach(function (d) {
      var z = dayFitZoom(d.day, Wpx, Hpx);
      if (z == null) return;
      days.push({ s: c.fStart[d.day], e: c.fEnd[d.day], z: Math.max(lo, Math.min(zN, z)) });
    });
    var a = [];
    days.forEach(function (d, i) {
      var prev = days[i - 1], next = days[i + 1];
      a.push({ g: d.s, z: prev ? (prev.z + d.z) / 2 : d.z });     // at the boundary: halfway between the two days
      a.push({ g: (d.s + d.e) / 2, z: d.z });                      // mid-day: the day's own zoom
      a.push({ g: d.e, z: next ? (next.z + d.z) / 2 : d.z });
    });
    state.anchors = a.length ? a : [{ g: 0, z: zN }, { g: 1, z: zN }];
  }
  function zoomAt(g, Wpx, Hpx) {
    if (!state.anchors) buildAnchors(Wpx, Hpx);
    var a = state.anchors, lo = 0, hi = a.length - 1;
    if (g <= a[0].g) return a[0].z;
    if (g >= a[hi].g) return a[hi].z;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (a[mid].g <= g) lo = mid; else hi = mid; }
    var span = a[hi].g - a[lo].g || 1, t = (g - a[lo].g) / span;
    return a[lo].z + (a[hi].z - a[lo].z) * t;
  }
  function dayPath(n) {
    if (state.dayPaths[n] === undefined) { var c = state.cam, s = c.dayStart[n], e = c.dayEnd[n]; state.dayPaths[n] = e > s ? pathOf(c.line.slice(s, e + 1)) : ""; }
    return state.dayPaths[n];
  }
  function highlightDay(n) {
    if (n === state.hiDay || !state.hiPath) return;
    state.hiDay = n;
    var d = dayPath(n), c = state.cam, s = c.dayStart[n], e = c.dayEnd[n];
    state.hiHalo.setAttribute("d", d); state.hiPath.setAttribute("d", d);
    while (state.hiDots.firstChild) state.hiDots.removeChild(state.hiDots.firstChild);
    if (e > s) [c.line[s], c.line[e]].forEach(function (p, i) { var q = proj(p[0], p[1]); state.hiDots.appendChild(mk("circle", { "class": "day-end " + (i ? "end" : "start"), cx: q[0], cy: q[1], r: 4 * state.u })); });
  }
  function routeBounds() {
    var c = state.cam, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < c.line.length; i += 3) { var q = proj(c.line[i][0], c.line[i][1]); if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }
  function camera(f) {
    var ctx = state.ctx, svg = document.getElementById("bigmap"), base = document.getElementById("bigmap-base"), r = svg.getBoundingClientRect();
    if (!state.cam || !r.width) return;
    state.f = f;
    var Wpx = r.width, Hpx = r.height, zN = nearZoom(), cx, cy, zoom, far = false;
    var start = proj(state.cam.line[0][0], state.cam.line[0][1]);
    if (f < INTRO) {
      var b = routeBounds(), zF = Math.log(Math.min(Wpx / (b.w * 1.15), Hpx / (b.h * 1.15))) / Math.LN2;
      var t = ease(f / INTRO);
      zoom = zF + (zN - zF) * t;
      cx = b.cx + (start[0] - b.cx) * t; cy = b.cy + (start[1] - b.cy) * t;
      far = zoom < zN - 1.2;
    } else {
      var g = (f - INTRO) / (1 - INTRO), pt = pointAt(g), q = proj(pt[0], pt[1]);
      cx = q[0]; cy = q[1]; zoom = zoomAt(g, Wpx, Hpx);
    }
    if (state.free) { zoom = Math.max(2, Math.min(17, zoom + state.free.dz)); cx += state.free.dx; cy += state.free.dy; far = zoom < zN - 1.2; }   // looking around
    state.view = { cx: cx, cy: cy, zoom: zoom, Wpx: Wpx, Hpx: Hpx };
    var s = Math.pow(2, zoom), W = Wpx / s, H = Hpx / s, u = 1 / s;
    // the marks and labels were drawn for one zoom; redraw them once the zoom has drifted (not while zoomed out, where they are hidden)
    if (!far && state.builtZoom != null && Math.abs(zoom - state.builtZoom) > 0.3) { state.u = u; state.builtZoom = zoom; build(ctx); }
    var vb = (cx - W / 2).toFixed(5) + " " + (cy - H / 2).toFixed(5) + " " + W.toFixed(5) + " " + H.toFixed(5);
    svg.setAttribute("viewBox", vb); base.setAttribute("viewBox", vb);
    svg.style.setProperty("--u", u); base.style.setProperty("--u", u);
    svg.classList.toggle("far", far); base.classList.toggle("far", far);
    if (state.rest) { state.rest.setAttribute("stroke-width", (2.8 * u).toFixed(5)); state.rest.setAttribute("stroke-dasharray", "0 " + (7 * u).toFixed(5)); }
    drawTiles(cx, cy, s, Wpx, Hpx, zoom);
    updateBoxes(f);
    highlightDay(state.day);
    var cue = document.getElementById("bigmap-cue"); if (cue) cue.hidden = !(f < INTRO * 0.6);
  }

  // ---- the two boxes and the controls ----
  function updateBoxes(f) {
    var ctx = state.ctx, plan = ctx.plan, el = ctx.el, M = ctx.config.copy.map || {};
    var totals = document.getElementById("bigmap-totals"), bar = document.getElementById("bigmap-bar");
    var intro = f < INTRO * 0.6, n = intro ? 1 : dayAtG((f - INTRO) / (1 - INTRO)), d = Trip.day(plan, n);
    state.day = n;
    totals.textContent = ""; bar.textContent = "";
    if (intro) {
      totals.appendChild(el("span", { class: "mono", text: M.whole || "THE WHOLE ROAD" }));
      totals.appendChild(el("b", { text: plan.days.length + " days · " + (ctx.countries || []).length + " countries" }));
      totals.appendChild(el("span", { class: "mono line", text: Trip.fmtInt(Math.round(plan.totals ? plan.totals.miles : Trip.totalMiles(plan))) + " " + (M.mi || "MI") + " · " + Trip.fmtInt(Math.round(plan.totals ? plan.totals.climb_ft : 0)) + " " + (M.ft || "FT CLIMBED") }));
      totals.hidden = false; bar.hidden = true;
    } else {
      totals.appendChild(el("span", { class: "mono", text: (M.soFarTitle || "SO FAR") + " · DAY " + n + " OF " + plan.days.length }));
      totals.appendChild(el("b", { text: Trip.fmtInt(Math.round(Trip.plannedMilesThrough(plan, n))) + " " + (M.mi || "MI").toLowerCase() }));
      totals.appendChild(el("span", { class: "mono line", text: Trip.fmtInt(Math.round(Trip.plannedClimbThrough(plan, n))) + " " + (M.ft || "FT CLIMBED") + " · " + Trip.countriesEntered(ctx.countries, n) + " OF " + (ctx.countries || []).length + " COUNTRIES" }));
      totals.hidden = false;
      bar.appendChild(el("span", { class: "mono", text: ((M.dayTitle || "THIS DAY") + " · SEGMENT " + d.section + " · " + countryOfDay(ctx.countries, n)).toUpperCase() }));
      var t = Trip.dayTitle(d), b = el("b"); b.appendChild(document.createTextNode("Day " + n + ": " + t.pre)); if (t.em) b.appendChild(el("em", { text: t.em }));
      bar.appendChild(b);
      if (d.plan_miles > 0) bar.appendChild(el("span", { class: "mono line", text: Math.round(d.plan_miles) + " MI PLANNED" + (d.plan_climb_ft > 0 ? " · " + Trip.fmtInt(d.plan_climb_ft) + " FT" : "") }));
      var ev = eventsFor(n);
      if (ev.length) bar.appendChild(el("div", { class: "events" }, ev.map(function (x) { return el("span", { text: x }); })));
      bar.hidden = false;
    }
    syncControls(n);
  }
  function segmentOf(n) { return Trip.day(state.ctx.plan, n).section; }
  function segmentRange(sec) { var days = state.ctx.plan.days.filter(function (d) { return d.section === sec; }); return { first: days[0].day, last: days[days.length - 1].day }; }
  function syncControls(n) {
    var s = document.getElementById("bigmap-slider"), l = document.getElementById("bigmap-slider-label"), M = state.ctx.config.copy.map || {};
    var sec = segmentOf(n), range = segmentRange(sec);
    if (s) { s.min = range.first; s.max = range.last; if (document.activeElement !== s) s.value = n; }
    if (l) l.textContent = (M.segment || "SEGMENT") + " " + sec + " · " + (M.slider || "DAY") + " " + n;
    document.querySelectorAll("#bigmap-segments button").forEach(function (b) { b.classList.toggle("active", Number(b.getAttribute("data-section")) === sec); });
    var controls = document.getElementById("bigmap-controls"), h = controls ? controls.offsetHeight + "px" : "";
    if (controls && h !== state.controlsH) { state.controlsH = h; controls.parentNode.style.setProperty("--controls-h", h); }   // phones: the day box sits above the controls
  }

  // ---- looking around: drag to pan, pinch / ctrl+scroll / buttons to zoom; a scroll puts the route camera back ----
  function setFree(dx, dy, dz) {
    state.free = { dx: dx, dy: dy, dz: dz };
    var bb = document.getElementById("bigmap-back-route"); if (bb) bb.hidden = false;
    camera(state.f);
  }
  function clearFree() {
    if (!state.free) return;
    state.free = null;
    var bb = document.getElementById("bigmap-back-route"); if (bb) bb.hidden = true;
    camera(state.f);
  }
  function zoomBy(dz, px, py) {                         // zoom around a screen point (defaults to the middle)
    var v = state.view; if (!v) return;
    var f = state.free || { dx: 0, dy: 0, dz: 0 }, s0 = Math.pow(2, v.zoom), z1 = Math.max(2, Math.min(17, v.zoom + dz)), s1 = Math.pow(2, z1);
    var ox = (px == null ? 0 : px - v.Wpx / 2), oy = (py == null ? 0 : py - v.Hpx / 2);
    var wx = v.cx + ox / s0, wy = v.cy + oy / s0;        // the world point under the cursor stays put
    var ncx = wx - ox / s1, ncy = wy - oy / s1;
    setFree(f.dx + (ncx - v.cx), f.dy + (ncy - v.cy), f.dz + (z1 - v.zoom));
  }
  function wireLook() {
    var view = document.querySelector(".bigmap-view"); if (!view) return;
    function onUI(e) { return e.target.closest && e.target.closest(".bigmap-controls, .bigmap-totals, .bigmap-bar, .bigmap-cue"); }
    view.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey) || onUI(e)) return;   // a plain scroll follows the route; ctrl+scroll (a trackpad pinch) zooms
      e.preventDefault();
      var r = view.getBoundingClientRect();
      zoomBy(-e.deltaY * 0.01, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    var pts = {}, pinch = null, dragged = false;
    view.addEventListener("pointerdown", function (e) {
      if (onUI(e) || (e.pointerType === "mouse" && e.button !== 0)) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; dragged = false;
      var ids = Object.keys(pts);
      if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.view ? state.view.zoom : 0 }; }
      view.setPointerCapture && view.setPointerCapture(e.pointerId);
      view.classList.add("dragging");
    });
    view.addEventListener("pointermove", function (e) {
      var p = pts[e.pointerId]; if (!p || !state.view) return;
      var ids = Object.keys(pts), s = Math.pow(2, state.view.zoom), f = state.free || { dx: 0, dy: 0, dz: 0 };
      if (ids.length >= 2 && pinch) {
        p.x = e.clientX; p.y = e.clientY;
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && pinch.d > 0) { var r = view.getBoundingClientRect(); zoomBy(Math.log(d / pinch.d) / Math.LN2 - (state.view.zoom - pinch.zoom), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
        return;
      }
      var mx = e.clientX - p.x, my = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (e.pointerType === "touch" && !state.free && Math.abs(my) > Math.abs(mx)) return;   // a finger moving up or down scrolls the page (touch-action pan-y)
      if (Math.abs(mx) + Math.abs(my) < 0.5) return;
      dragged = true;
      setFree(f.dx - mx / s, f.dy - my / s, f.dz);
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; if (!Object.keys(pts).length) view.classList.remove("dragging"); }
    view.addEventListener("pointerup", up); view.addEventListener("pointercancel", up);
    var zi = document.getElementById("bigmap-zoom-in"), zo = document.getElementById("bigmap-zoom-out"), bb = document.getElementById("bigmap-back-route");
    if (zi) zi.addEventListener("click", function () { zoomBy(0.7); });
    if (zo) zo.addEventListener("click", function () { zoomBy(-0.7); });
    if (bb) bb.addEventListener("click", clearFree);
  }

  function scrollFraction() {
    var box = document.getElementById("bigmap-scroll"), view = box.firstElementChild, span = box.offsetHeight - view.offsetHeight;
    return Math.max(0, Math.min(1, span > 0 ? -box.getBoundingClientRect().top / span : 0));
  }
  function scrollToFraction(f, smooth) {
    var box = document.getElementById("bigmap-scroll"), view = box.firstElementChild, span = box.offsetHeight - view.offsetHeight;
    var top = box.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: top + f * span, behavior: smooth ? "smooth" : "instant" });
  }
  function scrollToDay(n, smooth) { n = Trip.clampDay(state.ctx.plan, n); scrollToFraction(INTRO + (1 - INTRO) * gOfDay(n), smooth); }

  function resize() {
    state.anchors = null;
    state.u = 1 / Math.pow(2, nearZoom()); state.builtZoom = nearZoom();
    buildBase(state.ctx); build(state.ctx);
    camera(scrollFraction());
  }

  // ---- "When will Andy be in ...": every country and every place on the plan, with its first and last day ----
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function cleanName(s) { return String(s || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim(); }
  function placeIndex() {
    if (state.places) return state.places;
    var ctx = state.ctx, plan = ctx.plan, pts = ctx.dayPoints && ctx.dayPoints.days, idx = {}, order = [];
    function add(name, first, last, kind) {
      var k = norm(name); if (!k) return;
      if (!idx[k]) { idx[k] = { name: cleanName(name), first: first, last: last, kind: kind }; order.push(k); }
      else { if (first < idx[k].first) idx[k].first = first; if (last > idx[k].last) idx[k].last = last; }
    }
    var cs = (ctx.countries || []).slice().sort(function (a, b) { return a.first_day - b.first_day; });
    cs.forEach(function (c, i) { add(c.country, c.first_day, cs[i + 1] ? cs[i + 1].first_day - 1 : plan.days.length, "country"); });
    plan.days.forEach(function (d) {
      var p = pts && pts[String(d.day)];
      [d.from, d.to, p && p.start && p.start.place, p && p.end && p.end.place].forEach(function (nm) { if (nm) add(nm, d.day, d.day, "place"); });
    });
    state.places = { idx: idx, order: order };
    return state.places;
  }
  function findPlace(q) {
    var P = placeIndex(), k = norm(q); if (!k) return null;
    if (P.idx[k]) return P.idx[k];
    var starts = P.order.filter(function (o) { return o.indexOf(k) === 0; }), within = P.order.filter(function (o) { return o.indexOf(k) > 0 || o.indexOf(" " + k) >= 0; });
    var pool = starts.length ? starts : within;
    if (!pool.length) return null;
    pool.sort(function (a, b) { return (P.idx[a].kind === "country" ? 0 : 1) - (P.idx[b].kind === "country" ? 0 : 1) || a.length - b.length; });
    return P.idx[pool[0]];
  }
  function fill(tpl, vals) { return String(tpl || "").replace(/\{(\w+)\}/g, function (m, k) { return vals[k] != null ? vals[k] : m; }); }
  function wireAsk(ctx, M) {
    var form = document.getElementById("bigmap-ask"), input = document.getElementById("bigmap-place"), list = document.getElementById("bigmap-places"), out = document.getElementById("bigmap-answer");
    if (!form || !input) return;
    var P = placeIndex();
    P.order.forEach(function (k) { list.appendChild(ctx.el("option", { value: P.idx[k].name })); });
    if (window.innerWidth < 640 && (M.ask || "").trim()) input.placeholder = M.ask.trim() + " …";   // phones: the question is the placeholder (the label is hidden)
    function answer() {
      var hit = findPlace(input.value);
      out.hidden = false; out.classList.toggle("none", !hit);
      if (!hit) { lookup(input.value); return; }
      var n = hit.last - hit.first + 1, v = { place: hit.name, first: hit.first, last: hit.last, n: n };
      var txt = n > 1 ? fill(M.askAnswer || "{place}: day {first} to day {last} · {n} days", v) : fill(M.askAnswerOne || "{place}: day {first}", v);
      if (ctx.live) {                                   // how far off it is, in days (never a date)
        var away = hit.first - ctx.day;
        if (ctx.day >= hit.first && ctx.day <= hit.last) txt += " · " + (M.askNow || "there now");
        else if (away > 0) txt += " · " + fill(M.askFromNow || "{n} days from now", { n: away });
        else txt += " · " + fill(M.askPast || "{n} days ago", { n: -away });
      }
      out.textContent = txt;
      scrollToDay(hit.first, false); input.blur();
    }
    // a place that is not on the plan: look it up (config home.map.geocoder, blank = off) and answer
    // with the closest the ride comes to it, in miles, and on which day
    function lookup(q) {
      var tpl = (ctx.config.home.map || {}).geocoder || "";
      if (!tpl || !window.fetch) { out.textContent = M.askNone || "Not on the route."; return; }
      out.textContent = M.askLooking || "Looking that up…"; out.classList.add("none");
      fetch(tpl.replace("{q}", encodeURIComponent(q)), { headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
        var hit = res && res[0] && res[0].lat != null ? res[0] : null;
        if (!hit) { out.textContent = M.askNone || "Not on the route."; return; }
        var lat = Number(hit.lat), lon = Number(hit.lon), c = state.cam, best = Infinity, bi = 0;
        for (var i = 0; i < c.line.length; i += 2) { var dm = Trip.haversineMi([lat, lon], c.line[i]); if (dm < best) { best = dm; bi = i; } }
        var n = dayAtG(c.cum[bi] / c.total), d = Trip.day(ctx.plan, n), name = (hit.display_name || q).split(",")[0];
        var txt = fill(M.askNear || "{place} is not on the route. The closest the ride comes is day {first}, about {miles} miles away, near {near}", { place: name, first: n, miles: Trip.fmtInt(Math.round(best)), near: d.to || d.from || "" });
        if (ctx.live) { var away = n - ctx.day; txt += " · " + (away > 0 ? fill(M.askFromNow || "{n} days from now", { n: away }) : away === 0 ? (M.askNow || "today") : fill(M.askPast || "{n} days ago", { n: -away })); }
        out.classList.remove("none"); out.textContent = txt;
        scrollToDay(n, false); input.blur();
      }).catch(function () { out.textContent = M.askNone || "Not on the route."; });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); answer(); });
    input.addEventListener("change", function () { if (findPlace(input.value) && norm(input.value) in P.idx) answer(); });   // picking a name from the list
  }

  function quiet(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([window.Site.ready, quiet("data/bigmap_shapes.json"), quiet("data/route_tracks.json")]).then(function (loaded) {
    var ctx = loaded[0]; state.shapes = loaded[1] && loaded[1].land ? loaded[1] : null; state.tracks = loaded[2] && loaded[2].days ? loaded[2] : null;
    if (!ctx.config || !ctx.plan) { var m = document.querySelector("main"); if (m) m.hidden = true; return; }
    state.ctx = ctx;
    var c = ctx.config, M = c.copy.map || {}, mapCfg = c.home.map || {};
    buildCamPath(ctx);
    document.documentElement.style.setProperty("--map-screens", String(Math.max(6, Math.min(20, Number(mapCfg.screens) || 12))));
    document.getElementById("bigmap-tiles").classList.toggle("tint", mapCfg.tint !== false);
    // controls
    var controls = document.getElementById("bigmap-controls"), slider = document.getElementById("bigmap-slider"), segs = document.getElementById("bigmap-segments");
    var sections = []; ctx.plan.days.forEach(function (d) { if (sections.indexOf(d.section) < 0) sections.push(d.section); });
    var segLabel = document.getElementById("bigmap-seg-label"); if (segLabel && !(M.segmentsLabel || "").trim()) segLabel.hidden = true;
    sections.forEach(function (sec) {
      var b = ctx.el("button", { type: "button", class: "seg", "data-section": sec, text: String(sec), title: (M.segment || "SEGMENT") + " " + sec, "aria-label": (M.segment || "SEGMENT") + " " + sec });
      b.addEventListener("click", function () { scrollToDay(segmentRange(sec).first, true); });
      segs.appendChild(b);
    });
    controls.hidden = false;
    // phones: the day box sits just above the controls, however tall they are (the answer line grows them)
    if (window.ResizeObserver) new ResizeObserver(function () { controls.parentNode.style.setProperty("--controls-h", controls.offsetHeight + "px"); }).observe(controls);
    document.getElementById("bigmap-prev").addEventListener("click", function () { scrollToDay(state.day - 1, true); });
    document.getElementById("bigmap-next").addEventListener("click", function () { scrollToDay(state.day + 1, true); });
    slider.addEventListener("input", function () { scrollToDay(Number(slider.value), false); });
    var dayInput = document.getElementById("bigmap-day"); dayInput.max = ctx.plan.days.length;
    document.getElementById("bigmap-goto").addEventListener("submit", function (e) { e.preventDefault(); var n = Number(dayInput.value); if (n >= 1) { scrollToDay(n, false); dayInput.blur(); } });
    document.getElementById("bigmap-today").addEventListener("click", function () { scrollToDay(ctx.day, true); });
    document.getElementById("bigmap-top").addEventListener("click", function () { scrollToFraction(0, true); });
    var cue = document.getElementById("bigmap-cue"); if (cue) cue.addEventListener("click", function () { scrollToDay(1, true); });
    wireAsk(ctx, M);
    document.getElementById("bigmap-hint").textContent = (M.scrollHint || "SCROLL, OR USE THE BUTTONS AND THE SLIDER") + (tilesOn() && M.tiles ? " · " + M.tiles : "");
    resize();
    var viewBox = document.querySelector(".bigmap-view"); if (viewBox) viewBox.classList.add("drawn");   // fades the finished map in
    var ticking = false;
    window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; var f = scrollFraction(); if (state.free && Math.abs(f - state.lastF) > 0.0005) clearFree(); state.lastF = f; camera(f); }); }, { passive: true });
    wireLook();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
    if (ctx.params.has("day")) setTimeout(function () { scrollToDay(ctx.day, false); }, 300);
    else if (scrollFraction() > 0) scrollToFraction(0, false);   // whatever the browser remembered: open zoomed all the way out
    ctx.onChange(function () { state.places = null; });
    ctx.onChange(function () { state.statCache = {}; resize(); });
    if (!tilesOn()) quiet("data/bigmap_detail.json").then(function (d) { if (d && d.roads) { state.detail = d; resize(); } });
  });
})();
