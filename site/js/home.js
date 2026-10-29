/* Home page: fills every section from the data files, in the order config says, hiding any section
   whose source is broken. Re-runs when the tinker panel changes config. No dates are ever shown. */
(function () {
  "use strict";
  var Trip = window.Trip, RouteLine = window.RouteLine;
  var audio = null, playing = null;

  function fmtTime(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function titleNode(parts) {
    var h = document.createDocumentFragment();
    h.appendChild(document.createTextNode(parts.pre || ""));
    if (parts.em) { var em = document.createElement("em"); em.textContent = parts.em; h.appendChild(em); }
    return h;
  }

  function render(ctx) {
    var c = ctx.config, plan = ctx.plan, el = ctx.el, scrub = c.showDates ? function (t) { return t || ""; } : Trip.scrubDates;
    var home = document.getElementById("home");
    var sections = {};
    home.querySelectorAll("[data-section]").forEach(function (s) { sections[s.getAttribute("data-section")] = s; });

    // Section order from config
    (c.home.sectionOrder || []).forEach(function (name) { if (sections[name]) home.appendChild(sections[name]); });

    if (!plan || !plan.days || !plan.days.length) {
      // Plan missing entirely (should never happen: the seed is always bundled). Show only the title.
      Object.keys(sections).forEach(function (k) { if (k !== "banner") sections[k].hidden = true; });
      return;
    }

    var day = ctx.day, d = Trip.day(plan, day), total = plan.days.length;
    var live = ctx.live;
    var pos = ctx.data.position, posOK = live && ctx.ok("position") && pos && pos.available;
    var ridesOK = ctx.connected("rides") && ctx.ok("rides") && ctx.data.rides && ctx.data.rides.days;
    var rides = ridesOK ? ctx.data.rides.days : null;
    var igOK = ctx.connected("instagram") && ctx.ok("instagram") && ctx.data.instagram && ctx.data.instagram.items && ctx.data.instagram.items.length;

    /* ---- Banner ---- */
    var info = document.getElementById("banner-info");
    info.textContent = (c.site.tagline + " · DAY " + day + " OF " + total).toUpperCase();
    var svg = document.getElementById("banner-line");
    var markerBox = document.getElementById("banner-marker"), placeEl = document.getElementById("banner-place");
    var fraction = Trip.fractionAtDay(plan, day);
    var markerFraction = posOK ? pos.route_fraction : fraction;
    var showMarker = posOK || !live;      // live: only with a real (delayed) position; test: the plan position
    var drawn = ctx.route ? RouteLine.drawProgress(svg, ctx.route.points, posOK ? Math.max(fraction, 0) : fraction, { strokePx: c.home.routeStrokePx, markerFraction: markerFraction, marker: showMarker }) : null;
    function placeMarker() {
      if (!drawn || !drawn.marker || !showMarker) { markerBox.hidden = true; return; }
      var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      var px = (drawn.marker[0] - vb.x) / vb.width * r.width, py = (drawn.marker[1] - vb.y) / vb.height * r.height;
      markerBox.style.left = px + "px"; markerBox.style.top = py + "px";
      markerBox.classList.toggle("flip", px > r.width * 0.72);
      markerBox.hidden = false;
    }
    placeEl.textContent = posOK ? [pos.place, pos.country].filter(Boolean).join(", ").toUpperCase() : (d.to || "").toUpperCase();
    placeMarker();
    window.addEventListener("resize", placeMarker);

    var counters = document.getElementById("counters"), L = c.home.counters || {};
    counters.textContent = "";
    var countriesIn = Trip.countriesEntered(ctx.countries, day), countriesTotal = c.trip.totalCountries || ctx.countries.length;
    var ridden = rides ? Trip.ridesThrough(plan, rides, day) : null;
    var miles = ridden ? ridden.miles : Trip.plannedMilesThrough(plan, day);
    var climb = ridden ? ridden.climb_ft : Trip.plannedClimbThrough(plan, day);
    var everests = (climb / (c.trip.everestFt || 29032)).toFixed(1);
    function counter(num, small, label) {
      var n = el("div", { class: "num", text: num });
      if (small) n.appendChild(el("small", { text: small }));
      counters.appendChild(el("div", { class: "counter" }, [n, el("div", { class: "lbl", text: label })]));
    }
    counter(String(day), "", L.days || "DAYS ON THE ROAD");
    counter(String(countriesIn), "/" + countriesTotal, L.countries || "COUNTRIES");
    counter(Trip.fmtInt(miles), "", rides ? (L.miles || "MILES RIDDEN") : (L.milesPlan || "MILES · PLAN"));
    counter(Trip.fmtInt(climb), "", (rides ? (L.climb || "FT CLIMBED") : (L.climbPlan || "FT CLIMBED · PLAN")) + " · " + everests + " " + (L.everests || "EVERESTS"));
    if (posOK && pos.plan_day_at_position) counter(Trip.fmtSigned(pos.plan_day_at_position - day), "", L.vsPlan || "DAYS VS. THE PLAN");
    else if (!live) counter("±0", "", L.vsPlan || "DAYS VS. THE PLAN");
    document.getElementById("banner-note").textContent = showMarker ? (c.home.positionNote || "") : "";

    /* ---- Latest photo ---- */
    var newest = igOK ? ctx.data.instagram.items[0] : null;
    var newestDay = newest ? Trip.dayOfTimestamp(plan, newest.timestamp, ctx.offset) : NaN;
    var tagDay = (live && newest && newestDay >= 1 && newestDay <= total) ? newestDay : day;
    var td = Trip.day(plan, tagDay);
    var photo = document.getElementById("latest-photo");
    photo.textContent = "";
    if (newest && newest.media_url) {
      photo.appendChild(el("a", { href: newest.permalink || c.links.instagram, target: "_blank", rel: "noopener" }, [el("img", { src: newest.media_url, alt: scrub(newest.caption || "").slice(0, 120) || "Latest photo" })]));
      photo.appendChild(el("span", { class: "tag", text: Trip.dayTag(td) }));
    } else photo.appendChild(ctx.photoPlaceholder(Trip.dayTag(td)));
    document.getElementById("latest-kicker").textContent = (c.copy.latest.kicker || "LATEST") + " · DAY " + tagDay;
    var h2 = document.getElementById("latest-title"); h2.textContent = ""; h2.appendChild(titleNode(Trip.dayTitle(td)));
    var cap = document.getElementById("latest-caption"), capNote = document.getElementById("latest-caption-note");
    if (newest && newest.caption) { cap.textContent = scrub(newest.caption); capNote.hidden = true; }
    else { cap.textContent = scrub(td.notes) || ""; capNote.textContent = c.copy.latest.captionFallbackNote || ""; capNote.hidden = !cap.textContent; }
    var chips = document.getElementById("latest-chips"); chips.textContent = "";
    var ride = rides ? Trip.rideForDay(plan, rides, tagDay) : null;
    if (td.plan_miles > 0) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.plan || "PLAN") + " " + Math.round(td.plan_miles) + " MI" }));
    if (ride) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.rode || "RODE") + " " + Math.round(ride.miles) + " MI" }));
    var climbDay = ride ? ride.climb_ft : td.plan_climb_ft;
    if (climbDay > 0) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.climb || "CLIMB") + " " + Trip.fmtInt(climbDay) + " FT" }));

    var now = document.getElementById("now-band"); now.textContent = "";
    if (showMarker) {
      var where = posOK ? [pos.place, pos.country].filter(Boolean).join(", ") : d.to;
      now.appendChild(el("span", { class: "mono", text: (c.copy.latest.now || "NOW") + " · " + (where || "").toUpperCase() }));
      var w = ctx.data.weather;
      if (live && w && w.available && ctx.ok("weather")) {
        var line = el("span", { class: "mono" });
        var tick = function () {
          var localMs = Date.now() + (w.utc_offset_seconds || 0) * 1000, dt = new Date(localMs);
          var hh = dt.getUTCHours(), mm = String(dt.getUTCMinutes()).padStart(2, "0"), ampm = hh >= 12 ? "PM" : "AM";
          line.textContent = (c.copy.latest.localTime || "LOCAL TIME") + " " + ((hh % 12) || 12) + ":" + mm + " " + ampm + " · " + (c.copy.latest.weather || "WEATHER") + " " + w.temp_f + "°F " + (w.text || "");
        };
        tick(); setInterval(tick, 30000);
        now.appendChild(line);
      }
      now.appendChild(el("p", { text: Trip.nextUp(plan, day) }));
      now.hidden = false;
    } else now.hidden = true;

    /* ---- Map + dispatch ---- */
    var mapOK = !!(ctx.americas && ctx.route);
    var dispOK = ctx.ok("dispatches") && ctx.data.dispatches && ctx.data.dispatches.items && ctx.data.dispatches.items.length;
    var mapCard = document.getElementById("map-card"), dispatch = document.getElementById("dispatch");
    sections.mapDispatch.hidden = !(mapOK || dispOK);
    mapCard.hidden = !mapOK; dispatch.hidden = !dispOK;
    document.getElementById("map-dispatch").classList.toggle("two-col", mapOK && dispOK);
    if (mapOK) window.SiteMap.draw(document.getElementById("map"), {
      americas: ctx.americas, route: ctx.route.points, fraction: fraction,
      position: posOK ? [pos.lat, pos.lon] : (!live ? Trip.pointAtFraction(ctx.route.points, fraction) : null),
      positionLabel: posOK ? (pos.place || "") : (!live ? d.to : ""), copy: c.copy.map || {}, legend: document.getElementById("map-legend"), note: showMarker ? c.home.positionNote : ""
    });
    if (dispOK) renderDispatch(ctx, dispatch, scrub);

    /* ---- The days ---- */
    var cards = document.getElementById("day-cards"); cards.textContent = "";
    var count = Math.max(1, Math.min(12, Number(c.home.dayCards) || 5));
    var first = Math.max(1, day - count + 1);
    for (var n = first; n <= day; n++) {
      var dd = plan.days[n - 1], posts = ctx.postsForDay(n), p0 = posts[0];
      var ph = el("div", { class: "photo" });
      if (p0 && p0.media_url) ph.appendChild(el("img", { src: p0.media_url, alt: scrub(p0.caption || "").slice(0, 80) || ("Day " + n) }));
      else ph.appendChild(ctx.photoPlaceholder("", true));
      var r = rides ? Trip.rideForDay(plan, rides, n) : null;
      var stats = el("div", { class: "stats" });
      if (dd.plan_miles > 0) stats.appendChild(el("span", { text: (c.copy.latest.plan || "PLAN") + " " + Math.round(dd.plan_miles) + " MI" }));
      if (r) stats.appendChild(el("span", { text: (c.copy.latest.rode || "RODE") + " " + Math.round(r.miles) + " MI" }));
      var cl = r ? r.climb_ft : dd.plan_climb_ft;
      if (cl > 0) stats.appendChild(el("span", { text: (c.copy.latest.climb || "CLIMB") + " " + Trip.fmtInt(cl) + " FT" }));
      var h3 = el("h3"); h3.appendChild(titleNode(Trip.dayTitle(dd)));
      cards.appendChild(el("a", { class: "card day-card", href: p0 && p0.permalink ? p0.permalink : ctx.withDay("days.html") + "#day-" + n, target: p0 && p0.permalink ? "_blank" : null, rel: "noopener" }, [ph, el("span", { class: "mono", text: "DAY " + n }), h3, stats]));
    }

    /* ---- Videos (off by default) ---- */
    var vcfg = c.sections && c.sections.videos, v = ctx.data.videos;
    var vOK = vcfg && vcfg.enabled && ctx.ok("videos") && v && v.items && v.items.length;
    sections.videos.hidden = !vOK;
    if (vOK) {
      document.getElementById("video-title").textContent = scrub(v.items[0].title);
      var frame = document.getElementById("video-frame"); frame.textContent = "";
      frame.appendChild(el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + v.items[0].id, title: v.items[0].title, allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowfullscreen: "" }));
    }
  }

  function renderDispatch(ctx, box, scrub) {
    var c = ctx.config, plan = ctx.plan, el = ctx.el, items = ctx.data.dispatches.items, copy = c.copy.dispatch || {};
    var latest = items[0];
    function titleFor(item) {
      var n = Trip.dayOfTimestamp(plan, item.published_at, ctx.offset);
      if (n >= 1 && n <= plan.days.length) { var dd = plan.days[n - 1]; return { pre: "Day " + n + ": ", em: dd.to, day: n }; }
      var m = /^(.*?)\s*(?:—|–|-|:)\s*(.+)$/.exec(item.title || "");
      return m ? { pre: m[1] + ": ", em: m[2] } : { pre: item.title || "Dispatch", em: "" };
    }
    if (!audio) { audio = document.createElement("audio"); audio.preload = "none"; document.body.appendChild(audio); }
    box.textContent = "";
    var t = titleFor(latest);
    box.appendChild(el("p", { class: "kicker", text: copy.kicker || "LATEST DISPATCH" }));
    var h2 = el("h2"); h2.appendChild(titleNode(t)); box.appendChild(h2);

    var playBtn = el("button", { class: "play", type: "button", "aria-label": "Play" , html: '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>' });
    var bars = el("div", { class: "bars", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 0 });
    for (var i = 0; i < 40; i++) { var b = el("span"); b.style.height = (20 + Math.abs(Math.sin(i * 1.7)) * 70) + "%"; bars.appendChild(b); }
    box.appendChild(el("div", { class: "player" }, [playBtn, bars]));
    var meta = el("p", { class: "meta", text: "[" + fmtTime(latest.duration_sec) + "] · " + (copy.recorded || "RECORDED ON THE ROAD") });
    box.appendChild(meta);
    box.appendChild(el("p", { class: "blurb", text: scrub(latest.description) || copy.blurb || "" }));
    box.appendChild(el("a", { class: "applink", href: ctx.listenHref(), target: "_blank", rel: "noopener", text: copy.appLink || "Listen in your podcast app" }));

    var current = latest;
    function setPlayIcon(btn, on) { btn.innerHTML = on ? '<svg viewBox="0 0 20 20"><path d="M4 3h4v14H4zM12 3h4v14h-4z"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>'; btn.setAttribute("aria-label", on ? "Pause" : "Play"); }
    function toggle(item, btn) {
      if (playing && playing.item === item && !audio.paused) { audio.pause(); return; }
      if (!playing || playing.item !== item) { audio.src = item.audio; current = item; }
      if (playing && playing.btn !== btn) setPlayIcon(playing.btn, false);
      playing = { item: item, btn: btn };
      audio.play().catch(function () {});
    }
    audio.onplay = function () { if (playing) setPlayIcon(playing.btn, true); };
    audio.onpause = function () { if (playing) setPlayIcon(playing.btn, false); };
    audio.ontimeupdate = function () {
      if (!playing || playing.item !== latest) return;
      var f = audio.duration ? audio.currentTime / audio.duration : 0;
      Array.prototype.forEach.call(bars.children, function (s, i) { s.classList.toggle("on", i / 40 < f); });
      bars.setAttribute("aria-valuenow", Math.round(f * 100));
      meta.textContent = "[" + fmtTime(audio.currentTime) + " / " + fmtTime(audio.duration || latest.duration_sec) + "] · " + (copy.recorded || "RECORDED ON THE ROAD");
    };
    playBtn.addEventListener("click", function () { toggle(latest, playBtn); });
    bars.addEventListener("click", function (e) {
      if (!playing || playing.item !== latest || !audio.duration) return;
      var r = bars.getBoundingClientRect(); audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    });

    var earlier = items.slice(1, 4);
    if (earlier.length) {
      box.appendChild(el("p", { class: "kicker", text: copy.earlier || "EARLIER ENTRIES" }));
      var ul = el("ul", { class: "earlier" });
      earlier.forEach(function (item) {
        var btn = el("button", { class: "play small", type: "button", "aria-label": "Play", html: '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>' });
        btn.addEventListener("click", function () { toggle(item, btn); });
        var tt = titleFor(item);
        var label = el("div"); label.appendChild(el("span", { class: "mono", text: (tt.day ? "DAY " + tt.day + " · " : "") + "[" + fmtTime(item.duration_sec) + "]" }));
        var tn = el("span", { class: "t" }); tn.textContent = (tt.pre + tt.em).replace(/:\s*$/, ""); label.appendChild(tn);
        ul.appendChild(el("li", {}, [btn, label]));
      });
      box.appendChild(ul);
    }
  }

  window.Site.ready.then(function (ctx) {
    if (!ctx.config) return;
    render(ctx);
    ctx.onChange(function () { render(ctx); });
  });
})();
