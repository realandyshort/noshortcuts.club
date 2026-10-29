/* Trip math shared by the pages and the robot scripts. One copy, so the live site, the test
   mode and the archive all agree. Works in the browser (window.Trip) and in Node (require).

   Nothing here formats a calendar date for display. Dates are only used for arithmetic. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Trip = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MS_DAY = 86400000;

  // "2027-06-18" -> UTC midnight timestamp. Only ever used for subtraction.
  function parseISODate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function isoDate(ts) { return new Date(ts).toISOString().slice(0, 10); }

  // Day number for a moment in time, given the plan and a UTC offset (seconds) for "local".
  function dayNumberAt(plan, whenMs, utcOffsetSeconds) {
    var day1 = parseISODate(plan.day1_date);
    if (isNaN(day1)) return NaN;
    var local = whenMs + (utcOffsetSeconds || 0) * 1000;
    var localMidnight = Math.floor(local / MS_DAY) * MS_DAY;
    return Math.floor((localMidnight - day1) / MS_DAY) + 1;
  }
  function dateOfDay(plan, n) {
    var day1 = parseISODate(plan.day1_date);
    return isNaN(day1) ? null : isoDate(day1 + (n - 1) * MS_DAY);
  }
  function dayOfDate(plan, iso) {
    var day1 = parseISODate(plan.day1_date), d = parseISODate(iso);
    return (isNaN(day1) || isNaN(d)) ? NaN : Math.floor((d - day1) / MS_DAY) + 1;
  }
  function clampDay(plan, n) {
    var total = plan.days.length;
    n = Math.round(Number(n));
    if (!isFinite(n)) n = 1;
    return Math.max(1, Math.min(total, n));
  }
  function day(plan, n) { return plan.days[clampDay(plan, n) - 1]; }

  // Cumulative planned miles at the END of each day; index 0 = after day 1.
  function cumulativeMiles(plan) {
    if (plan._cum) return plan._cum;
    var out = [], sum = 0;
    plan.days.forEach(function (d) { sum += Number(d.plan_miles) || 0; out.push(sum); });
    plan._cum = out;
    return out;
  }
  function totalMiles(plan) { var c = cumulativeMiles(plan); return c.length ? c[c.length - 1] : 0; }
  function plannedMilesThrough(plan, n) { var c = cumulativeMiles(plan); return n < 1 ? 0 : c[clampDay(plan, n) - 1]; }
  function plannedClimbThrough(plan, n) {
    var sum = 0;
    for (var i = 0; i < Math.min(n, plan.days.length); i++) sum += Number(plan.days[i].plan_climb_ft) || 0;
    return sum;
  }
  // Fraction along the whole route at the end of day n (0..1).
  function fractionAtDay(plan, n) {
    var t = totalMiles(plan);
    return t ? plannedMilesThrough(plan, n) / t : 0;
  }
  // Which plan day a fraction along the route corresponds to (first day whose end is at/after it).
  function dayAtFraction(plan, f) {
    var target = f * totalMiles(plan), c = cumulativeMiles(plan);
    for (var i = 0; i < c.length; i++) if (c[i] >= target - 1e-9) return i + 1;
    return c.length;
  }

  // ---- Geometry along the route line ([lat, lon] points) ----
  function haversineMi(a, b) {
    var R = 3958.8, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    var s = Math.sin(dLat / 2), t = Math.sin(dLon / 2);
    var h = s * s + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * t * t;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function lineCumulative(points) {
    if (points._cum) return points._cum;
    var out = [0];
    for (var i = 1; i < points.length; i++) out.push(out[i - 1] + haversineMi(points[i - 1], points[i]));
    points._cum = out;
    return out;
  }
  // Index (fractional) into points for a fraction 0..1 of the line's length.
  function indexAtFraction(points, f) {
    var c = lineCumulative(points), target = Math.max(0, Math.min(1, f)) * c[c.length - 1];
    for (var i = 1; i < c.length; i++) {
      if (c[i] >= target) {
        var seg = c[i] - c[i - 1];
        return (i - 1) + (seg ? (target - c[i - 1]) / seg : 0);
      }
    }
    return points.length - 1;
  }
  function pointAtFraction(points, f) {
    var idx = indexAtFraction(points, f), i = Math.floor(idx), t = idx - i;
    if (i >= points.length - 1) return points[points.length - 1];
    var a = points[i], b = points[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // Split the line into [done, remaining] point arrays at a fraction.
  function splitAtFraction(points, f) {
    var idx = indexAtFraction(points, f), i = Math.floor(idx), p = pointAtFraction(points, f);
    var done = points.slice(0, i + 1).concat([p]);
    var rest = [p].concat(points.slice(i + 1));
    return [done, rest];
  }
  // Nearest fraction along the line to a lat/lon (used to place the live position on the line).
  function fractionNearest(points, latlon) {
    var best = 0, bestD = Infinity, c = lineCumulative(points), total = c[c.length - 1];
    for (var i = 0; i < points.length; i++) {
      var d = haversineMi(points[i], latlon);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { fraction: total ? c[best] / total : 0, distanceMi: bestD, index: best };
  }

  // ---- Stats as of day n ----
  function countriesEntered(countries, n) {
    return (countries || []).filter(function (c) { return c.first_day <= n; }).length;
  }
  // rides: { "YYYY-MM-DD": { miles, climb_ft, moving_sec, max_alt_ft } }
  function ridesThrough(plan, rides, n) {
    var out = { miles: 0, climb_ft: 0, moving_sec: 0, days: 0 };
    if (!rides) return out;
    for (var i = 1; i <= Math.min(n, plan.days.length); i++) {
      var r = rides[plan.days[i - 1].date];
      if (r) { out.miles += r.miles || 0; out.climb_ft += r.climb_ft || 0; out.moving_sec += r.moving_sec || 0; out.days++; }
    }
    return out;
  }
  function rideForDay(plan, rides, n) {
    var d = day(plan, n);
    return (rides && d) ? rides[d.date] || null : null;
  }

  // Match dated items (posts, dispatches) to day numbers by their timestamp.
  function dayOfTimestamp(plan, iso, utcOffsetSeconds) {
    var t = Date.parse(iso);
    return isNaN(t) ? NaN : dayNumberAt(plan, t, utcOffsetSeconds || 0);
  }

  function dayTitle(d) {
    if (!d) return "";
    if (d.kind === "rest" || (d.from === d.to && !(Number(d.plan_miles) > 0))) return { pre: "Rest day in ", em: d.to || d.from };
    if (d.kind === "boat") return { pre: d.from + " to ", em: d.to, note: "by boat" };
    return { pre: d.from + " to ", em: d.to };
  }
  function dayTag(d) {
    if (!d) return "";
    var place = (d.kind === "rest" || d.from === d.to) ? d.to : d.from + " TO " + d.to;
    return ("DAY " + d.day + " · " + place).toUpperCase();
  }
  // "Next up" sentence from the plan, no dates.
  function nextUp(plan, n) {
    var a = plan.days[n], b = plan.days[n + 1];
    if (!a) return "Next up: Ushuaia, the end of the road.";
    var isRest = function (d) { return d && (d.kind === "rest" || (d.from === d.to && !(Number(d.plan_miles) > 0))); };
    if (isRest(a)) {
      var k = n + 1; while (plan.days[k] && isRest(plan.days[k])) k++;
      var nxt = plan.days[k];
      var offs = k - n;
      var dayOff = offs === 1 ? "a day off in " + a.to : offs + " days off in " + a.to;
      return nxt ? "Next up: " + dayOff + ", then Day " + nxt.day + ", " + nxt.from + " to " + nxt.to + "." : "Next up: " + dayOff + ".";
    }
    var s = "Next up: Day " + a.day + ", " + a.from + " to " + a.to;
    if (Number(a.plan_miles) > 0) s += ", " + Math.round(a.plan_miles) + " miles planned";
    if (isRest(b)) s += ", then a day off";
    return s + ".";
  }

  function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
  function fmtSigned(n) { n = Math.round(n); return (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n); }

  return {
    MS_DAY: MS_DAY, parseISODate: parseISODate, dayNumberAt: dayNumberAt, dateOfDay: dateOfDay, dayOfDate: dayOfDate,
    clampDay: clampDay, day: day, cumulativeMiles: cumulativeMiles, totalMiles: totalMiles,
    plannedMilesThrough: plannedMilesThrough, plannedClimbThrough: plannedClimbThrough,
    fractionAtDay: fractionAtDay, dayAtFraction: dayAtFraction,
    haversineMi: haversineMi, lineCumulative: lineCumulative, pointAtFraction: pointAtFraction,
    splitAtFraction: splitAtFraction, fractionNearest: fractionNearest,
    countriesEntered: countriesEntered, ridesThrough: ridesThrough, rideForDay: rideForDay,
    dayOfTimestamp: dayOfTimestamp, dayTitle: dayTitle, dayTag: dayTag, nextUp: nextUp,
    fmtInt: fmtInt, fmtSigned: fmtSigned
  };
});
