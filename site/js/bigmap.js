/* The full map page. One tall scroll: the view is pinned while the map moves under it. It opens on the
   whole route, zooms in on Deadhorse over the first stretch of the scroll, then follows the real planned
   route (the Komoot tracks, day by day) south to Ushuaia.

   Three layers, all in Web Mercator so they line up: a drawn base (land and the 18 countries' borders,
   always there), standard map tiles over it (roads, rivers, relief and towns come from the tile
   provider set in config home.map.tiles; blank = no tiles), and the route with its labels on top:
   every day's end, days off, segment starts, the highest point so far, where the ride is expected to
   be, and the tracker's last position when it is on. Two boxes: totals so far (top left) and the day
   under the middle of the screen (bottom left) with any secret stats earned that day. The controls
   work a segment at a time: segment pills, a day back or on, a slider across the segment, and a day
   to type. Honours ?day=N. No dates. */
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
  var state = { ctx: null, zoom: 8.8, f: 0, u: 1, shapes: null, tracks: null, detail: null, cam: null, far: true, day: 1, statCache: {}, tiles: {}, tileZ: -1, lastCam: null };

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
    state.cam = { line: line, cum: cum, total: total, fStart: fStart, fEnd: fEnd };
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
  function nearZoom() { var m = state.ctx.config.home.map || {}; return window.innerWidth < 640 ? (Number(m.zoomNearPhone) || 8.2) : (Number(m.zoomNear) || 8.8); }
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
      cx = q[0]; cy = q[1]; zoom = zN;
    }
    var s = Math.pow(2, zoom), W = Wpx / s, H = Hpx / s, u = 1 / s;
    var vb = (cx - W / 2).toFixed(5) + " " + (cy - H / 2).toFixed(5) + " " + W.toFixed(5) + " " + H.toFixed(5);
    svg.setAttribute("viewBox", vb); base.setAttribute("viewBox", vb);
    svg.style.setProperty("--u", u); base.style.setProperty("--u", u);
    svg.classList.toggle("far", far); base.classList.toggle("far", far);
    if (state.rest) { state.rest.setAttribute("stroke-width", (2.8 * u).toFixed(5)); state.rest.setAttribute("stroke-dasharray", "0 " + (7 * u).toFixed(5)); }
    drawTiles(cx, cy, s, Wpx, Hpx, zoom);
    updateBoxes(f);
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
  }

  function scrollFraction() {
    var box = document.getElementById("bigmap-scroll"), top = box.offsetTop, span = box.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, span > 0 ? (window.scrollY - top) / span : 0));
  }
  function scrollToFraction(f, smooth) {
    var box = document.getElementById("bigmap-scroll"), span = box.offsetHeight - window.innerHeight;
    window.scrollTo({ top: box.offsetTop + f * span, behavior: smooth ? "smooth" : "auto" });
  }
  function scrollToDay(n, smooth) { n = Trip.clampDay(state.ctx.plan, n); scrollToFraction(INTRO + (1 - INTRO) * gOfDay(n), smooth); }

  function resize() {
    var svg = document.getElementById("bigmap"), r = svg.getBoundingClientRect();
    state.u = 1 / Math.pow(2, nearZoom());
    buildBase(state.ctx); build(state.ctx);
    camera(scrollFraction());
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
    sections.forEach(function (sec) {
      var b = ctx.el("button", { type: "button", class: "seg", "data-section": sec, text: String(sec), title: (M.segment || "SEGMENT") + " " + sec });
      b.addEventListener("click", function () { scrollToDay(segmentRange(sec).first, true); });
      segs.appendChild(b);
    });
    controls.hidden = false;
    document.getElementById("bigmap-prev").addEventListener("click", function () { scrollToDay(state.day - 1, true); });
    document.getElementById("bigmap-next").addEventListener("click", function () { scrollToDay(state.day + 1, true); });
    slider.addEventListener("input", function () { scrollToDay(Number(slider.value), false); });
    var dayInput = document.getElementById("bigmap-day"); dayInput.max = ctx.plan.days.length;
    document.getElementById("bigmap-goto").addEventListener("submit", function (e) { e.preventDefault(); var n = Number(dayInput.value); if (n >= 1) scrollToDay(n, true); });
    document.getElementById("bigmap-today").addEventListener("click", function () { scrollToDay(ctx.day, true); });
    document.getElementById("bigmap-top").addEventListener("click", function () { scrollToFraction(0, true); });
    document.getElementById("bigmap-hint").textContent = (M.scrollHint || "SCROLL, OR USE THE BUTTONS AND THE SLIDER") + (tilesOn() && M.tiles ? " · " + M.tiles : "");
    resize();
    var ticking = false;
    window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; camera(scrollFraction()); }); }, { passive: true });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
    if (ctx.params.has("day")) setTimeout(function () { scrollToDay(ctx.day, false); }, 300);
    ctx.onChange(function () { state.statCache = {}; resize(); });
    if (!tilesOn()) quiet("data/bigmap_detail.json").then(function (d) { if (d && d.roads) { state.detail = d; resize(); } });
  });
})();
