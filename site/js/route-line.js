/* Draws the whole route as one horizontal line. Used by the coming-soon page, the home banner
   and (in Node) the Instagram story images.

   Method (from the build brief, section 8):
   1. Project each [lat, lon] point: x = (lon + 150) * cos(25°), y = 72 - lat.
   2. Rotate everything so the first point (Deadhorse) and the last point (Ushuaia)
      sit at the same height, Deadhorse on the left.
   3. Scale so those two points touch the left and right edges.
   4. Add short straight tails past both edges.
   The route then bulges upward between the two ends. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./trip.js"));
  else root.RouteLine = factory(root.Trip);
})(typeof self !== "undefined" ? self : this, function (Trip) {
  "use strict";

  var VIEW_WIDTH = 1000;   // the drawing is 1000 units wide; the browser scales it to fit
  var TAIL = 60;           // how far the straight tails run past each edge, in those units
  var PADDING = 12;        // breathing room above the highest point and below the ends
  var NS = "http://www.w3.org/2000/svg";

  // Returns a function that maps one [lat, lon] to [x, y] using the whole route's transform,
  // so partial lines (the ridden part) land exactly on the full line.
  function projector(points) {
    var cos25 = Math.cos(25 * Math.PI / 180);
    var raw = function (p) { return [(p[1] + 150) * cos25, 72 - p[0]]; };
    var first = raw(points[0]), last = raw(points[points.length - 1]);
    var angle = Math.atan2(last[1] - first[1], last[0] - first[0]);
    var cosA = Math.cos(-angle), sinA = Math.sin(-angle);
    var chord = (last[0] - first[0]) * cosA - (last[1] - first[1]) * sinA;
    var scale = VIEW_WIDTH / chord;
    return function (p) {
      var r = raw(p), dx = r[0] - first[0], dy = r[1] - first[1];
      return [(dx * cosA - dy * sinA) * scale, (dx * sinA + dy * cosA) * scale];
    };
  }
  function project(points) { var f = projector(points); return points.map(f); }

  // "M x y L x y ..." for projected points; tails optional at either end
  function pathData(pts, opts) {
    opts = opts || {};
    var d = "";
    if (opts.tailStart) d += "M " + (-TAIL) + " " + pts[0][1].toFixed(2) + " L ";
    else d += "M ";
    d += pts.map(function (p) { return p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" L ");
    if (opts.tailEnd) d += " L " + (VIEW_WIDTH + TAIL) + " " + pts[pts.length - 1][1].toFixed(2);
    return d;
  }
  function bounds(pts) {
    var minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) { if (pts[i][1] < minY) minY = pts[i][1]; if (pts[i][1] > maxY) maxY = pts[i][1]; }
    return { top: minY - PADDING, height: (maxY - minY) + PADDING * 2, minY: minY, maxY: maxY };
  }
  function viewBox(pts) { var b = bounds(pts); return "0 " + b.top.toFixed(2) + " " + VIEW_WIDTH + " " + b.height.toFixed(2); }

  // Length of the drawn line in screen pixels, tails included (the stroke is non-scaling)
  function screenLength(svg, pts) {
    var ctm = svg.getScreenCTM();
    if (!ctm) return 100000;
    var all = [[-TAIL, pts[0][1]]].concat(pts, [[VIEW_WIDTH + TAIL, pts[pts.length - 1][1]]]);
    var total = 0, prev = null;
    for (var i = 0; i < all.length; i++) {
      var x = ctm.a * all[i][0] + ctm.c * all[i][1], y = ctm.b * all[i][0] + ctm.d * all[i][1];
      if (prev) total += Math.hypot(x - prev[0], y - prev[1]);
      prev = [x, y];
    }
    return total;
  }
  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  // Coming-soon page: one line, optional draw-on animation.
  function draw(svg, points, options) {
    options = options || {};
    if (!svg || !points || points.length < 2) return false;
    var pts = project(points);
    svg.setAttribute("viewBox", viewBox(pts));
    var path = el("path", { d: pathData(pts, { tailStart: true, tailEnd: true }) });
    if (options.strokePx) path.style.strokeWidth = options.strokePx + "px";
    clear(svg);
    svg.appendChild(path);
    if (options.animate) {
      var length = screenLength(svg, pts) * 1.02;
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      path.classList.add("draw");
      path.addEventListener("animationend", function () {
        path.classList.remove("draw");
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
      });
    }
    return true;
  }

  // Home banner: remaining part gray, ridden part persimmon, a marker at the position.
  // fraction: how far along the route (0..1). markerFraction: where the marker sits (defaults to fraction).
  // Returns the marker's [x, y] in drawing units, or null.
  function drawProgress(svg, points, fraction, options) {
    options = options || {};
    if (!svg || !points || points.length < 2) return null;
    var map = projector(points);
    var all = points.map(map);
    svg.setAttribute("viewBox", viewBox(all));
    clear(svg);
    var f = Math.max(0, Math.min(1, fraction || 0));
    var halves = Trip.splitAtFraction(points, f);
    var done = halves[0].map(map), rest = halves[1].map(map);

    var restPath = el("path", { d: pathData(rest, { tailEnd: true }), "class": "route-rest" });
    var donePath = el("path", { d: pathData(done, { tailStart: true }), "class": "route-done" });
    if (options.strokePx) { restPath.style.strokeWidth = options.strokePx + "px"; donePath.style.strokeWidth = options.strokePx + "px"; }
    svg.appendChild(restPath);
    svg.appendChild(donePath);

    var marker = null;
    if (options.marker !== false) {
      var mf = typeof options.markerFraction === "number" ? options.markerFraction : f;
      marker = map(Trip.pointAtFraction(points, mf));
    }
    return { marker: marker, viewBox: svg.getAttribute("viewBox"), bounds: bounds(all) };
  }

  return { VIEW_WIDTH: VIEW_WIDTH, TAIL: TAIL, projector: projector, project: project, pathData: pathData,
           bounds: bounds, viewBox: viewBox, draw: draw, drawProgress: drawProgress };
});
