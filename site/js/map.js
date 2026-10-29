/* The small map on the home page: Americas outlines (peach), the route (ridden in persimmon, the
   rest dotted gray), start and end labels, and the position marker. Plain SVG, no map library. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var COS = Math.cos(22 * Math.PI / 180);
  var TILT = -12 * Math.PI / 180;   // lean the continent like the design, so it fills a landscape card
  function proj(lat, lon) {
    var x = (lon + 170) * COS * 10, y = (75 - lat) * 10;
    return [x * Math.cos(TILT) - y * Math.sin(TILT), x * Math.sin(TILT) + y * Math.cos(TILT)];
  }
  function mk(name, attrs) { var e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function path(points) { return points.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(""); }

  function draw(svg, o) {
    var Trip = window.Trip;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(p) { var q = proj(p[0], p[1]); if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
    o.americas.shapes.forEach(function (s) { s.ring.forEach(function (ll) { grow([ll[1], ll[0]]); }); });
    o.route.forEach(grow);
    var pad = 50;
    svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + 2 * pad) + " " + (maxY - minY + 2 * pad));
    var unit = (maxX - minX) / 100;                  // 1% of the drawing width: text and dots scale with it
    svg.style.setProperty("--map-font", (unit * 2.4) + "px");

    var land = mk("g", { "class": "land" });
    o.americas.shapes.forEach(function (s) { land.appendChild(mk("path", { d: path(s.ring.map(function (ll) { return [ll[1], ll[0]]; })) + "Z" })); });
    svg.appendChild(land);

    var halves = Trip.splitAtFraction(o.route, Math.max(0, Math.min(1, o.fraction || 0)));
    svg.appendChild(mk("path", { "class": "route-rest", d: path(halves[1]) }));
    if (halves[0].length > 1) svg.appendChild(mk("path", { "class": "route-done", d: path(halves[0]) }));

    function label(ll, text, dx, dy, anchor) {
      var q = proj(ll[0], ll[1]);
      var t = mk("text", { "class": "map-label", x: q[0] + dx * unit, y: q[1] + dy * unit, "text-anchor": anchor || "start", "font-size": unit * 2.4 });
      t.textContent = text; svg.appendChild(t);
    }
    var start = o.route[0], end = o.route[o.route.length - 1];
    var qs = proj(start[0], start[1]), qe = proj(end[0], end[1]);
    svg.appendChild(mk("circle", { "class": "map-dot", cx: qs[0], cy: qs[1], r: unit * 0.9 }));
    svg.appendChild(mk("circle", { "class": "map-dot", cx: qe[0], cy: qe[1], r: unit * 0.9 }));
    label(start, o.copy.start || "DEADHORSE", 1.6, 0.8);
    label(end, o.copy.end || "USHUAIA", -1.6, 3.2, "end");
    if (o.position) {
      var qp = proj(o.position[0], o.position[1]);
      svg.appendChild(mk("circle", { "class": "map-pos", cx: qp[0], cy: qp[1], r: unit * 1.4, "stroke-width": unit * 0.6 }));
      if (o.positionLabel) label(o.position, String(o.positionLabel).toUpperCase(), -2.4, 0.8, "end");
    }
    if (o.legend) {
      o.legend.innerHTML = "";
      var left = document.createElement("span");
      left.innerHTML = "<i></i>" + (o.copy.legendRidden || "RIDDEN") + " &nbsp; <i class=\"dotted\"></i>" + (o.copy.legendPlanned || "PLANNED");
      var right = document.createElement("span"); right.textContent = o.note || "";
      o.legend.appendChild(left); o.legend.appendChild(right);
    }
  }
  window.SiteMap = { draw: draw, proj: proj };
})();
