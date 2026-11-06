/* The full map page. One tall scroll: the view is pinned while the map moves under it. It opens on the
   whole of the Americas, zooms in on Deadhorse over the first stretch of the scroll, then follows the
   route south to Ushuaia. Plain SVG from the site's data: land and the 18 countries' borders (the
   finer shapes when they load), roads, rivers, lakes and named landforms (loaded after the first
   paint), every day's end, days off, segment starts, the highest point so far, where the ride is
   expected to be, and the tracker's last position when it is on. The bar names the day under the
   middle of the screen with its miles and climb so far and any secret stats earned that day. Buttons
   and a slider move a day at a time for anyone who would rather not scroll. Honours ?day=N. No dates. */
(function () {
  "use strict";
  var Trip = window.Trip, NS = "http://www.w3.org/2000/svg";
  var COS = Math.cos(22 * Math.PI / 180);
  function proj(lat, lon) { return [(lon + 170) * COS * 10, (75 - lat) * 10]; }   // 1 unit ≈ 11 km
  function mk(name, attrs) { var e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function pathOf(points) { return points.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(2) + " " + q[1].toFixed(2); }).join(""); }
  function text(x, y, str, cls, anchor) { var t = mk("text", { x: x, y: y, "class": cls || "", "text-anchor": anchor || "start" }); t.textContent = str; return t; }

  var INTRO = 0.12;                                   // the first stretch of the scroll zooms in from the whole map
  var state = { ctx: null, W: 80, u: 1, f: 0, rest: null, shapes: null, detail: null, full: null, statCache: {}, day: 1 };
  function zoomUnits() { return window.innerWidth < 640 ? 52 : window.innerWidth < 1000 ? 66 : 80; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function countryOfDay(countries, n) { var name = ""; (countries || []).forEach(function (c) { if (c.first_day <= n) name = c.country; }); return name; }
  function centroid(ring) { var x = 0, y = 0; ring.forEach(function (p) { var q = proj(p[0], p[1]); x += q[0]; y += q[1]; }); return [x / ring.length, y / ring.length]; }

  function build(ctx) {
    var svg = document.getElementById("bigmap"), c = ctx.config, plan = ctx.plan, M = c.copy.map || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!ctx.route || !plan) return;
    var route = ctx.route.points, day = ctx.day, u = state.u;

    // land (the finer shapes when they loaded; else the home map's coarse ones, which are [lon, lat])
    var fine = state.shapes, land = mk("g", { "class": "land" });
    var landRings = fine ? fine.land : (ctx.americas ? ctx.americas.shapes.map(function (s) { return s.ring.map(function (ll) { return [ll[1], ll[0]]; }); }) : []);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    landRings.forEach(function (ring) {
      land.appendChild(mk("path", { d: pathOf(ring) + "Z" }));
      ring.forEach(function (p) { var q = proj(p[0], p[1]); if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; });
    });
    svg.appendChild(land);
    state.full = isFinite(minX) ? { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY } : null;
    svg.appendChild(mk("g", { "class": "detail" }));   // roads, rivers, lakes go here once loaded
    svg.appendChild(mk("g", { "class": "landforms" }));

    // borders and names of the 18 countries
    var countries = fine ? fine.countries : (ctx.outlines ? ctx.outlines.countries.map(function (co) { return { country: co.country, rings: co.rings.map(function (r) { return r.map(function (ll) { return [ll[1], ll[0]]; }); }) }; }) : []);
    var borders = mk("g", { "class": "borders" }), names = mk("g", { "class": "names" });
    countries.forEach(function (co) {
      var big = null;
      co.rings.forEach(function (ring) { borders.appendChild(mk("path", { "class": "border", d: pathOf(ring) + "Z" })); if (!big || ring.length > big.length) big = ring; });
      if (big) { var q = centroid(big); names.appendChild(text(q[0], q[1], co.country, "country-name", "middle")); }
    });
    svg.appendChild(borders); svg.appendChild(names);

    // the route: ridden so far solid, the rest as dots
    var halves = Trip.splitAtFraction(route, Trip.fractionAtDay(plan, day));
    state.rest = mk("path", { "class": "route-rest", d: pathOf(halves[1]) });
    svg.appendChild(state.rest);
    if (halves[0].length > 1) svg.appendChild(mk("path", { "class": "route-done", d: pathOf(halves[0]) }));

    // every day's end: a dot; days off: a ring and the place; segment starts: a label
    var pts = ctx.dayPoints && ctx.dayPoints.days, marks = mk("g", { "class": "marks" }), labels = mk("g", { "class": "labels" });
    var lastRestPlace = "", lastSection = 0;
    plan.days.forEach(function (d) {
      var p = pts && pts[String(d.day)], e = p && (d.kind === "rest" ? (p.end || p.start) : p.end);
      if (!e) return;
      var q = proj(e.lat, e.lon);
      if (d.section !== lastSection) {
        lastSection = d.section;
        var st = p.start || e, qs = proj(st.lat, st.lon);
        marks.appendChild(mk("circle", { "class": "seg-dot", cx: qs[0], cy: qs[1], r: 2.4 * u }));
        labels.appendChild(text(qs[0] + 4 * u, qs[1] - 4 * u, (M.segment || "SEGMENT") + " " + d.section + " · " + (d.from || "") + " · DAY " + d.day, "seg-label"));
      }
      if (d.kind === "rest") {
        marks.appendChild(mk("circle", { "class": "rest-dot", cx: q[0], cy: q[1], r: 2.2 * u }));
        if (e.place !== lastRestPlace) { labels.appendChild(text(q[0] + 4 * u, q[1] + 3.5 * u, (e.place || d.to || "") + " · " + (M.restDay || "DAY OFF") + " · DAY " + d.day)); lastRestPlace = e.place; }
      } else marks.appendChild(mk("circle", { "class": "day-dot", cx: q[0], cy: q[1], r: 1.1 * u }));
    });
    svg.appendChild(marks); svg.appendChild(labels);

    // milestone: the highest point so far (real tracks only, as in the secret stats)
    var st2 = statsFor(day);
    var hp = st2 && st2.highest && pts && pts[String(st2.highest.day)];
    if (hp && hp.end) {
      var qh = proj(hp.end.lat, hp.end.lon);
      svg.appendChild(mk("circle", { "class": "mile-dot", cx: qh[0], cy: qh[1], r: 2.6 * u }));
      labels.appendChild(text(qh[0] + 4.5 * u, qh[1] + 1 * u, (M.highest || "HIGHEST POINT") + " · " + Trip.fmtInt(Math.round(st2.highest.m * 3.28084)) + " FT · " + (st2.highest.place || "") + " · DAY " + st2.highest.day));
    }

    // where the ride should be on the day shown, and the tracker's last position (live only)
    var exp = Trip.pointAtFraction(route, Trip.fractionAtDay(plan, day)), dEnd = pts && pts[String(day)];
    if (dEnd && dEnd.end) exp = [dEnd.end.lat, dEnd.end.lon];
    var qe = proj(exp[0], exp[1]), dd = Trip.day(plan, day);
    svg.appendChild(mk("circle", { "class": "pos-dot", cx: qe[0], cy: qe[1], r: 3.2 * u }));
    svg.appendChild(text(qe[0] + 5 * u, qe[1] - 4 * u, (ctx.live ? (M.expected || "EXPECTED TODAY") : "DAY " + day) + " · " + (dd.to || dd.from || ""), "pos-label"));
    var pos = ctx.data.position;
    if (ctx.live && ctx.ok("position") && pos && pos.available && pos.lat != null) {
      var qp = proj(pos.lat, pos.lon);
      svg.appendChild(mk("circle", { "class": "pos-dot", cx: qp[0], cy: qp[1], r: 3.2 * u }));
      svg.appendChild(text(qp[0] + 5 * u, qp[1] + 8 * u, (M.actual || "LAST SEEN") + " · " + (pos.place || ""), "pos-label"));
    }
    drawDetail();
  }

  // roads, rivers, lakes and landform names, drawn when their file arrives (it is the big one)
  function drawDetail() {
    var svg = document.getElementById("bigmap"), g = svg.querySelector(".detail"), lf = svg.querySelector(".landforms"), d = state.detail;
    if (!g || !d) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    while (lf.firstChild) lf.removeChild(lf.firstChild);
    // one path per layer (thousands of small ones would make scrolling heavy)
    g.appendChild(mk("path", { "class": "lake", d: (d.lakes || []).map(function (ring) { return pathOf(ring) + "Z"; }).join("") }));
    g.appendChild(mk("path", { "class": "river", d: (d.rivers || []).map(pathOf).join("") }));
    ["S", "M"].forEach(function (t) { g.appendChild(mk("path", { "class": "road " + t, d: (d.roads || []).filter(function (r) { return r.t === t; }).map(function (r) { return pathOf(r.p); }).join("") })); });
    (d.ranges || []).forEach(function (r) { var q = proj(r.lat, r.lon); lf.appendChild(text(q[0], q[1], r.n, "landform", "middle")); });
  }

  // secret stats as of a day (memoised), and what a given day added
  function statsFor(n) {
    var ctx = state.ctx;
    if (!window.Stats || n < 1) return null;
    if (state.statCache[n]) return state.statCache[n];
    try {
      state.statCache[n] = window.Stats.asOf(ctx.plan, ctx.config, n, ctx.data.calories, ctx.geo, ctx.countries, { rides: ctx.data.rides, geoLive: ctx.data.geoLive, weather: ctx.data.dayWeather });
    } catch (e) { state.statCache[n] = null; }
    return state.statCache[n];
  }
  function eventsFor(n) {
    var ctx = state.ctx, E = (ctx.config.copy.map && ctx.config.copy.map.events) || {}, out = [];
    var d = Trip.day(ctx.plan, n);
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

  // dots on the unridden route: 2.6px every 7px at the current zoom
  function dotify(u) { if (!state.rest) return; state.rest.setAttribute("stroke-width", (2.6 * u).toFixed(3)); state.rest.setAttribute("stroke-dasharray", "0 " + (7 * u).toFixed(3)); }

  // the camera. f in 0..INTRO: the whole map zooming in on Deadhorse; after that: along the route
  function camera(f) {
    var ctx = state.ctx, svg = document.getElementById("bigmap"), r = svg.getBoundingClientRect();
    if (!ctx.route || !r.width) return;
    state.f = f;
    var aspect = r.height / r.width, Wz = state.W, p = ctx.route.points;
    var start = proj(p[0][0], p[0][1]), cx, cy, W, far = false;
    if (f < INTRO && state.full) {
      var t = ease(f / INTRO), full = state.full;
      var Wf = Math.max(full.w, full.h / aspect) * 1.08;
      W = Math.exp(Math.log(Wf) + (Math.log(Wz) - Math.log(Wf)) * t);
      cx = full.cx + (start[0] - full.cx) * t; cy = full.cy + (start[1] - full.cy) * t;
      far = W > Wz * 1.8;
    } else {
      var g = state.full ? Math.max(0, (f - INTRO) / (1 - INTRO)) : f;
      var pt = Trip.pointAtFraction(p, g), q = proj(pt[0], pt[1]);
      cx = q[0]; cy = q[1]; W = Wz;
    }
    var H = W * aspect, u = W / r.width;
    svg.setAttribute("viewBox", (cx - W / 2).toFixed(3) + " " + (cy - H / 2).toFixed(3) + " " + W.toFixed(3) + " " + H.toFixed(3));
    svg.style.setProperty("--u", u);
    svg.classList.toggle("far", far);
    dotify(u);
    updateBar(f);
  }
  function dayAt(f) { var g = state.full ? Math.max(0, (f - INTRO) / (1 - INTRO)) : f; return Trip.dayAtFraction(state.ctx.plan, g); }
  function updateBar(f) {
    var ctx = state.ctx, plan = ctx.plan, el = ctx.el, M = ctx.config.copy.map || {}, bar = document.getElementById("bigmap-bar");
    bar.textContent = "";
    if (f < INTRO * 0.6 && state.full) {
      bar.appendChild(el("span", { class: "mono", text: M.whole || "THE WHOLE ROAD" }));
      bar.appendChild(el("b", { text: plan.days.length + " days · " + (ctx.countries || []).length + " countries" }));
      bar.appendChild(el("span", { class: "mono totals", text: Trip.fmtInt(Math.round(plan.totals ? plan.totals.miles : Trip.totalMiles(plan))) + " " + (M.mi || "MI") + " · " + Trip.fmtInt(Math.round(plan.totals ? plan.totals.climb_ft : 0)) + " " + (M.ft || "FT CLIMBED") }));
      bar.hidden = false; setSlider(1); return;
    }
    var n = dayAt(f), d = Trip.day(plan, n);
    state.day = n;
    bar.appendChild(el("span", { class: "mono", text: ("DAY " + n + " OF " + plan.days.length + " · SEGMENT " + d.section + " · " + countryOfDay(ctx.countries, n)).toUpperCase() }));
    var t = Trip.dayTitle(d), b = el("b"); b.appendChild(document.createTextNode(t.pre)); if (t.em) b.appendChild(el("em", { text: t.em }));
    bar.appendChild(b);
    if (d.plan_miles > 0) bar.appendChild(el("span", { class: "mono", text: " " + Math.round(d.plan_miles) + " MI PLANNED" + (d.plan_climb_ft > 0 ? " · " + Trip.fmtInt(d.plan_climb_ft) + " FT" : "") }));
    bar.appendChild(el("span", { class: "mono totals", text: Trip.fmtInt(Math.round(Trip.plannedMilesThrough(plan, n))) + " " + (M.mi || "MI") + " · " + Trip.fmtInt(Math.round(Trip.plannedClimbThrough(plan, n))) + " " + (M.ft || "FT CLIMBED") + " " + (M.soFar || "SO FAR") }));
    var ev = eventsFor(n);
    if (ev.length) bar.appendChild(el("div", { class: "events" }, ev.map(function (x) { return el("span", { text: x }); })));
    var trail = el("span", { class: "trail" }, [el("i")]); trail.style.setProperty("--p", (Trip.fractionAtDay(plan, n) * 100).toFixed(1) + "%"); bar.appendChild(trail);
    bar.hidden = false;
    setSlider(n);
  }
  function setSlider(n) {
    var s = document.getElementById("bigmap-slider"), l = document.getElementById("bigmap-slider-label");
    if (s && document.activeElement !== s) s.value = n;
    if (l) l.textContent = ((state.ctx.config.copy.map || {}).slider || "DAY") + " " + n;
  }

  function scrollFraction() {
    var box = document.getElementById("bigmap-scroll"), top = box.offsetTop, span = box.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, span > 0 ? (window.scrollY - top) / span : 0));
  }
  function scrollToFraction(f, smooth) {
    var box = document.getElementById("bigmap-scroll"), span = box.offsetHeight - window.innerHeight;
    window.scrollTo({ top: box.offsetTop + f * span, behavior: smooth ? "smooth" : "auto" });
  }
  function dayMiddle(plan, n) { return (Trip.fractionAtDay(plan, Math.max(0, n - 1)) + Trip.fractionAtDay(plan, n)) / 2; }
  function scrollToDay(n, smooth) {
    var plan = state.ctx.plan; n = Trip.clampDay(plan, n);
    var g = dayMiddle(plan, n);
    scrollToFraction(state.full ? INTRO + (1 - INTRO) * g : g, smooth);
  }
  function resize() {
    var svg = document.getElementById("bigmap"), r = svg.getBoundingClientRect();
    state.W = zoomUnits();
    state.u = state.W / Math.max(1, r.width);          // drawing units per screen pixel, zoomed in
    svg.style.setProperty("--u", state.u);
    build(state.ctx);
    camera(scrollFraction());
  }

  var shapesLoad = fetch("data/bigmap_shapes.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  Promise.all([window.Site.ready, shapesLoad]).then(function (both) {
    var ctx = both[0]; state.shapes = both[1] && both[1].land ? both[1] : null;
    if (!ctx.config || !ctx.plan || !ctx.route) { var m = document.querySelector("main"); if (m) m.hidden = true; return; }
    state.ctx = ctx;
    var c = ctx.config, M = c.copy.map || {};
    document.documentElement.style.setProperty("--map-screens", String(Math.max(6, Math.min(16, Number(c.home.mapScreens) || 10))));
    resize();
    var ticking = false;
    window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; camera(scrollFraction()); }); }, { passive: true });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
    document.getElementById("bigmap-today").addEventListener("click", function () { scrollToDay(ctx.day, true); });
    document.getElementById("bigmap-top").addEventListener("click", function () { scrollToFraction(0, true); });
    // manual controls
    var controls = document.getElementById("bigmap-controls"), slider = document.getElementById("bigmap-slider");
    controls.hidden = false;
    slider.max = ctx.plan.days.length;
    document.getElementById("bigmap-prev").addEventListener("click", function () { scrollToDay(state.day - 1, true); });
    document.getElementById("bigmap-next").addEventListener("click", function () { scrollToDay(state.day + 1, true); });
    slider.addEventListener("input", function () { scrollToDay(Number(slider.value), false); });
    document.getElementById("bigmap-hint").textContent = (M.scrollHint || "SCROLL, OR USE THE BUTTONS AND THE SLIDER");
    if (ctx.params.has("day")) setTimeout(function () { scrollToDay(ctx.day, false); }, 300);
    ctx.onChange(function () { state.statCache = {}; resize(); });
    // the detail layers come after the first paint
    fetch("data/bigmap_detail.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (d) { if (d && d.roads) { state.detail = d; drawDetail(); } });
  });
})();
