/* The banner's interactive layer (phase 3): the odometer, the counter flips (one square per day,
   country outlines, the elevation profile), the secret stats behind the mark, and time travel by
   dragging along the line. home.js calls Banner.wire(...) after each render. Respects reduced motion. */
(function () {
  "use strict";
  var Trip = window.Trip, RouteLine = window.RouteLine;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";
  var state = { flip: null, lastValues: {}, morph: null, ctx: null, info: null, hooks: null, dayX: null, elev: null };

  var ICONS = {
    water: "M12 3c-3 4.5-6 7.5-6 11a6 6 0 0 0 12 0c0-3.5-3-6.5-6-11z",
    hotSprings: "M4 19h16M7 15c1.2-1 1.2-2.2 0-3.4S5.8 9.2 7 8M12 15c1.2-1 1.2-2.2 0-3.4S10.8 9.2 12 8M17 15c1.2-1 1.2-2.2 0-3.4S15.8 9.2 17 8",
    borders: "M3 20h18M7 20V5M7 6h11l-3 3.5 3 3.5H7",
    boats: "M3 15l2 5h14l2-5zM12 4v11M12 4l6 7H6z",
    restDays: "M3 19V9M3 13h18v6M7 13V10h9v3M21 19v-2",
    capitals: "M4 20h16M6 20v-8h12v8M12 4a4 4 0 0 1 4 4H8a4 4 0 0 1 4-4zM12 2v2M9 20v-4M15 20v-4",
    calories: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-9z",
    volcanoes: "M3 20h18M5 20l5-11h4l5 11M10 9c0-2 1-3 2-5 1 2 2 3 2 5M12 2v1",
    waters: "M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M12 4v7M9 8l3 3 3-3",
    parks: "M12 3l5 7h-3l4 5h-4l3 5H7l3-5H6l4-5H7zM12 20v2",
    llamas: "M5 20v-6c0-3 2-5 5-5h4V5l2-2 2 3v6c0 2-1 3-3 3h-1v5M9 20v-4M15 20v-4M18 6h1",
    strokes: "M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M12 12l4-3M16 9h3M12 12l-4 3M8 15H5",
    chains: "M7 10a3 3 0 0 1 0-6h3a3 3 0 0 1 3 3M17 14a3 3 0 0 1 0 6h-3a3 3 0 0 1-3-3M9 7l6 10",
    highest: "M3 20L10 7l3 5 2-3 6 11zM10 7V3h4l-3 1.5z",
    hottest: "M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    coldest: "M12 2v20M4 7l16 10M4 17L20 7M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3"
  };

  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtLike(sample, value) {            // keep the thousands separators of the final text
    return /,/.test(sample) || Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-US") : String(Math.round(value));
  }

  // ---- Odometer: roll the big numbers up (or across, on time travel) ----
  function odometer(numEl, key, finalText) {
    var target = parseFloat(String(finalText).replace(/[^\d.-]/g, ""));
    var prefix = (String(finalText).match(/^[+−±-]/) || [""])[0];
    var from = state.lastValues[key];
    state.lastValues[key] = isNaN(target) ? 0 : target;
    if (isNaN(target) || reduced || state.ctx.config.home.odometer === false) return;
    if (from === undefined) from = 0;
    if (from === target) return;
    var t0 = performance.now(), dur = 1100;
    function step(now) {
      var t = Math.min(1, (now - t0) / dur), v = from + (target - from) * ease(t);
      numEl.firstChild.nodeValue = prefix + fmtLike(finalText, Math.abs(v));
      if (t < 1) requestAnimationFrame(step); else numEl.firstChild.nodeValue = finalText;
    }
    requestAnimationFrame(step);
  }

  // ---- Flips ----
  function stage() { return document.getElementById("banner-route"); }
  function closeFlip() {
    if (!state.flip) return;
    var s = stage();
    s.classList.remove("flipped", "mode-" + state.flip);
    document.querySelectorAll(".flip.on").forEach(function (f) { f.classList.remove("on"); setTimeout(function () { if (!f.classList.contains("on")) f.setAttribute("hidden", ""); }, 500); });
    document.querySelectorAll(".counter.active").forEach(function (c) { c.classList.remove("active"); });
    var mark = document.getElementById("mark-button"); if (mark) mark.classList.remove("active");
    if (state.flip === "climb") morphTo(0);
    setHint(state.ctx.config.copy.flips.hint);
    state.flip = null;
  }
  function openFlip(name, trigger) {
    if (state.flip === name) { closeFlip(); return; }
    closeFlip();
    state.flip = name;
    var s = stage(); s.classList.add("flipped", "mode-" + name);   // "mode-" so it never collides with the overlays' own classes
    if (trigger) trigger.classList.add("active");
    if (name === "days") showDays();
    else if (name === "countries") showCountries();
    else if (name === "climb") morphTo(1);
    else if (name === "stats") showStats();
  }
  // (attribute form on purpose: SVG elements have no .hidden property)
  function show(el) { el.removeAttribute("hidden"); requestAnimationFrame(function () { el.classList.add("on"); }); }
  function setHint(text) { var h = document.getElementById("banner-hint"); if (h) h.textContent = text || ""; }

  function showDays() {
    var ctx = state.ctx, plan = ctx.plan, box = document.getElementById("flip-days"), copy = ctx.config.copy.flips;
    box.textContent = "";
    var total = plan.days.length, r = stage().getBoundingClientRect();
    var cols = Math.min(total, Math.max(20, Math.ceil(Math.sqrt(total * (r.width / Math.max(60, r.height)) * 1.15))));
    var rows = Math.ceil(total / cols);
    var sq = Math.max(4, Math.floor(Math.min((r.width - 32) / cols, (r.height - 16) / rows)) - 3);
    box.style.setProperty("--sq", sq + "px");
    box.style.gridTemplateColumns = "repeat(" + cols + ", " + sq + "px)";
    var frag = document.createDocumentFragment();
    plan.days.forEach(function (d) {
      var sp = document.createElement("span");
      if (d.day < ctx.day) sp.className = "done"; else if (d.day === ctx.day) sp.className = "now";
      sp.title = "Day " + d.day + " · " + d.from + (d.from === d.to ? "" : " to " + d.to);
      sp.addEventListener("click", function (e) { e.stopPropagation(); travelTo(d.day); });
      frag.appendChild(sp);
    });
    box.appendChild(frag);
    setHint(copy.days + " · " + (ctx.day) + " OF " + total);
    show(box);
  }

  function showCountries() {
    var ctx = state.ctx, svg = document.getElementById("flip-countries"), line = document.getElementById("banner-line");
    // Same drawing space as the big line, stretched the same way, so the outlines sit exactly where
    // the route crosses them. They run past the top and bottom of the banner, which is fine.
    svg.setAttribute("viewBox", line.getAttribute("viewBox"));
    svg.setAttribute("preserveAspectRatio", "none");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var data = ctx.outlines;
    if (data && ctx.route) {
      var map = RouteLine.projector(ctx.route.points);
      var entered = data.countries.filter(function (c) { return c.first_day <= ctx.day; }).sort(function (a, b) { return a.first_day - b.first_day; });
      entered.forEach(function (c, i) {
        var d = c.rings.map(function (ring) { return "M" + ring.map(function (ll) { var q = map([ll[1], ll[0]]); return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L") + "Z"; }).join("");
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        var t = document.createElementNS(NS, "title"); t.textContent = c.country + " · day " + c.first_day; path.appendChild(t);
        svg.appendChild(path);
        setTimeout(function () { path.classList.add("in"); }, reduced ? 0 : 90 * i);
      });
      setHint(ctx.config.copy.flips.countries + " · " + entered.length + " OF " + data.countries.length);
    }
    show(svg);
  }

  // Elevation profile: the two line paths morph between route shape and profile shape
  function profilePoints() {
    var ctx = state.ctx;
    if (state.elev) return state.elev;
    if (!ctx.elevation || !ctx.route) return null;
    var pts = ctx.route.points, el = ctx.elevation.elevation_m, map = RouteLine.projector(pts);
    var all = pts.map(map), b = RouteLine.bounds(all);
    var cum = Trip.lineCumulative(pts), total = cum[cum.length - 1];
    var minE = Math.min.apply(null, el), maxE = Math.max.apply(null, el);
    var top = b.minY, h = b.maxY - b.minY;
    var prof = pts.map(function (p, i) { return [cum[i] / total * RouteLine.VIEW_WIDTH, top + (1 - (el[i] - minE) / (maxE - minE)) * h]; });
    state.elev = { route: all, profile: prof, maxFt: Math.round(maxE * 3.28084), minFt: Math.round(minE * 3.28084) };
    return state.elev;
  }
  function morphTo(target) {
    var P = profilePoints(), ctx = state.ctx;
    if (!P) return;
    var done = document.querySelector("#banner-line .route-done"), rest = document.querySelector("#banner-line .route-rest");
    if (!done || !rest) return;
    var fraction = state.info.fraction, idx = Trip.lineCumulative(ctx.route.points), n = ctx.route.points.length;
    // index of the split point along the line (same rule as RouteLine.drawProgress)
    var total = idx[n - 1], tgt = fraction * total, i = 1; while (i < n - 1 && idx[i] < tgt) i++;
    var segT = (idx[i] - idx[i - 1]) ? (tgt - idx[i - 1]) / (idx[i] - idx[i - 1]) : 0;
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function shape(t) {
      var pts = P.route.map(function (p, k) { return lerp(p, P.profile[k], t); });
      var split = lerp(pts[i - 1], pts[i], segT);
      return { done: pts.slice(0, i).concat([split]), rest: [split].concat(pts.slice(i)) };
    }
    var from = state.morph ? state.morph.t : 0, t0 = performance.now(), dur = reduced ? 0 : 900;
    if (state.morph && state.morph.raf) cancelAnimationFrame(state.morph.raf);
    state.morph = { t: from, raf: null };
    function frame(now) {
      var k = dur ? Math.min(1, (now - t0) / dur) : 1, t = from + (target - from) * ease(k);
      state.morph.t = t;
      var s = shape(t);
      done.setAttribute("d", RouteLine.pathData(s.done, { tailStart: true }));
      rest.setAttribute("d", RouteLine.pathData(s.rest, { tailEnd: true }));
      if (k < 1) state.morph.raf = requestAnimationFrame(frame); else if (target === 0) state.morph = null;
    }
    state.morph.raf = requestAnimationFrame(frame);
    if (target === 1) setHint(ctx.config.copy.flips.climb + " " + P.maxFt.toLocaleString("en-US") + " FT");
    if (ctx.hideMarkerDuringMorph) ctx.hideMarkerDuringMorph(target === 1);
  }

  function showStats() {
    var ctx = state.ctx, c = ctx.config, box = document.getElementById("flip-stats"), labels = c.copy.stats || {};
    var st = window.Stats.asOf(ctx.plan, c, ctx.day, ctx.data.calories, ctx.geo, ctx.countries, { rides: ctx.data.rides, geoLive: ctx.data.geoLive, weather: ctx.data.dayWeather });
    box.textContent = "";
    var k = document.createElement("p"); k.className = "kicker"; k.textContent = (labels.kicker || "SECRET STATS") + " · DAY " + ctx.day; box.appendChild(k);
    function tile(key, value, title, small) {
      if (value === null || value === undefined) return;
      var el = document.createElement("div"); el.className = "stat";
      var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 24 24");
      var path = document.createElementNS(NS, "path"); path.setAttribute("d", ICONS[key]); svg.appendChild(path);
      var txt = document.createElement("div");
      var num = document.createElement("div"); num.className = "num"; num.textContent = typeof value === "number" ? value.toLocaleString("en-US") : value;
      var lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = (labels[key] || key) + (small ? " · " + small : "");
      if (title) el.title = title;
      txt.appendChild(num); txt.appendChild(lbl); el.appendChild(svg); el.appendChild(txt); box.appendChild(el);
    }
    var names = function (arr) { return arr && arr.length ? arr.join(", ") : ""; };
    tile("water", st.water); tile("hotSprings", st.hotSprings);
    tile("volcanoes", st.volcanoes, names(st.volcanoNames)); tile("waters", st.waters, names(st.waterNames));
    tile("parks", st.parks, names(st.parkNames)); tile("llamas", st.llamas);
    tile("strokes", st.strokes); tile("chains", st.chains);
    tile("borders", st.borders); tile("boats", st.boats); tile("restDays", st.restDays);
    tile("capitals", st.capitals, names(st.capitalNames)); tile("calories", st.calories);
    // Milestones: records rather than tallies. Day numbers, never dates, until showDates is on.
    var when = function (m) { return c.showDates && ctx.plan.days[m.day - 1] ? ctx.plan.days[m.day - 1].date : "DAY " + m.day; };
    if (st.highest || st.hottest || st.coldest) {
      var mk = document.createElement("p"); mk.className = "kicker milestones"; mk.textContent = labels.milestones || "MILESTONES"; box.appendChild(mk);
      if (st.highest) tile("highest", Math.round(st.highest.m * 3.28084).toLocaleString("en-US") + " FT", null, when(st.highest) + " · " + (st.highest.place || "").toUpperCase() + (st.highest.live ? "" : " · " + (labels.estimate || "ESTIMATE")));
      if (st.hottest) tile("hottest", Math.round(st.hottest.f) + "°F", null, when(st.hottest) + " · " + (st.hottest.place || "").toUpperCase() + (st.hottest.sample ? " · " + (labels.estimate || "ESTIMATE") : ""));
      if (st.coldest) tile("coldest", Math.round(st.coldest.f) + "°F", null, when(st.coldest) + " · " + (st.coldest.place || "").toUpperCase() + (st.coldest.sample ? " · " + (labels.estimate || "ESTIMATE") : ""));
    }
    setHint(labels.kicker || "SECRET STATS");
    show(box);
  }

  // ---- Time travel ----
  function travelTo(day) {
    var ctx = state.ctx;
    day = Trip.clampDay(ctx.plan, day);
    if (state.hooks && state.hooks.onDay) state.hooks.onDay(day);
  }
  // x position (drawing units) of the marker for every day, so dragging picks the nearest day
  function dayXs() {
    if (state.dayX) return state.dayX;
    var ctx = state.ctx, map = RouteLine.projector(ctx.route.points), out = [];
    for (var n = 1; n <= ctx.plan.days.length; n++) out.push(map(Trip.pointAtFraction(ctx.route.points, Trip.fractionAtDay(ctx.plan, n)))[0]);
    state.dayX = out;
    return out;
  }
  function dayAtClientX(clientX) {
    var r = stage().getBoundingClientRect(), x = (clientX - r.left) / r.width * RouteLine.VIEW_WIDTH;
    var xs = dayXs(), best = 1, bd = Infinity;
    for (var i = 0; i < xs.length; i++) { var d = Math.abs(xs[i] - x); if (d < bd) { bd = d; best = i + 1; } }
    return best;
  }
  // Hover: a connector line runs from the cursor to that day's point on the route, the counters
  // preview that day, and a click lands there. On touch, dragging previews and lifting lands.
  function hoverLayer() {
    var s = stage(), layer = document.getElementById("hover-layer");
    if (!layer) {
      layer = document.createElementNS(NS, "svg"); layer.id = "hover-layer"; layer.setAttribute("class", "hover-layer"); layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = '<line class="hl-line"/><circle class="hl-dot" r="7"/>';
      s.appendChild(layer);
      var label = document.createElement("div"); label.id = "hover-label"; label.className = "hover-label"; s.appendChild(label);
    }
    return layer;
  }
  function dayPixel(day) {
    var ctx = state.ctx, svg = document.getElementById("banner-line"), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    var m = RouteLine.projector(ctx.route.points)(Trip.pointAtFraction(ctx.route.points, Trip.fractionAtDay(ctx.plan, day)));
    return [(m[0] - vb.x) / vb.width * r.width, (m[1] - vb.y) / vb.height * r.height];
  }
  function showHover(clientX, clientY) {
    var ctx = state.ctx, s = stage(), r = s.getBoundingClientRect();
    var day = dayAtClientX(clientX), p = dayPixel(day), layer = hoverLayer(), label = document.getElementById("hover-label");
    var cx = clientX - r.left, cy = clientY - r.top;
    layer.setAttribute("viewBox", "0 0 " + r.width + " " + r.height);
    layer.setAttribute("width", r.width); layer.setAttribute("height", r.height);
    var line = layer.querySelector(".hl-line"), dot = layer.querySelector(".hl-dot");
    line.setAttribute("x1", cx); line.setAttribute("y1", cy); line.setAttribute("x2", p[0]); line.setAttribute("y2", p[1]);
    dot.setAttribute("cx", p[0]); dot.setAttribute("cy", p[1]);
    layer.classList.add("on");
    var d = ctx.plan.days[day - 1];
    label.textContent = "DAY " + day + " · " + (d.to || "").toUpperCase();
    label.style.left = Math.min(cx + 14, r.width - label.offsetWidth - 8) + "px";
    label.style.top = Math.max(0, cy - 30) + "px";
    label.classList.add("on");
    if (state.hooks && state.hooks.onPreview) state.hooks.onPreview(day);
    return day;
  }
  function hideHover() {
    var layer = document.getElementById("hover-layer"), label = document.getElementById("hover-label");
    if (layer) layer.classList.remove("on");
    if (label) label.classList.remove("on");
    if (state.hooks && state.hooks.onPreviewEnd) state.hooks.onPreviewEnd();
  }
  function wireScrub() {
    var s = stage();
    if (s._scrub) return;
    s._scrub = true;
    var down = null, hoverDay = null;
    var enabled = function () { return !state.flip && state.ctx.config.home.timeTravel !== false; };
    s.addEventListener("pointermove", function (e) {
      if (!enabled()) return;
      if (e.pointerType === "touch" && !down) return;          // fingers: only while dragging
      hoverDay = showHover(e.clientX, e.clientY);
    });
    s.addEventListener("pointerleave", function () { if (!down) { hoverDay = null; hideHover(); } });
    s.addEventListener("pointerdown", function (e) {
      if (!enabled() || e.button > 0) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { s.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      if (e.pointerType === "touch") hoverDay = showHover(e.clientX, e.clientY);
    });
    s.addEventListener("pointerup", function (e) {
      if (!down) return;
      var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
      down = null;
      if (!enabled()) return;
      var day = dayAtClientX(e.clientX);
      if (e.pointerType === "touch" || !moved || true) { hideHover(); travelTo(day); }
    });
    s.addEventListener("pointercancel", function () { down = null; hideHover(); });
  }
  function wireMapScrub(svg) {
    if (!svg || svg._scrub) return;
    svg._scrub = true;
    var down = null;
    function dayAt(e) {
      var ctx = state.ctx, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var ctm = svg.getScreenCTM(); if (!ctm) return null;
      var p = pt.matrixTransform(ctm.inverse()), pts = ctx.route.points, best = 0, bd = Infinity;
      for (var i = 0; i < pts.length; i++) { var q = window.SiteMap.proj(pts[i][0], pts[i][1]), d = (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.y) * (q[1] - p.y); if (d < bd) { bd = d; best = i; } }
      var cum = Trip.lineCumulative(pts);
      return { day: Trip.dayAtFraction(state.ctx.plan, cum[best] / cum[cum.length - 1]), point: window.SiteMap.proj(pts[best][0], pts[best][1]), cursor: p };
    }
    function hover(h) {
      var g = svg.querySelector(".map-hover");
      if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "map-hover"); g.innerHTML = '<line/><circle/><text/>'; svg.appendChild(g); }
      var vb = svg.viewBox.baseVal, unit = vb.width / 100;
      var line = g.querySelector("line"), c = g.querySelector("circle"), t = g.querySelector("text");
      line.setAttribute("x1", h.cursor.x); line.setAttribute("y1", h.cursor.y); line.setAttribute("x2", h.point[0]); line.setAttribute("y2", h.point[1]);
      c.setAttribute("cx", h.point[0]); c.setAttribute("cy", h.point[1]); c.setAttribute("r", unit * 1.3); c.setAttribute("stroke-width", unit * 0.5);
      var d = state.ctx.plan.days[h.day - 1];
      t.textContent = "DAY " + h.day + " · " + (d.to || "").toUpperCase();
      t.setAttribute("x", h.cursor.x + unit * 1.5); t.setAttribute("y", h.cursor.y - unit * 1.5); t.setAttribute("font-size", unit * 2.4);
      t.setAttribute("text-anchor", h.cursor.x > vb.x + vb.width * 0.6 ? "end" : "start");
      if (t.getAttribute("text-anchor") === "end") t.setAttribute("x", h.cursor.x - unit * 1.5);
      g.classList.add("on");
      if (state.hooks && state.hooks.onPreview) state.hooks.onPreview(h.day);
    }
    function clear() { var g = svg.querySelector(".map-hover"); if (g) g.classList.remove("on"); if (state.hooks && state.hooks.onPreviewEnd) state.hooks.onPreviewEnd(); }
    var enabled = function () { return state.ctx.config.home.timeTravel !== false; };
    svg.addEventListener("pointermove", function (e) { if (!enabled()) return; if (e.pointerType === "touch" && !down) return; var h = dayAt(e); if (h) hover(h); });
    svg.addEventListener("pointerleave", function () { if (!down) clear(); });
    svg.addEventListener("pointerdown", function (e) { if (!enabled() || e.button > 0) return; down = true; try { svg.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } if (e.pointerType === "touch") { var h = dayAt(e); if (h) hover(h); } });
    svg.addEventListener("pointerup", function (e) { if (!down) return; down = false; var h = dayAt(e); clear(); if (h) travelTo(h.day); });
    svg.addEventListener("pointercancel", function () { down = false; clear(); });
  }

  // ---- Wiring, called by home.js after every render ----
  // info: { fraction, counters: { days, countries, miles, climb, vsPlan }, numbers: { key: finalText } }
  function wire(ctx, info, hooks) {
    state.ctx = ctx; state.info = info; state.hooks = hooks;
    if (state.dayXPlanId !== ctx.plan) { state.dayX = null; state.elev = null; state.dayXPlanId = ctx.plan; }
    Object.keys(info.counters).forEach(function (key) {
      var el = info.counters[key]; if (!el) return;
      odometer(el.querySelector(".num"), key, info.numbers[key]);
      var flip = { days: "days", countries: "countries", climb: "climb" }[key];
      if (flip && (flip !== "climb" || ctx.elevation) && (flip !== "countries" || ctx.outlines)) {
        el.classList.add("clickable"); el.setAttribute("role", "button"); el.tabIndex = 0;
        el.addEventListener("click", function () { openFlip(flip, el); });
        el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFlip(flip, el); } });
        if (state.flip === flip) el.classList.add("active");
      }
    });
    var mark = document.getElementById("mark-button");
    if (mark && !mark._wired) {
      mark._wired = true;
      mark.addEventListener("click", function () { openFlip("stats", mark); });
      mark.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFlip("stats", mark); } });
    }
    if (!document._bannerEsc) { document._bannerEsc = true; document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeFlip(); }); }
    if (!document.getElementById("banner-hint")) {
      var hint = document.createElement("p"); hint.id = "banner-hint"; hint.className = "banner-hint";
      document.getElementById("banner-note").insertAdjacentElement("afterend", hint);
    }
    if (!state.flip) setHint(ctx.config.copy.flips.hint);
    // A render while a flip is open (time travel from inside the days grid): refresh that view
    if (state.flip === "days") showDays(); else if (state.flip === "countries") showCountries(); else if (state.flip === "stats") showStats(); else if (state.flip === "climb") { state.morph = null; morphTo(1); }
    wireScrub();
    wireMapScrub(document.getElementById("map"));
  }

  window.Banner = { wire: wire, closeFlip: closeFlip, openFlip: openFlip, travelTo: travelTo };
})();
