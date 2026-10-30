/* Secret stats, worked out from the plan as of a day. Shared by the page and the robot (UMD).
   Nothing here needs updating by hand: keyword lists and constants live in config.secretStats. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Stats = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  // Which country each capital belongs to, so a Santiago in Panama does not count as Chile's capital
  var CAPITAL_COUNTRY = { "ottawa": "Canada", "washington": "United States", "mexico city": "Mexico", "belmopan": "Belize", "guatemala city": "Guatemala",
    "san salvador": "El Salvador", "tegucigalpa": "Honduras", "managua": "Nicaragua", "san jose": "Costa Rica", "panama city": "Panama", "bogota": "Colombia",
    "quito": "Ecuador", "lima": "Peru", "la paz": "Bolivia", "sucre": "Bolivia", "santiago": "Chile", "buenos aires": "Argentina", "montevideo": "Uruguay",
    "asuncion": "Paraguay", "brasilia": "Brazil" };
  function countryOfDay(countries, n) { var c = null; (countries || []).forEach(function (x) { if (x.first_day <= n) c = x.country; }); return c; }
  function textOf(d) { return fold([d.from, d.to, d.stay, d.notes, d.terrain].join(" | ")); }

  // Returns the tallies and milestones as of day n.
  //   geo:      seed/day_geo.json (plan baseline per day: volcano, water, parks, max altitude)
  //   live:     { rides, geoLive, weather } from the robot (what actually happened), optional
  // Where a day has live data it wins; otherwise the plan stands in ("sample data until the trip").
  function asOf(plan, config, n, calories, geo, countries, live) {
    var cfg = config.secretStats || {}, days = plan.days.slice(0, Math.max(0, Math.min(n, plan.days.length)));
    var kws = (cfg.hotSpringKeywords || []).map(fold);
    var inc = cfg.hotSpringIncludeDays || [], exc = cfg.hotSpringExcludeDays || [];
    var hot = 0, borders = {}, boats = 0, rest = 0, caps = {};
    var capList = (cfg.capitals || []).map(function (c) { return { name: c, key: fold(c) }; });
    days.forEach(function (d) {
      var t = textOf(d);
      var isHot = kws.some(function (k) { return k && t.indexOf(k) >= 0; });
      if (inc.indexOf(d.day) >= 0) isHot = true;
      if (exc.indexOf(d.day) >= 0) isHot = false;
      if (isHot) hot++;
      if (d.kind === "border") borders[d.day] = true;
      if (d.kind === "boat" || /\b(ferry|boat|lancha|barco)\b/.test(t)) boats++;
      if (d.kind === "rest") rest++;
      // A capital counts when a day's start, end or stay IS that place (not merely contains the word,
      // or every "Santiago" in Mexico would count as Chile's capital)
      var dayCountry = countryOfDay(countries, d.day);
      [d.from, d.to, d.stay].forEach(function (pl) {
        var f = fold(pl).replace(/\s*\(.*$/, "").trim();
        capList.forEach(function (c) {
          if (!(f === c.key || f.indexOf(c.key + ",") === 0)) return;
          var want = CAPITAL_COUNTRY[c.key];
          if (want && dayCountry && want !== dayCountry) return;      // same name, wrong country
          caps[c.name] = true;
        });
      });
    });
    (cfg.borderExtraDays || []).forEach(function (x) { if (x <= n) borders[x] = true; });
    var kcal = (calories && calories.available && calories.cumulative_kcal && n >= 1) ? calories.cumulative_kcal[Math.min(n, calories.cumulative_kcal.length) - 1] : null;
    // Geography: a volcano within volcanoMiles of a day's start or end counts as climbed; a sea or
    // lake within waterMiles of where the day ends counts as dipped in. Distinct names.
    var volc = {}, waters = {};
    if (geo && geo.days) {
      var vMi = cfg.volcanoMiles !== undefined ? cfg.volcanoMiles : 2, wMi = cfg.waterMiles !== undefined ? cfg.waterMiles : 0.25;
      Object.keys(geo.days).forEach(function (k) {
        var dayN = Number(k); if (dayN > n) return;
        var g = geo.days[k];
        if (g.volcano && g.volcano.dist_mi <= vMi) volc[g.volcano.name] = true;
        if (g.water && g.water.dist_mi <= wMi) waters[g.water.name] = true;
      });
    }
    // ---- Tallies that merge what happened (live) over what was planned ----
    live = live || {};
    var rides = (live.rides && live.rides.days) || {}, gl = (live.geoLive && live.geoLive.days) || {}, wx = (live.weather && live.weather.days) || {};
    var highM = cfg.highAltitudeM || 3500, llamasPer = cfg.llamasPerHighDay || 20, cadence = cfg.cadenceRpm || 75, speed = cfg.planSpeedMph || 11, chainMi = cfg.chainMiles || 3000;
    var parks = {}, llamas = 0, strokes = 0, milesTotal = 0, highest = null, hottest = null, coldest = null;
    var andesFrom = (countries || []).filter(function (c) { return c.country === "Colombia"; }).map(function (c) { return c.first_day; })[0] || 222;
    for (var i = 1; i <= Math.min(n, plan.days.length); i++) {
      var d = plan.days[i - 1], g = (geo && geo.days && geo.days[i]) || {}, L = gl[i] || null, r = rides[d.date] || null, w = wx[i] || null;
      // national parks: first entry only
      ((L && L.parks) || g.parks || []).forEach(function (name) { if (!parks[name]) parks[name] = i; });
      // llamas: a fixed number for each Andean day above the altitude line
      var maxAlt = L && L.max_alt_m != null ? L.max_alt_m : (r && r.max_alt_ft ? r.max_alt_ft / 3.28084 : g.max_alt_m);
      if (i >= andesFrom && maxAlt >= highM) llamas += llamasPer;
      // pedal strokes: moving minutes x cadence (actual cadence when Garmin recorded one)
      if (r && r.moving_sec) strokes += r.moving_sec / 60 * (r.cadence || cadence);
      else if (d.plan_miles > 0) strokes += d.plan_miles / speed * 60 * cadence;
      milesTotal += r ? r.miles : (d.plan_miles || 0);
      // milestones
      // the record only from real tracks (live or the planned Komoot track), never from the coarse route profile
      var altIsRecordWorthy = !!(L && L.max_alt_m != null) || !!(r && r.max_alt_ft) || (g.alt_source === "track");
      if (maxAlt != null && altIsRecordWorthy && (!highest || maxAlt > highest.m)) highest = { m: maxAlt, day: i, place: d.to, live: !!(L || r) };
      if (w && w.tmax_f != null && (!hottest || w.tmax_f > hottest.f)) hottest = { f: w.tmax_f, day: i, place: w.place || d.to, sample: !!w.sample };
      if (w && w.tmin_f != null && (!coldest || w.tmin_f < coldest.f)) coldest = { f: w.tmin_f, day: i, place: w.place || d.to, sample: !!w.sample };
    }
    return {
      water: (cfg.litersPerDay || 5) * Math.max(0, n),
      hotSprings: hot, borders: Object.keys(borders).length, boats: boats, restDays: rest,
      capitals: Object.keys(caps).length, capitalNames: Object.keys(caps), calories: kcal,
      volcanoes: geo ? Object.keys(volc).length : null, volcanoNames: Object.keys(volc),
      waters: geo ? Object.keys(waters).length : null, waterNames: Object.keys(waters),
      parks: geo ? Object.keys(parks).length : null, parkNames: Object.keys(parks),
      llamas: geo ? llamas : null, strokes: Math.round(strokes), chains: Math.floor(milesTotal / chainMi),
      highest: highest, hottest: hottest, coldest: coldest
    };
  }
  return { asOf: asOf, fold: fold };
});
