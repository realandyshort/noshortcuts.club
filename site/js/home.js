/* Home page: fills every section from the data files, in the order config says, hiding any section
   whose source is broken. Re-runs when the day changes (time travel, test mode) or when the tinker
   panel changes config. Archived days (archive/days/NNN.json) supply photos and dispatches for days
   that are not today. No dates are ever shown. */
(function () {
  "use strict";
  var Trip = window.Trip, RouteLine = window.RouteLine;
  var audio = null, playing = null, renderSeq = 0;

  function fmtTime(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function titleNode(parts) {
    var h = document.createDocumentFragment();
    h.appendChild(document.createTextNode(parts.pre || ""));
    if (parts.em) { var em = document.createElement("em"); em.textContent = parts.em; h.appendChild(em); }
    return h;
  }
  function isRest(d) { return d && (d.kind === "rest" || (d.from === d.to && !(Number(d.plan_miles) > 0))); }

  // The photo for a day: a live Instagram post from that day, else the archived one, else null.
  function photoFor(ctx, n, archive) {
    var live = ctx.postsForDay(n)[0];
    if (live && live.media_url) return { url: live.media_url, link: live.permalink, caption: live.caption || "", timestamp: live.timestamp };
    var a = archive && archive.instagram && archive.instagram[0];
    if (a && a.media_url) return { url: a.media_url, link: a.permalink, caption: a.caption || "", timestamp: a.timestamp };
    return null;
  }

  // "POSTED 3 DAYS AGO" (or the full date once showDates is on). Never a trip date before then.
  function postedLine(c, ts) {
    var L = c.copy.latest || {}, t = ts ? Date.parse(ts) : NaN;
    if (isNaN(t)) return L.kicker || "LATEST";
    if (c.showDates) return (L.posted || "POSTED") + " " + new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
    var days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return (L.posted || "POSTED") + " " + (L.today || "TODAY");
    if (days === 1) return (L.posted || "POSTED") + " " + (L.yesterday || "YESTERDAY");
    return (L.posted || "POSTED") + " " + days + " " + (L.ago || "DAYS AGO");
  }

  // One day as a card: photo (live post, else the archive), DAY n, title, plan/ridden stats, the caption
  // or the plan's notes, and a Travel button. Used by the days mosaic (banner.js) when a tile is opened.
  // The archive for that day is fetched on the spot; the card fills in when it arrives.
  function dayCard(ctx, n, opts) {
    opts = opts || {};
    var c = ctx.config, plan = ctx.plan, el = ctx.el, scrub = c.showDates ? function (t) { return t || ""; } : Trip.scrubDates;
    var dd = plan.days[n - 1], F = c.copy.flips || {}, L = c.copy.latest || {};
    var ph = el("div", { class: "photo" }), words = el("div", { class: "words" });
    var card = el("div", { class: "card day-card open" }, [ph, words]);
    function fill(archive) {
      ph.textContent = ""; words.textContent = "";
      var p0 = photoFor(ctx, n, archive);
      if (p0) ph.appendChild(el("a", { href: p0.link || "#", target: "_blank", rel: "noopener" }, [el("img", { src: p0.url, alt: scrub(p0.caption).slice(0, 80) || ("Day " + n) })]));
      else ph.appendChild(ctx.photoPlaceholder("", true));
      var rides = ctx.connected("rides") && ctx.ok("rides") && ctx.data.rides && ctx.data.rides.days ? ctx.data.rides.days : null;
      var r = rides ? Trip.rideForDay(plan, rides, n) : (archive && archive.ride) || null;
      var stats = el("div", { class: "stats" });
      if (dd.plan_miles > 0) stats.appendChild(el("span", { text: (L.plan || "PLAN") + " " + Math.round(dd.plan_miles) + " MI" }));
      if (r) stats.appendChild(el("span", { text: (L.rode || "RODE") + " " + Math.round(r.miles) + " MI" }));
      var cl = r ? r.climb_ft : dd.plan_climb_ft;
      if (cl > 0) stats.appendChild(el("span", { text: (L.climb || "CLIMB") + " " + Trip.fmtInt(cl) + " FT" }));
      var h3 = el("h3"); h3.appendChild(titleNode(Trip.dayTitle(dd)));
      words.appendChild(el("span", { class: "mono", text: "DAY " + n + (dd.section ? " · SEGMENT " + dd.section : "") }));
      words.appendChild(h3); words.appendChild(stats);
      var text = p0 && p0.caption ? scrub(p0.caption) : scrub(dd.notes || "");
      if (text) words.appendChild(el("p", { class: "blurb", text: text.length > 320 ? text.slice(0, 317) + "…" : text }));
      var disp = archive && archive.dispatches && archive.dispatches[0];
      if (disp && disp.title) words.appendChild(el("span", { class: "mono", text: (c.copy.dispatch.kicker || "DISPATCH") + " · " + scrub(disp.title).toUpperCase() }));
      var row = el("div", { class: "row" });
      if (opts.onTravel && n !== ctx.day) { var tb = el("button", { type: "button", class: "btn btn-small btn-persimmon", text: F.travel || "Travel to this day" }); tb.addEventListener("click", function () { opts.onTravel(n); }); row.appendChild(tb); }
      if (opts.onClose) { var cb = el("button", { type: "button", class: "btn btn-small btn-outline-cream", text: F.closeDay || "Close" }); cb.addEventListener("click", function () { opts.onClose(); }); row.appendChild(cb); }
      words.appendChild(row);
    }
    fill(null);
    if (!(ctx.live && n === ctx.todayClamped)) ctx.archive(n).then(function (a) { if (a && card.isConnected) fill(a); }).catch(function () {});
    return card;
  }
  window.Home = { dayCard: dayCard };

  function render(ctx) {
    var seq = ++renderSeq;
    var c = ctx.config, plan = ctx.plan;
    if (!plan || !plan.days || !plan.days.length) { renderNow(ctx, {}); return; }
    var day = ctx.day, count = Math.max(1, Math.min(12, Number(c.home.dayCards) || 5));
    var wanted = [day];
    for (var n = Math.max(1, day - count + 1); n < day; n++) wanted.push(n);
    // Archives only matter for days other than the live today (today is still being written)
    var fetches = wanted.map(function (n) { return (ctx.live && n === ctx.todayClamped) ? Promise.resolve(null) : ctx.archive(n); });
    Promise.all(fetches).then(function (results) {
      if (seq !== renderSeq) return;           // a newer render started meanwhile (fast scrubbing)
      var archives = {}; wanted.forEach(function (n, i) { archives[n] = results[i]; });
      renderNow(ctx, archives);
    });
  }

  function renderNow(ctx, archives) {
    var c = ctx.config, plan = ctx.plan, el = ctx.el, scrub = c.showDates ? function (t) { return t || ""; } : Trip.scrubDates;
    var home = document.getElementById("home");
    var sections = {};
    home.querySelectorAll("[data-section]").forEach(function (s) { sections[s.getAttribute("data-section")] = s; });
    (c.home.sectionOrder || []).forEach(function (name) { if (sections[name]) home.appendChild(sections[name]); });
    if (!plan || !plan.days || !plan.days.length) { Object.keys(sections).forEach(function (k) { if (k !== "banner") sections[k].hidden = true; }); return; }

    var day = ctx.day, d = Trip.day(plan, day), total = plan.days.length;
    var live = ctx.live, travelling = !!ctx.travelDay;
    var archive = archives[day] || null;
    var pos = ctx.data.position, posOK = live && ctx.ok("position") && pos && pos.available;
    var ridesOK = ctx.connected("rides") && ctx.ok("rides") && ctx.data.rides && ctx.data.rides.days;
    var rides = ridesOK ? ctx.data.rides.days : null;
    var igOK = ctx.connected("instagram") && ctx.ok("instagram") && ctx.data.instagram && ctx.data.instagram.items && ctx.data.instagram.items.length;

    /* ---- Banner ---- */
    document.getElementById("banner-info").textContent = (travelling ? (c.copy.travel.label || "TIME TRAVEL · DAY") + " " + day + " OF " + total : c.site.tagline + " · DAY " + day + " OF " + total).toUpperCase();
    var back = document.getElementById("travel-back");
    back.textContent = c.copy.travel.back || "Back to today";
    back.hidden = !travelling;
    if (!back._wired) { back._wired = true; back.addEventListener("click", function () { window.Banner.closeFlip(); ctx.setDay(ctx.homeDay || ctx.todayClamped); }); }

    var svg = document.getElementById("banner-line");
    var markerBox = document.getElementById("banner-marker"), placeEl = document.getElementById("banner-place");
    var fraction = Trip.fractionAtDay(plan, day);
    var markerFraction = posOK ? pos.route_fraction : fraction;
    var showMarker = posOK || !live;
    var drawn = ctx.route ? RouteLine.drawProgress(svg, ctx.route.points, fraction, { strokePx: c.home.routeStrokePx, markerFraction: markerFraction, marker: showMarker }) : null;
    function placeMarker(markerPt) {
      var m = markerPt || (drawn && drawn.marker);
      if (!m || !showMarker) { markerBox.hidden = true; return; }
      var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      var px = (m[0] - vb.x) / vb.width * r.width, py = (m[1] - vb.y) / vb.height * r.height;
      markerBox.style.left = px + "px"; markerBox.style.top = py + "px";
      markerBox.classList.toggle("flip", px > r.width * 0.72);
      markerBox.classList.toggle("live", !!posOK);   // the tracker's own position: a pulsing ring says "live"
      if (window.Rider) {                               // Andy on the bike rides the line (with the potato until Los Angeles)
        var potato = window.Rider.hasPotato(ctx, day);
        if (markerBox._potato !== potato) {
          markerBox._potato = potato;
          var old = markerBox.querySelector(".rider-box, .dot"), box = document.createElement("div");
          box.className = "rider-box"; box.appendChild(window.Rider.svg({ potato: potato }));
          if (old) old.replaceWith(box); else markerBox.insertBefore(box, markerBox.firstChild);
          markerBox.classList.add("has-rider");
        }
      }
      markerBox.hidden = false;
    }
    placeEl.textContent = posOK ? [pos.place, pos.country].filter(Boolean).join(", ").toUpperCase() : (d.to || "").toUpperCase();
    placeMarker();
    if (!ctx._markerResize) { ctx._markerResize = true; window.addEventListener("resize", function () { placeMarker(); }); }
    ctx.hideMarkerDuringMorph = function (hide) { markerBox.style.visibility = hide ? "hidden" : ""; };

    var counters = document.getElementById("counters"), L = c.home.counters || {};
    counters.textContent = "";
    var countriesIn = Trip.countriesEntered(ctx.countries, day), countriesTotal = c.trip.totalCountries || ctx.countries.length;
    // Ridden totals only once there is at least one recorded ride through this day; otherwise the
    // plan numbers, labelled as such (also what a simulated or time-travelled day without rides shows).
    var ridden = rides ? Trip.ridesThrough(plan, rides, day) : null;
    if (ridden && ridden.days === 0) ridden = null;
    var miles = ridden ? ridden.miles : Trip.plannedMilesThrough(plan, day);
    var climb = ridden ? ridden.climb_ft : Trip.plannedClimbThrough(plan, day);
    var everests = (climb / (c.trip.everestFt || 29032)).toFixed(1);
    var counterEls = {}, numbers = {};
    function counter(key, num, small, label) {
      var n = el("div", { class: "num", text: num });
      if (small) n.appendChild(el("small", { text: small }));
      var box = el("div", { class: "counter", "data-counter": key }, [n, el("div", { class: "lbl", text: label })]);
      counters.appendChild(box); counterEls[key] = box; numbers[key] = num;
    }
    counter("days", String(day), "", L.days || "DAYS ON THE ROAD");
    counter("countries", String(countriesIn), "/" + countriesTotal, L.countries || "COUNTRIES");
    counter("miles", Trip.fmtInt(miles), "", ridden ? (L.miles || "MILES RIDDEN") : (L.milesPlan || "MILES · PLAN"));
    counter("climb", Trip.fmtInt(climb), "", (ridden ? (L.climb || "FT CLIMBED") : (L.climbPlan || "FT CLIMBED · PLAN")) + " · " + everests + " " + (L.everests || "EVERESTS"));
    if (posOK && pos.plan_day_at_position) counter("vsPlan", Trip.fmtSigned(pos.plan_day_at_position - day), "", L.vsPlan || "DAYS VS. THE PLAN");
    else if (!live) counter("vsPlan", "±0", "", L.vsPlan || "DAYS VS. THE PLAN");
    document.getElementById("banner-note").textContent = showMarker && !travelling ? (c.home.positionNote || "") : "";

    /* ---- Latest photo (today: newest post; another day: that day's photo) ---- */
    // Today, and a simulated day (?day=), show the newest post, as the brief asks; a time-travelled
    // day shows that day's own photo from the archive.
    var newest = igOK ? ctx.data.instagram.items[0] : null;
    var newestDay = newest ? Trip.dayOfTimestamp(plan, newest.timestamp, ctx.offset) : NaN;
    var useNewest = live || (ctx.testDay && !travelling);
    var tagDay = (live && newest && newestDay >= 1 && newestDay <= total) ? newestDay : day;
    var td = Trip.day(plan, tagDay);
    var shot = useNewest ? (newest && newest.media_url ? { url: newest.media_url, link: newest.permalink, caption: newest.caption || "", timestamp: newest.timestamp } : null) : photoFor(ctx, day, archive);
    var photo = document.getElementById("latest-photo");
    photo.textContent = "";
    if (shot) {
      var img = ctx.fittedPhoto(photo, shot.url, scrub(shot.caption).slice(0, 120) || "Photo from day " + tagDay);
      photo.appendChild(el("a", { href: shot.link || c.links.instagram, target: "_blank", rel: "noopener" }, [img]));
      photo.appendChild(el("span", { class: "tag", text: Trip.dayTag(td) }));
      // Instagram's picture addresses expire after a while. If this one will not load, try the next
      // newest post (once), and failing that show the placeholder rather than a broken picture.
      img.addEventListener("error", function () {
        var items = (igOK && ctx.data.instagram.items) || [], alt = null;
        for (var i = 0; i < items.length && !alt; i++) if (items[i].media_url && items[i].media_url !== shot.url) alt = items[i];
        photo.textContent = "";
        if (alt && !photo._retried) {
          photo._retried = true;
          var img2 = ctx.fittedPhoto(photo, alt.media_url, scrub(alt.caption || "").slice(0, 120));
          img2.addEventListener("error", function () { photo.textContent = ""; photo.appendChild(ctx.photoPlaceholder(Trip.dayTag(td))); });
          photo.appendChild(el("a", { href: alt.permalink || c.links.instagram, target: "_blank", rel: "noopener" }, [img2]));
          photo.appendChild(el("span", { class: "tag", text: Trip.dayTag(td) }));
        } else photo.appendChild(ctx.photoPlaceholder(Trip.dayTag(td)));
      });
    } else photo.appendChild(ctx.photoPlaceholder(Trip.dayTag(td)));
    // Under the picture: when it was posted, then the caption as written (the day tag is on the picture)
    var kick = document.getElementById("latest-kicker"), cap = document.getElementById("latest-caption"), capNote = document.getElementById("latest-caption-note");
    if (shot) {
      kick.textContent = postedLine(c, shot.timestamp);
      cap.textContent = scrub(shot.caption || ""); cap.hidden = !cap.textContent; capNote.hidden = true;
    } else {
      kick.textContent = ((travelling ? (c.copy.travel.label || "TIME TRAVEL · DAY") : "DAY") + " " + tagDay).toUpperCase();
      cap.hidden = false; cap.textContent = scrub(td.notes) || "";
      capNote.textContent = (travelling && !archive) ? (c.copy.travel.plainDay || "") : (c.copy.latest.captionFallbackNote || "");
      capNote.hidden = !cap.textContent && !travelling;
    }
    var chips = document.getElementById("latest-chips"); chips.textContent = "";
    var ride = rides ? Trip.rideForDay(plan, rides, tagDay) : (archive && archive.ride) || null;
    if (td.plan_miles > 0) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.plan || "PLAN") + " " + Math.round(td.plan_miles) + " MI" }));
    if (ride) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.rode || "RODE") + " " + Math.round(ride.miles) + " MI" }));
    var climbDay = ride ? ride.climb_ft : td.plan_climb_ft;
    if (climbDay > 0) chips.appendChild(el("span", { class: "chip", text: (c.copy.latest.climb || "CLIMB") + " " + Trip.fmtInt(climbDay) + " FT" }));

    // The black "next up" box: where the ride is now (when the tracker says), then what the plan
    // says comes next. It always shows the plan line, so the box is never empty.
    var now = document.getElementById("now-band"); now.textContent = "";
    if (showMarker) {
      var where = posOK ? [pos.place, pos.country].filter(Boolean).join(", ") : (archive && archive.position && archive.position.place) || d.to;
      now.appendChild(el("span", { class: "mono", text: (travelling ? "THEN" : (c.copy.latest.now || "NOW")) + " · " + (where || "").toUpperCase() }));
      var w = ctx.data.weather;
      if (live && w && w.available && ctx.ok("weather")) {
        var line = el("span", { class: "mono" });
        var tick = function () {
          var dt = new Date(Date.now() + (w.utc_offset_seconds || 0) * 1000);
          var hh = dt.getUTCHours(), mm = String(dt.getUTCMinutes()).padStart(2, "0"), ampm = hh >= 12 ? "PM" : "AM";
          line.textContent = (c.copy.latest.localTime || "LOCAL TIME") + " " + ((hh % 12) || 12) + ":" + mm + " " + ampm + " · " + (c.copy.latest.weather || "WEATHER") + " " + w.temp_f + "°F " + (w.text || "");
        };
        tick(); if (ctx._tick) clearInterval(ctx._tick); ctx._tick = setInterval(tick, 30000);
        now.appendChild(line);
      } else if (archive && archive.weather && archive.weather.temp_f !== undefined) {
        now.appendChild(el("span", { class: "mono", text: (c.copy.latest.weather || "WEATHER") + " " + archive.weather.temp_f + "°F " + (archive.weather.text || "") }));
      }
    }
    now.appendChild(el("p", { text: Trip.nextUp(plan, day) }));
    // Phones: the plan chips sit inside the black box (css shows one set or the other)
    var inChips = el("div", { class: "chips chips-in" });
    Array.prototype.forEach.call(chips.children, function (ch) { inChips.appendChild(ch.cloneNode(true)); });
    if (inChips.children.length) now.appendChild(inChips);
    now.hidden = false;
    document.getElementById("now-card").hidden = false;

    /* ---- Map (beside the photo) and the dispatch panel ---- */
    var mapOK = !!(ctx.americas && ctx.route);
    var dispOK = ctx.ok("dispatches") && ctx.data.dispatches && ctx.data.dispatches.items && ctx.data.dispatches.items.length;
    var archDisp = archive && archive.dispatches && archive.dispatches.length ? archive.dispatches : null;
    var mapCard = document.getElementById("map-card"), dispatch = document.getElementById("dispatch");
    mapCard.hidden = !mapOK;
    document.getElementById("latest-grid").classList.toggle("single", !mapOK);
    if (sections.dispatch) sections.dispatch.hidden = !(dispOK || archDisp);
    if (mapOK) window.SiteMap.draw(document.getElementById("map"), {
      americas: ctx.americas, route: ctx.route.points, fraction: fraction,
      position: posOK ? [pos.lat, pos.lon] : (!live ? ((archive && archive.position) ? [archive.position.lat, archive.position.lon] : Trip.pointAtFraction(ctx.route.points, fraction)) : null),
      positionLabel: posOK ? (pos.place || "") : (!live ? ((archive && archive.position && archive.position.place) || d.to) : ""), live: !!posOK, potato: !!(window.Rider && window.Rider.hasPotato(ctx, day)), copy: c.copy.map || {}, legend: document.getElementById("map-legend"), note: showMarker && !travelling ? c.home.positionNote : ""
    });
    if (dispOK || archDisp) renderDispatch(ctx, dispatch, scrub, archDisp, day);

    /* ---- The latest written post on Substack (audio posts belong to the dispatch player) ---- */
    var sb = ctx.data.substack, sbOK = ctx.ok("substack") && sb && sb.items && sb.items.length;
    var posts = sbOK ? sb.items.filter(function (p) { return !p.is_audio && p.title; }) : [];
    if (!live) posts = posts.filter(function (p) { var n = Trip.dayOfTimestamp(plan, p.published_at, ctx.offset); return isNaN(n) || n <= day; });
    var post = posts[0] || null;
    var S = c.copy.substack || {}, card = document.getElementById("substack-card"), cover = document.getElementById("substack-cover");
    var sub = document.getElementById("substack-sub"), ex = document.getElementById("substack-excerpt"), readBtn = document.getElementById("substack-read");
    sections.substack.hidden = false;          // always shown: the post, or the placeholder that explains what will appear
    cover.textContent = "";
    if (post) {
      card.href = post.link || c.links.substack;
      card.classList.remove("placeholder-card");
      if (post.image) cover.appendChild(el("img", { src: post.image, alt: "", loading: "lazy" })); else cover.appendChild(ctx.mark());
      document.getElementById("substack-kicker").textContent = (S.kicker || "LATEST FROM SUBSTACK") + " · " + postedLine(c, post.published_at);
      document.getElementById("substack-title").textContent = scrub(post.title);
      sub.textContent = scrub(post.subtitle || ""); sub.hidden = !sub.textContent;
      var excerpt = scrub(post.excerpt || ""); if (excerpt && sub.textContent && excerpt.indexOf(sub.textContent) === 0) excerpt = excerpt.slice(sub.textContent.length).trim();
      ex.textContent = excerpt; ex.hidden = !excerpt;
      readBtn.textContent = S.read || "Read it on Substack";
    } else {
      // nothing written yet: the card says what will appear here, and points at Substack meanwhile
      card.href = c.links.substack;
      card.classList.add("placeholder-card");
      cover.appendChild(ctx.mark());
      document.getElementById("substack-kicker").textContent = S.kicker || "LATEST FROM SUBSTACK";
      document.getElementById("substack-title").textContent = S.placeholderTitle || "The first written post goes here.";
      sub.textContent = S.placeholder || ""; sub.hidden = !sub.textContent;
      ex.textContent = ""; ex.hidden = true;
      readBtn.textContent = S.follow || "Follow on Substack";
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

    /* ---- Interactions ---- */
    var infoText = document.getElementById("banner-info").textContent;
    function previewNumbers(n) {                      // the counters as they would read on day n
      var rd = rides ? Trip.ridesThrough(plan, rides, n) : null; if (rd && rd.days === 0) rd = null;
      var mi = rd ? rd.miles : Trip.plannedMilesThrough(plan, n), cl = rd ? rd.climb_ft : Trip.plannedClimbThrough(plan, n);
      return { days: String(n), countries: String(Trip.countriesEntered(ctx.countries, n)), miles: Trip.fmtInt(mi), climb: Trip.fmtInt(cl) };
    }
    if (window.Banner) window.Banner.wire(ctx, { fraction: fraction, counters: counterEls, numbers: numbers, miles: miles, milesRidden: !!ridden }, {
      onDay: function (n) { ctx.setDay(n); },
      onPreview: function (n) {                      // while hovering or dragging: numbers and the day line only
        var p = previewNumbers(n);
        Object.keys(p).forEach(function (k) { if (counterEls[k]) counterEls[k].querySelector(".num").firstChild.nodeValue = p[k]; });
        counters.classList.add("previewing");
        document.getElementById("banner-info").textContent = ((c.copy.travel.label || "TIME TRAVEL · DAY") + " " + n + " OF " + total).toUpperCase();
      },
      onPreviewEnd: function () {
        Object.keys(numbers).forEach(function (k) { if (counterEls[k]) counterEls[k].querySelector(".num").firstChild.nodeValue = numbers[k]; });
        counters.classList.remove("previewing");
        document.getElementById("banner-info").textContent = infoText;
      }
    });
  }

  function renderDispatch(ctx, box, scrub, archDisp, day) {
    var c = ctx.config, plan = ctx.plan, el = ctx.el, copy = c.copy.dispatch || {};
    var items = archDisp ? archDisp.map(function (a) { return { id: a.id, title: a.title, audio: a.audio, link: a.link, published_at: a.published_at, duration_sec: a.duration_sec, description: "" }; }) : ctx.data.dispatches.items;
    var latest = items[0];
    function titleFor(item) {
      var n = Trip.dayOfTimestamp(plan, item.published_at, ctx.offset);
      if (n >= 1 && n <= plan.days.length) { var dd = plan.days[n - 1]; return { pre: "Day " + n + ": ", em: dd.to, day: n }; }
      var m = /^(.*?)\s*(?:—|–|-|:)\s*(.+)$/.exec(item.title || "");
      return m ? { pre: m[1] + ": ", em: m[2] } : { pre: item.title || "Dispatch", em: "" };
    }
    if (!audio) { audio = document.createElement("audio"); audio.preload = "none"; document.body.appendChild(audio); }
    var outer = box; outer.textContent = "";
    var isVideo = /^video\//i.test(latest.audio_type || "") || /\.(mp4|m4v|mov|webm)(\?|$)/i.test(latest.audio || "");
    var cover = el("div", { class: "dispatch-cover" + (isVideo ? " video" : "") }); outer.appendChild(cover);
    box = el("div", { class: "dispatch-body" }); outer.appendChild(box);
    if (isVideo) cover.appendChild(el("video", { controls: "", playsinline: "", preload: "metadata", poster: latest.image || null, src: latest.audio }));
    else if (latest.image) cover.appendChild(el("img", { src: latest.image, alt: "" }));
    else cover.appendChild(ctx.mark());
    var t = titleFor(latest);
    box.appendChild(el("p", { class: "kicker", text: archDisp ? "DISPATCH FROM DAY " + day : (copy.kicker || "LATEST DISPATCH") }));
    var h2 = el("h2"); h2.appendChild(titleNode(t)); box.appendChild(h2);

    var playBtn = el("button", { class: "play", type: "button", "aria-label": "Play", html: '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>' });
    var bars = el("div", { class: "bars", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 0 });
    for (var i = 0; i < 40; i++) { var b = el("span"); b.style.height = (20 + Math.abs(Math.sin(i * 1.7)) * 70) + "%"; bars.appendChild(b); }
    if (!isVideo) box.appendChild(el("div", { class: "player" }, [playBtn, bars]));
    var meta = el("p", { class: "meta", text: "[" + fmtTime(latest.duration_sec) + "] · " + (isVideo ? (copy.video || "WATCH · RECORDED ON THE ROAD") : (copy.recorded || "RECORDED ON THE ROAD")) });
    box.appendChild(meta);
    box.appendChild(el("p", { class: "blurb", text: scrub(latest.description) || copy.blurb || "" }));
    // the two "get it" buttons, the same as the footer's (Spotify opens the episode page when the feed gives one)
    var F = c.copy.footer || {}, spot = /spotify/i.test(latest.link || "") ? latest.link : c.links.spotify, apple = (c.podLink || "").trim();
    var btns = el("div", { class: "get-buttons" });
    if (spot) btns.appendChild(el("a", { class: "btn btn-small btn-outline-cream", href: spot, target: "_blank", rel: "noopener", text: F.spotify || "Get it on Spotify" }));
    if (apple) btns.appendChild(el("a", { class: "btn btn-small btn-outline-cream", href: apple, target: "_blank", rel: "noopener", text: F.apple || "Get it on Apple Podcasts" }));
    box.appendChild(btns);
    var side = el("div", { class: "dispatch-side" }); box.appendChild(side);

    function setPlayIcon(btn, on) { btn.innerHTML = on ? '<svg viewBox="0 0 20 20"><path d="M4 3h4v14H4zM12 3h4v14h-4z"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>'; btn.setAttribute("aria-label", on ? "Pause" : "Play"); }
    function toggle(item, btn) {
      if (playing && playing.item.id === item.id && !audio.paused) { audio.pause(); return; }
      if (!playing || playing.item.id !== item.id) audio.src = item.audio;
      if (playing && playing.btn !== btn) setPlayIcon(playing.btn, false);
      playing = { item: item, btn: btn };
      audio.play().catch(function () {});
    }
    audio.onplay = function () { if (playing) setPlayIcon(playing.btn, true); };
    audio.onpause = function () { if (playing) setPlayIcon(playing.btn, false); };
    audio.ontimeupdate = function () {
      if (!playing || playing.item.id !== latest.id) return;
      var f = audio.duration ? audio.currentTime / audio.duration : 0;
      Array.prototype.forEach.call(bars.children, function (s, i) { s.classList.toggle("on", i / 40 < f); });
      bars.setAttribute("aria-valuenow", Math.round(f * 100));
      meta.textContent = "[" + fmtTime(audio.currentTime) + " / " + fmtTime(audio.duration || latest.duration_sec) + "] · " + (copy.recorded || "RECORDED ON THE ROAD");
    };
    if (playing && playing.item.id === latest.id && !audio.paused) setPlayIcon(playBtn, true);
    playBtn.addEventListener("click", function () { toggle(latest, playBtn); });
    bars.addEventListener("click", function (e) {
      if (!playing || playing.item.id !== latest.id || !audio.duration) return;
      var r = bars.getBoundingClientRect(); audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    });

    var earlier = items.slice(1, 4);
    if (earlier.length) {
      side.appendChild(el("p", { class: "kicker", text: copy.earlier || "EARLIER ENTRIES" }));
      var ul = el("ul", { class: "earlier" });
      earlier.forEach(function (item) {
        var btn = el("button", { class: "play small", type: "button", "aria-label": "Play", html: '<svg viewBox="0 0 20 20"><path d="M5 3l12 7-12 7z"/></svg>' });
        btn.addEventListener("click", function () { toggle(item, btn); });
        var tt = titleFor(item);
        var label = el("div"); label.appendChild(el("span", { class: "mono", text: (tt.day ? "DAY " + tt.day + " · " : "") + "[" + fmtTime(item.duration_sec) + "]" }));
        var tn = el("span", { class: "t" }); tn.textContent = (tt.pre + tt.em).replace(/:\s*$/, ""); label.appendChild(tn);
        ul.appendChild(el("li", {}, [btn, label]));
      });
      side.appendChild(ul);
    } else side.hidden = true;
  }

  // 18 stamps. A country not yet reached shows only a faint outline; from its entry day it is stamped.
  // A stamp earned since the visitor last looked (or since time travel moved past its entry day) stamps
  // down when the section is in view. Reduced motion: stamps simply appear.
  var NS_SVG = "http://www.w3.org/2000/svg", SEEN_KEY = "ns_stamps_seen";
  var stampState = { prevDay: null, pending: [], observer: null };
  function tiltFor(name) {            // a fixed "random" tilt per country, -8..8 degrees, so it never jumps between renders
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return ((h % 1601) / 100 - 8).toFixed(2) + "deg";
  }
  function seenStamps() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch (e) { return []; } }
  function rememberStamps(list) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(list)); } catch (e) { /* private mode: fine */ } }
  function stampFrame() {
    var svg = document.createElementNS(NS_SVG, "svg");
    svg.setAttribute("class", "frame"); svg.setAttribute("viewBox", "0 0 160 124"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
    var g = document.createElementNS(NS_SVG, "g"); g.setAttribute("class", "ink");
    [["outer", 5, 5, 150, 114, 10], ["inner", 11, 11, 138, 102, 6]].forEach(function (r) {
      var rect = document.createElementNS(NS_SVG, "rect");
      rect.setAttribute("class", r[0]); rect.setAttribute("x", r[1]); rect.setAttribute("y", r[2]); rect.setAttribute("width", r[3]); rect.setAttribute("height", r[4]); rect.setAttribute("rx", r[5]);
      g.appendChild(rect);
    });
    svg.appendChild(g);
    return svg;
  }
  function roughFilter() {            // the rough ink edge: one SVG filter shared by every stamp
    if (document.getElementById("stamp-rough")) return;
    var t = document.createElement("template");
    t.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="stamp-rough" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
    document.body.appendChild(t.content.firstChild);
  }
  // Renders the 18 stamps into `grid`. Returns how many are inked. opts.onClick(day) on a tap,
  // opts.shake: the element that shudders when a stamp lands.
  function renderStamps(grid, ctx, day, opts) {
    var c = ctx.config, el = ctx.el, copy = c.copy.stamps || {};
    opts = opts || {};
    roughFilter();
    grid.textContent = "";
    var list = (ctx.countries || []).slice().sort(function (a, b) { return a.first_day - b.first_day; });
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = ctx.live ? seenStamps() : null, firstVisit = seen && seen.length === 0;
    var toStamp = [], inked = 0;
    list.forEach(function (country) {
      var on = country.first_day <= day;
      if (on) inked++;
      var b = el("button", { class: "stamp" + (on ? " inked" : ""), type: "button",
        "aria-label": on ? country.country + ", " + (copy.day || "DAY") + " " + country.first_day : country.country + " (not yet)" }, [
        stampFrame(), ctx.mark(), el("span", { class: "name", text: country.country }),
        el("span", { class: "when", text: (copy.day || "DAY") + " " + country.first_day })
      ]);
      b.style.setProperty("--tilt", on ? tiltFor(country.country) : "0deg");
      if (opts.onClick) b.addEventListener("click", function (e) { e.stopPropagation(); opts.onClick(country.first_day); });
      grid.appendChild(b);
      if (!on) return;
      // newly earned? Live: not seen on an earlier visit. Time travel / test: entry day just passed.
      var fresh = stampState.prevDay !== null ? (country.first_day > stampState.prevDay)
        : (seen ? (!firstVisit && seen.indexOf(country.country) < 0) : false);
      if (fresh) toStamp.push(b);
    });
    if (seen) rememberStamps(list.filter(function (k) { return k.first_day <= day; }).map(function (k) { return k.country; }));
    stampState.prevDay = day;
    if (reduce || !toStamp.length) return inked;
    toStamp.forEach(function (b) { b.style.opacity = "0"; });
    stampState.pending = toStamp; stampState.shake = opts.shake || null;
    if (!("IntersectionObserver" in window)) { playStamps(); return inked; }
    if (stampState.observer) stampState.observer.disconnect();
    stampState.observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { stampState.observer.disconnect(); stampState.observer = null; playStamps(); }
    }, { threshold: 0.35 });
    stampState.observer.observe(grid);
    return inked;
  }
  function playStamps() {
    var list = stampState.pending; stampState.pending = [];
    var wrap = stampState.shake;
    list.forEach(function (b, i) {
      setTimeout(function () {
        if (!b.isConnected) return;
        b.style.opacity = "";
        b.classList.add("stamping");
        setTimeout(function () {                      // the thud, timed to the moment it hits the page
          if (!wrap) return;
          wrap.classList.remove("thud"); void wrap.offsetWidth; wrap.classList.add("thud");
        }, 300);
        b.addEventListener("animationend", function () { b.classList.remove("stamping"); }, { once: true });
      }, i * 260);
    });
  }
  window.Stamps = { render: renderStamps };

  window.Site.ready.then(function (ctx) {
    if (!ctx.config) return;
    render(ctx);
    ctx.onChange(function () { render(ctx); });
  });
})();
