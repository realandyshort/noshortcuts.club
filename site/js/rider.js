/* The rider: a little Andy on the bike, drawn wherever a route shows where the ride is (the banner's
   marker, the home map, the big map), in place of a dot. The legs pedal and the wheels turn (SMIL
   animation, which works inside any SVG and needs no stylesheet); with "reduce motion" on, he sits still.
   A potato rides on the rear rack until the plan reaches the place in config home.rider.potatoUntil
   (Los Angeles): it is there on every day before the day that ends in that place, and gone from then on.
   The drawing is 48 x 40 units; the anchor (the spot that sits on the route) is the ground between the
   wheels, Rider.AX / Rider.AY. Colours come from css/site.css (.rider ...). */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var W = 48, H = 40, AX = 24, AY = 37.5;
  var REAR = [11, 29.5], FRONT = [37, 29.5], BB = [22.5, 29.5], HIP = [20, 13.8], WHEEL = 8, CRANK = 4.2, LEG = 10.6, STEPS = 12;
  function mk(name, attrs) { var e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function f(n) { return n.toFixed(2); }
  function still() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

  // one leg at a crank angle: hip, knee (bent forward), foot on the pedal
  function leg(angle) {
    var foot = [BB[0] + CRANK * Math.cos(angle), BB[1] + CRANK * Math.sin(angle)];
    var dx = foot[0] - HIP[0], dy = foot[1] - HIP[1], d = Math.min(Math.sqrt(dx * dx + dy * dy), 2 * LEG - 0.01);
    var a = Math.atan2(dy, dx) - Math.acos(d / (2 * LEG));
    var knee = [HIP[0] + LEG * Math.cos(a), HIP[1] + LEG * Math.sin(a)];
    return "M" + f(HIP[0]) + " " + f(HIP[1]) + " L" + f(knee[0]) + " " + f(knee[1]) + " L" + f(foot[0]) + " " + f(foot[1]);
  }
  function crank(angle) {
    var c = Math.cos(angle) * CRANK, s = Math.sin(angle) * CRANK;
    return "M" + f(BB[0] + c) + " " + f(BB[1] + s) + " L" + f(BB[0] - c) + " " + f(BB[1] - s);
  }
  function frames(fn, phase) { var out = []; for (var i = 0; i <= STEPS; i++) out.push(fn(phase + i / STEPS * 2 * Math.PI)); return out.join(";"); }

  // the whole drawing, once; "halo" draws it again underneath, fatter, in the background colour, so it reads on a busy map
  function parts(halo, o) {
    var g = mk("g", { "class": halo ? "r-halo" : "r-body" }), extra = halo ? 2.6 : 0, move = !o.still;
    function add(name, attrs, cls, width) { attrs["class"] = cls; if (width != null) attrs.style = "stroke-width:" + (width + extra); var e = mk(name, attrs); g.appendChild(e); return e; }
    function spin(el, dur) { if (move) el.appendChild(mk("animate", { attributeName: "d", dur: dur + "s", repeatCount: "indefinite", values: el._values })); }
    // far leg, behind everything
    var far = add("path", { d: leg(Math.PI) }, "r-ink r-far", 1.9); far._values = frames(leg, Math.PI); spin(far, 0.9);
    // wheels: rim and spokes, turning
    [REAR, FRONT].forEach(function (c) {
      var w = mk("g", {}); g.appendChild(w);
      var rim = mk("circle", { cx: c[0], cy: c[1], r: WHEEL, "class": "r-ink", style: "stroke-width:" + (1.5 + extra) }); w.appendChild(rim);
      if (!halo) for (var k = 0; k < 3; k++) { var a = k * Math.PI / 3; w.appendChild(mk("line", { x1: f(c[0] - WHEEL * Math.cos(a)), y1: f(c[1] - WHEEL * Math.sin(a)), x2: f(c[0] + WHEEL * Math.cos(a)), y2: f(c[1] + WHEEL * Math.sin(a)), "class": "r-ink r-spoke", style: "stroke-width:0.55" })); }
      if (move && !halo) w.appendChild(mk("animateTransform", { attributeName: "transform", type: "rotate", from: "0 " + c[0] + " " + c[1], to: "360 " + c[0] + " " + c[1], dur: "1.3s", repeatCount: "indefinite" }));
    });
    // rack, and the potato on it
    add("path", { d: "M5.6 20.2 L17.8 20.2 M8.4 20.2 L11 29.5" }, "r-ink", 1.1);
    if (o.potato) {
      add("path", { d: "M6.4 16.5 C6 13.7 8.9 12.1 11.6 12.5 C14.7 12.2 17.5 13.6 17.3 16.4 C17.2 18.9 14.5 20 11.7 19.9 C8.8 20 6.7 18.9 6.4 16.5 Z" }, "r-potato r-solid", 0.9);
      if (!halo) [[9.4, 15.4], [12.9, 17.4], [14.6, 14.9], [10.8, 18]].forEach(function (p) { add("circle", { cx: p[0], cy: p[1], r: 0.45 }, "r-eye"); });
    }
    // frame, fork, bars, saddle
    add("path", { d: "M11 29.5 L22.5 29.5 L19.6 18 L11 29.5 M19.6 18 L33 17 M22.5 29.5 L33.6 19.6 M33 17 L37 29.5" }, "r-acc", 1.7);
    add("path", { d: "M33 17 L33.7 13.4 L36.8 12.8 Q38.6 13 38 15" }, "r-ink", 1.5);
    add("path", { d: "M19.6 18 L19.2 15.2 M16.6 15 L21.8 15" }, "r-ink", 1.8);
    // cranks and pedals
    var cr = add("path", { d: crank(0) }, "r-ink", 1.3); cr._values = frames(crank, 0); spin(cr, 0.9);
    // Andy: body leaning to the bars, head and helmet, arm, near leg
    add("path", { d: "M20 13.8 L28.2 6.8" }, "r-acc", 4);
    add("path", { d: "M28.2 7 L32.2 10.8 L36.6 12.9" }, "r-ink", 1.7);
    add("circle", { cx: 31, cy: 3.7, r: 2.9 }, "r-head r-solid", 0);
    add("path", { d: "M28 3.2 A3.1 3.1 0 0 1 34 3.3" }, "r-acc", 1.7);
    var near = add("path", { d: leg(0) }, "r-ink", 2.1); near._values = frames(leg, 0); spin(near, 0.9);
    return g;
  }
  function fill(node, o) { o = o || {}; var opts = { potato: !!o.potato, still: o.still != null ? o.still : still() }; node.appendChild(parts(true, opts)); node.appendChild(parts(false, opts)); return node; }

  // the first day of the plan that ends in the potato's last stop
  function potatoDay(ctx) {
    if (ctx._potatoDay !== undefined) return ctx._potatoDay;
    var cfg = (ctx.config && ctx.config.home && ctx.config.home.rider) || {}, place = String(cfg.potatoUntil || "").trim().toLowerCase(), found = null;
    if (place && ctx.plan && ctx.plan.days) for (var i = 0; i < ctx.plan.days.length; i++) { var d = ctx.plan.days[i]; if (String(d.to || "").toLowerCase().indexOf(place) >= 0) { found = d.day; break; } }
    ctx._potatoDay = found;
    return found;
  }

  window.Rider = {
    W: W, H: H, AX: AX, AY: AY,
    // for an HTML page: a whole <svg>, to be sized with CSS
    svg: function (o) { return fill(mk("svg", { viewBox: "0 0 " + W + " " + H, "class": "rider", "aria-hidden": "true" }), o); },
    // for inside another SVG: a <g> whose anchor sits at 0 0 (move and scale it with a transform)
    group: function (o) { var g = mk("g", { "class": "rider" }); var inner = mk("g", { transform: "translate(" + (-AX) + " " + (-AY) + ")" }); fill(inner, o); g.appendChild(inner); return g; },
    hasPotato: function (ctx, day) { var p = potatoDay(ctx); return p != null && Number(day) < p; }
  };
})();
