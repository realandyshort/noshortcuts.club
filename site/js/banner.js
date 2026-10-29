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
    calories: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-9z"
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
    s.classList.remove("flipped", "flip-" + state.flip);
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
    var s = stage(); s.classList.add("flipped", "flip-" + name);
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
    var ctx = state.ctx, svg = document.getElementById("flip-countries");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var data = ctx.outlines;
    if (data && ctx.route) {
      // Same projection as the line, but the drawing is sized to the countries, not to the thin
      // strip the line lives in, and a copy of the route is drawn inside so everything lines up.
      var map = RouteLine.projector(ctx.route.points);
      var entered = data.countries.filter(function (c) { return c.first_day <= ctx.day; }).sort(function (a, b) { return a.first_day - b.first_day; });
      var minX = 0, maxX = RouteLine.VIEW_WIDTH, minY = Infinity, maxY = -Infinity;
      var routePts = ctx.route.points.map(map);
      routePts.forEach(function (q) { if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; });
      var shapes = entered.map(function (c) {
        return { c: c, d: c.rings.map(function (ring) {
          return "M" + ring.map(function (ll) {
            var q = map([ll[1], ll[0]]);
            if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
            return q[0].toFixed(1) + " " + q[1].toFixed(1);
          }).join("L") + "Z"; }).join("") };
      });
      var pad = 10;
      svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + 2 * pad) + " " + (maxY - minY + 2 * pad));
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      shapes.forEach(function (sh, i) {
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", sh.d);
        var t = document.createElementNS(NS, "title"); t.textContent = sh.c.country + " · day " + sh.c.first_day; path.appendChild(t);
        svg.appendChild(path);
        setTimeout(function () { path.classList.add("in"); }, reduced ? 0 : 70 * i);
      });
      var halves = Trip.splitAtFraction(ctx.route.points, state.info.fraction);
      var rest = document.createElementNS(NS, "path"); rest.setAttribute("class", "mini-rest"); rest.setAttribute("d", RouteLine.pathData(halves[1].map(map), {}));
      var done = document.createElementNS(NS, "path"); done.setAttribute("class", "mini-done"); done.setAttribute("d", RouteLine.pathData(halves[0].map(map), {}));
      svg.appendChild(rest); svg.appendChild(done);
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
    var st = window.Stats.asOf(ctx.plan, c, ctx.day, ctx.data.calories);
    box.textContent = "";
    var k = document.createElement("p"); k.className = "kicker"; k.textContent = (labels.kicker || "SECRET STATS") + " · DAY " + ctx.day; box.appendChild(k);
    [["water", st.water], ["hotSprings", st.hotSprings], ["borders", st.borders], ["boats", st.boats], ["restDays", st.restDays], ["capitals", st.capitals], ["calories", st.calories]].forEach(function (pair) {
      if (pair[1] === null || pair[1] === undefined) return;
      var tile = document.createElement("div"); tile.className = "stat";
      var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 24 24");
      var path = document.createElementNS(NS, "path"); path.setAttribute("d", ICONS[pair[0]]); svg.appendChild(path);
      var txt = document.createElement("div");
      var num = document.createElement("div"); num.className = "num"; num.textContent = Number(pair[1]).toLocaleString("en-US");
      var lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = labels[pair[0]] || pair[0];
      if (pair[0] === "capitals" && st.capitalNames.length) tile.title = st.capitalNames.join(", ");
      txt.appendChild(num); txt.appendChild(lbl); tile.appendChild(svg); tile.appendChild(txt); box.appendChild(tile);
    });
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
  function wireScrub() {
    var s = stage();
    if (s._scrub) return;
    s._scrub = true;
    var dragging = false, moved = false, lastSent = 0, pending = null;
    s.addEventListener("pointerdown", function (e) {
      if (state.flip || state.ctx.config.home.timeTravel === false || e.button > 0) return;
      dragging = true; moved = false; s.setPointerCapture(e.pointerId);
      preview(e.clientX);
    });
    s.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      moved = true;
      var d = preview(e.clientX), now = performance.now();
      if (now - lastSent > 350) { lastSent = now; travelTo(d); } else pending = d;
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      var d = dayAtClientX(e.clientX);
      pending = null; travelTo(d);
    }
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", function () { dragging = false; });
    function preview(clientX) {
      var d = dayAtClientX(clientX);
      if (state.hooks && state.hooks.onPreview) state.hooks.onPreview(d);
      return d;
    }
  }
  function wireMapScrub(svg) {
    if (!svg || svg._scrub) return;
    svg._scrub = true;
    var dragging = false;
    function dayAt(e) {
      var ctx = state.ctx, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var ctm = svg.getScreenCTM(); if (!ctm) return null;
      var p = pt.matrixTransform(ctm.inverse()), pts = ctx.route.points, best = 0, bd = Infinity;
      for (var i = 0; i < pts.length; i++) { var q = window.SiteMap.proj(pts[i][0], pts[i][1]), d = (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.y) * (q[1] - p.y); if (d < bd) { bd = d; best = i; } }
      var cum = Trip.lineCumulative(pts);
      return Trip.dayAtFraction(ctx.plan, cum[best] / cum[cum.length - 1]);
    }
    svg.addEventListener("pointerdown", function (e) { if (state.ctx.config.home.timeTravel === false) return; dragging = true; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", function (e) { if (dragging) { var d = dayAt(e); if (d && state.hooks.onPreview) state.hooks.onPreview(d); } });
    svg.addEventListener("pointerup", function (e) { if (!dragging) return; dragging = false; var d = dayAt(e); if (d) travelTo(d); });
    svg.addEventListener("pointercancel", function () { dragging = false; });
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
