/* The full map page. One tall scroll: the view is pinned while the map slides under it, following the
   route from Deadhorse to Ushuaia. Drawn as plain SVG from the same data as the home map: the Americas
   outline, the 18 countries' borders, every day's end point, days off, segment starts, the highest
   point so far, and where the ride is expected to be (plus the tracker's last position when it is on).
   The map honours ?day=N like the rest of the site. No dates. */
(function () {
  "use strict";
  var Trip = window.Trip, NS = "http://www.w3.org/2000/svg";
  var COS = Math.cos(22 * Math.PI / 180);
  function proj(lat, lon) { return [(lon + 170) * COS * 10, (75 - lat) * 10]; }   // 1 unit ≈ 11 km
  function mk(name, attrs) { var e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function pathOf(points) { return points.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(2) + " " + q[1].toFixed(2); }).join(""); }
  function text(x, y, str, cls, anchor) { var t = mk("text", { x: x, y: y, "class": cls || "", "text-anchor": anchor || "start" }); t.textContent = str; return t; }

  var state = { ctx: null, W: 80, u: 1, f: 0, rest: null, H: 0 };
  function viewUnits() { return window.innerWidth < 640 ? 52 : window.innerWidth < 1000 ? 66 : 80; }

  function countryOfDay(countries, n) {
    var name = ""; (countries || []).forEach(function (c) { if (c.first_day <= n) name = c.country; }); return name;
  }
  function centroid(ring) { var x = 0, y = 0; ring.forEach(function (p) { var q = proj(p[0], p[1]); x += q[0]; y += q[1]; }); return [x / ring.length, y / ring.length]; }

  function build(ctx) {
    var svg = document.getElementById("bigmap"), c = ctx.config, plan = ctx.plan, M = c.copy.map || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!ctx.route || !plan) return;
    var route = ctx.route.points, day = ctx.day;

    // land, then borders and names of the 18 countries. The finer shapes (data/bigmap_shapes.json,
    // rings as [lat, lon]) when they loaded; otherwise the home map's coarse ones ([lon, lat]).
    var fine = state.shapes, land = mk("g", { "class": "land" });
    var landRings = fine ? fine.land : (ctx.americas ? ctx.americas.shapes.map(function (s) { return s.ring.map(function (ll) { return [ll[1], ll[0]]; }); }) : []);
    landRings.forEach(function (ring) { land.appendChild(mk("path", { d: pathOf(ring) + "Z" })); });
    svg.appendChild(land);
    var countries = fine ? fine.countries : (ctx.outlines ? ctx.outlines.countries.map(function (co) { return { country: co.country, rings: co.rings.map(function (r) { return r.map(function (ll) { return [ll[1], ll[0]]; }); }) }; }) : []);
    var borders = mk("g", { "class": "borders" }), names = mk("g");
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
    var pts = ctx.dayPoints && ctx.dayPoints.days, marks = mk("g"), labels = mk("g");
    var lastRestPlace = "", lastSection = 0;
    plan.days.forEach(function (d) {
      var p = pts && pts[String(d.day)], e = p && (d.kind === "rest" ? (p.end || p.start) : p.end);
      if (!e) return;
      var q = proj(e.lat, e.lon);
      if (d.section !== lastSection) {
        lastSection = d.section;
        var st = p.start || e, qs = proj(st.lat, st.lon);
        marks.appendChild(mk("circle", { "class": "seg-dot", cx: qs[0], cy: qs[1], r: 2.4 * state.u }));
        labels.appendChild(text(qs[0] + 4 * state.u, qs[1] - 4 * state.u, (M.segment || "SEGMENT") + " " + d.section + " · " + (d.from || "") + " · DAY " + d.day, "seg-label"));
      }
      if (d.kind === "rest") {
        marks.appendChild(mk("circle", { "class": "rest-dot", cx: q[0], cy: q[1], r: 2.2 * state.u }));
        if (e.place !== lastRestPlace) { labels.appendChild(text(q[0] + 4 * state.u, q[1] + 3.5 * state.u, (e.place || d.to || "") + " · " + (M.restDay || "DAY OFF") + " · DAY " + d.day)); lastRestPlace = e.place; }
      } else marks.appendChild(mk("circle", { "class": "day-dot", cx: q[0], cy: q[1], r: 1.1 * state.u }));
    });
    svg.appendChild(marks); svg.appendChild(labels);

    // milestone: the highest point so far (real tracks only, as in the secret stats)
    if (window.Stats && pts) {
      try {
        var st2 = window.Stats.asOf(plan, c, day, ctx.data.calories, ctx.geo, ctx.countries, { rides: ctx.data.rides, geoLive: ctx.data.geoLive, weather: ctx.data.dayWeather });
        var hp = st2.highest && pts[String(st2.highest.day)];
        if (hp && hp.end) {
          var qh = proj(hp.end.lat, hp.end.lon);
          svg.appendChild(mk("circle", { "class": "mile-dot", cx: qh[0], cy: qh[1], r: 2.6 * state.u }));
          svg.appendChild(text(qh[0] + 4.5 * state.u, qh[1] + 1 * state.u, (M.highest || "HIGHEST POINT") + " · " + Trip.fmtInt(Math.round(st2.highest.m * 3.28084)) + " FT · " + (st2.highest.place || "") + " · DAY " + st2.highest.day));
        }
      } catch (e) { /* the map is fine without it */ }
    }

    // where the ride should be on the day shown, and the tracker's last position (live only)
    var exp = Trip.pointAtFraction(route, Trip.fractionAtDay(plan, day)), dEnd = pts && pts[String(day)];
    if (dEnd && dEnd.end) exp = [dEnd.end.lat, dEnd.end.lon];
    var qe = proj(exp[0], exp[1]);
    svg.appendChild(mk("circle", { "class": "pos-dot", cx: qe[0], cy: qe[1], r: 3.2 * state.u }));
    var dd = Trip.day(plan, day);
    svg.appendChild(text(qe[0] + 5 * state.u, qe[1] - 4 * state.u, (ctx.live ? (M.expected || "EXPECTED TODAY") : "DAY " + day) + " · " + (dd.to || dd.from || ""), "pos-label"));
    var pos = ctx.data.position;
    if (ctx.live && ctx.ok("position") && pos && pos.available && pos.lat != null) {
      var qp = proj(pos.lat, pos.lon);
      svg.appendChild(mk("circle", { "class": "pos-dot", cx: qp[0], cy: qp[1], r: 3.2 * state.u }));
      svg.appendChild(text(qp[0] + 5 * state.u, qp[1] + 8 * state.u, (M.actual || "LAST SEEN") + " · " + (pos.place || ""), "pos-label"));
    }
    dotify();
  }

  // dots on the unridden route: 2.6px every 7px, in drawing units for the current zoom
  function dotify() { if (!state.rest) return; state.rest.setAttribute("stroke-width", (2.6 * state.u).toFixed(3)); state.rest.setAttribute("stroke-dasharray", "0 " + (7 * state.u).toFixed(3)); }

  // the camera: a window W units wide centred on the route point at fraction f
  function camera(f) {
    var ctx = state.ctx, svg = document.getElementById("bigmap"), r = svg.getBoundingClientRect();
    if (!ctx.route || !r.width) return;
    state.f = f;
    var p = ctx.route.points, pt = Trip.pointAtFraction(p, f), q = proj(pt[0], pt[1]);
    var W = state.W, H = W * r.height / r.width;
    svg.setAttribute("viewBox", (q[0] - W / 2).toFixed(3) + " " + (q[1] - H / 2).toFixed(3) + " " + W.toFixed(3) + " " + H.toFixed(3));
    var n = Trip.dayAtFraction(ctx.plan, f), d = Trip.day(ctx.plan, n), bar = document.getElementById("bigmap-bar"), el = ctx.el;
    bar.textContent = "";
    bar.appendChild(el("span", { class: "mono", text: ("DAY " + n + " OF " + ctx.plan.days.length + " · SEGMENT " + d.section + " · " + countryOfDay(ctx.countries, n)).toUpperCase() }));
    var t = Trip.dayTitle(d), b = el("b"); b.appendChild(document.createTextNode(t.pre)); if (t.em) b.appendChild(el("em", { text: t.em }));
    bar.appendChild(b);
    if (d.plan_miles > 0) bar.appendChild(el("span", { class: "mono", text: " " + Math.round(d.plan_miles) + " MI PLANNED" + (d.plan_climb_ft > 0 ? " · " + Trip.fmtInt(d.plan_climb_ft) + " FT" : "") }));
    var trail = el("span", { class: "trail" }, [el("i")]); trail.style.setProperty("--p", (f * 100).toFixed(1) + "%"); bar.appendChild(trail);
    bar.hidden = false;
  }
  function scrollFraction() {
    var box = document.getElementById("bigmap-scroll"), top = box.offsetTop, span = box.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, span > 0 ? (window.scrollY - top) / span : 0));
  }
  function dayMiddle(plan, n) { return (Trip.fractionAtDay(plan, Math.max(0, n - 1)) + Trip.fractionAtDay(plan, n)) / 2; }
  function scrollToFraction(f, smooth) {
    var box = document.getElementById("bigmap-scroll"), span = box.offsetHeight - window.innerHeight;
    window.scrollTo({ top: box.offsetTop + f * span, behavior: smooth ? "smooth" : "auto" });
  }
  function resize() {
    var svg = document.getElementById("bigmap"), r = svg.getBoundingClientRect();
    state.W = viewUnits();
    state.u = state.W / Math.max(1, r.width);          // drawing units per screen pixel
    svg.style.setProperty("--u", state.u);
    build(state.ctx);
    camera(scrollFraction());
  }

  // the finer shapes are optional: the map draws with the coarse ones if they are missing
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
    document.getElementById("bigmap-today").addEventListener("click", function () { scrollToFraction(dayMiddle(ctx.plan, ctx.day), true); });
    document.getElementById("bigmap-top").addEventListener("click", function () { scrollToFraction(0, true); });
    document.getElementById("bigmap-hint").textContent = (M.hint || "SCROLL TO FOLLOW THE ROUTE · DOTS ARE STILL TO RIDE");
    if (ctx.params.has("day")) setTimeout(function () { scrollToFraction(dayMiddle(ctx.plan, ctx.day), false); }, 300);
    ctx.onChange(function () { resize(); });
  });
})();
