/* Secret stats, worked out from the plan as of a day. Shared by the page and the robot (UMD).
   Nothing here needs updating by hand: keyword lists and constants live in config.secretStats. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Stats = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function textOf(d) { return fold([d.from, d.to, d.stay, d.notes, d.terrain].join(" | ")); }

  // Returns { water, hotSprings, borders, boats, restDays, capitals, calories, volcanoes, waters } as of day n.
  // geo: seed/day_geo.json (nearest volcano and shoreline per day), optional.
  function asOf(plan, config, n, calories, geo) {
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
      var places = fold([d.from, d.to, d.stay].join(" | "));
      capList.forEach(function (c) { if (places.indexOf(c.key) >= 0) caps[c.name] = true; });
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
    return {
      water: (cfg.litersPerDay || 5) * Math.max(0, n),
      hotSprings: hot, borders: Object.keys(borders).length, boats: boats, restDays: rest,
      capitals: Object.keys(caps).length, capitalNames: Object.keys(caps), calories: kcal,
      volcanoes: geo ? Object.keys(volc).length : null, volcanoNames: Object.keys(volc),
      waters: geo ? Object.keys(waters).length : null, waterNames: Object.keys(waters)
    };
  }
  return { asOf: asOf, fold: fold };
});
