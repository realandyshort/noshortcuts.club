/* All the days, section by section. Plan numbers, plus ridden numbers once rides are connected.
   Days already ridden get a tick, today is highlighted. No dates. */
(function () {
  "use strict";
  var Trip = window.Trip;
  function render(ctx) {
    var c = ctx.config, plan = ctx.plan, el = ctx.el;
    var root = document.getElementById("days-sections"); root.textContent = "";
    if (!plan) return;
    var scrub = c.showDates ? function (t) { return t || ""; } : Trip.scrubDates;
    var ridesOK = ctx.connected("rides") && ctx.ok("rides") && ctx.data.rides && ctx.data.rides.days;
    var rides = ridesOK ? ctx.data.rides.days : null;
    var bySection = {};
    plan.days.forEach(function (d) { (bySection[d.section] = bySection[d.section] || []).push(d); });
    Object.keys(bySection).sort(function (a, b) { return a - b; }).forEach(function (s) {
      var days = bySection[s];
      var miles = days.reduce(function (t, d) { return t + (d.plan_miles || 0); }, 0);
      root.appendChild(el("h2", { text: "Section " + s + ": " + days[0].from + " to " + days[days.length - 1].to }));
      root.appendChild(el("p", { class: "mono", text: "DAYS " + days[0].day + " TO " + days[days.length - 1].day + " · " + Trip.fmtInt(miles) + " MI PLANNED" }));
      var table = el("table", { class: "days-table" });
      var head = el("tr");
      ["DAY", "WHERE", "", (c.copy.latest.plan || "PLAN") + " MI", (c.copy.latest.climb || "CLIMB") + " FT"].concat(rides ? [(c.copy.latest.rode || "RODE") + " MI"] : []).forEach(function (h) { head.appendChild(el("th", { text: h })); });
      table.appendChild(el("thead", {}, [head]));
      var body = el("tbody");
      days.forEach(function (d) {
        var tr = el("tr", { id: "day-" + d.day, class: (d.day < ctx.day ? "done " : "") + (d.day === ctx.day ? "today " : "") + (d.kind === "rest" ? "rest" : "") });
        tr.appendChild(el("td", { class: "n", text: String(d.day) }));
        var where = el("td"); var t = Trip.dayTitle(d); where.appendChild(document.createTextNode(t.pre)); if (t.em) { var em = el("em", { text: t.em }); where.appendChild(em); }
        if (d.terrain) where.appendChild(el("div", { class: "kind", text: scrub(d.terrain) }));
        tr.appendChild(where);
        tr.appendChild(el("td", { class: "kind", text: d.kind === "ride" ? "" : d.kind }));
        tr.appendChild(el("td", { class: "num", text: d.plan_miles > 0 ? Math.round(d.plan_miles) : "" }));
        tr.appendChild(el("td", { class: "num", text: d.plan_climb_ft > 0 ? Trip.fmtInt(d.plan_climb_ft) : "" }));
        if (rides) { var r = rides[d.date]; tr.appendChild(el("td", { class: "num", text: r ? Math.round(r.miles) : "" })); }
        body.appendChild(tr);
      });
      table.appendChild(body);
      root.appendChild(table);
    });
    if (location.hash) { var target = document.querySelector(location.hash); if (target) target.scrollIntoView(); }
  }
  window.Site.ready.then(function (ctx) { if (!ctx.config) return; render(ctx); ctx.onChange(function () { render(ctx); }); });
})();
