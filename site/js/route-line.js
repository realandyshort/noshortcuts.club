/* Draws the whole route as one horizontal line.
   Shared by the coming-soon page now and the home banner later.

   Method (from the build brief, section 8):
   1. Project each [lat, lon] point: x = (lon + 150) * cos(25°), y = 72 - lat.
   2. Rotate everything so the first point (Deadhorse) and the last point (Ushuaia)
      sit at the same height, Deadhorse on the left.
   3. Scale so those two points touch the left and right edges.
   4. Add short straight tails past both edges.
   The route then bulges upward between the two ends. */

(function () {
  "use strict";

  var VIEW_WIDTH = 1000;   // the drawing is 1000 units wide; the browser scales it to fit
  var TAIL = 60;           // how far the straight tails run past each edge, in those units
  var PADDING = 12;        // breathing room above the highest point and below the ends

  // Turns a list of [lat, lon] points into [x, y] points, in drawing units,
  // with x running 0..VIEW_WIDTH from Deadhorse to Ushuaia.
  function project(points) {
    var cos25 = Math.cos(25 * Math.PI / 180);
    var raw = points.map(function (p) {
      return [(p[1] + 150) * cos25, 72 - p[0]];
    });

    var first = raw[0];
    var last = raw[raw.length - 1];
    var angle = Math.atan2(last[1] - first[1], last[0] - first[0]);
    var cosA = Math.cos(-angle);
    var sinA = Math.sin(-angle);

    // Rotate so the chord from first to last is horizontal
    var rotated = raw.map(function (p) {
      var dx = p[0] - first[0];
      var dy = p[1] - first[1];
      return [dx * cosA - dy * sinA, dx * sinA + dy * cosA];
    });

    var chord = rotated[rotated.length - 1][0];
    var scale = VIEW_WIDTH / chord;
    return rotated.map(function (p) {
      return [p[0] * scale, p[1] * scale];
    });
  }

  // Builds the SVG path text ("M x y L x y ...") including the tails
  function pathData(pts) {
    var endY = pts[pts.length - 1][1]; // 0 after rotation, but read it anyway
    var d = "M " + (-TAIL) + " " + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length; i++) {
      d += " L " + pts[i][0].toFixed(2) + " " + pts[i][1].toFixed(2);
    }
    d += " L " + (VIEW_WIDTH + TAIL) + " " + endY.toFixed(2);
    return d;
  }

  // Length of the drawn line in screen pixels, tails included
  function screenLength(svg, pts) {
    var ctm = svg.getScreenCTM();
    if (!ctm) { return 100000; } // not laid out yet: use a length no screen can exceed
    var endY = pts[pts.length - 1][1];
    var all = [[-TAIL, pts[0][1]]].concat(pts, [[VIEW_WIDTH + TAIL, endY]]);
    var total = 0, prev = null;
    for (var i = 0; i < all.length; i++) {
      var x = ctm.a * all[i][0] + ctm.c * all[i][1];
      var y = ctm.b * all[i][0] + ctm.d * all[i][1];
      if (prev) { total += Math.hypot(x - prev[0], y - prev[1]); }
      prev = [x, y];
    }
    return total;
  }

  // Draws into the given <svg>. Returns true if it drew something.
  function draw(svg, points, options) {
    options = options || {};
    if (!svg || !points || points.length < 2) { return false; }

    var pts = project(points);

    var minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][1] < minY) { minY = pts[i][1]; }
      if (pts[i][1] > maxY) { maxY = pts[i][1]; }
    }
    var top = minY - PADDING;
    var height = (maxY - minY) + PADDING * 2;

    svg.setAttribute("viewBox", "0 " + top.toFixed(2) + " " + VIEW_WIDTH + " " + height.toFixed(2));

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData(pts));
    if (options.strokePx) { path.style.strokeWidth = options.strokePx + "px"; }

    while (svg.firstChild) { svg.removeChild(svg.firstChild); }
    svg.appendChild(path);

    // Optional draw-on animation. CSS turns it off for people who prefer reduced motion.
    // The reveal length must be measured in screen pixels (the stroke is non-scaling),
    // not drawing units, or wide screens would stop the line short.
    if (options.animate) {
      var length = screenLength(svg, pts) * 1.02;
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      path.classList.add("draw");
      path.addEventListener("animationend", function () {
        // Leave a plain line behind, so resizing the window afterwards can never cut it
        path.classList.remove("draw");
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
      });
    }
    return true;
  }

  window.RouteLine = { project: project, draw: draw };
})();
