/* Shared page plumbing: loads config and data, fills the header and footer from config, works out
   which day it is (or which day is being simulated with ?day=NNN), and exposes small helpers.
   Every page waits on Site.ready. Nothing here ever shows a calendar date. */
(function () {
  "use strict";

  var MARK_SVG = '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M20.5 4.2 C20.1 11 19.8 27 19.6 35.6"/><path d="M6.8 11.6 C13 15.4 26 23.5 33.4 28.1"/><path d="M33.9 11 C27.5 15.8 13.4 24.6 6.2 28.9"/></g></svg>';

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
  }
  function quiet(url) { return getJSON(url).catch(function () { return null; }); }
  function pick(obj, path) { return path.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, obj); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  var params = new URLSearchParams(location.search);
  var pageName = document.body.getAttribute("data-page") || "";
  var ctx = {
    config: null, plan: null, meta: null, status: null, countries: [], route: null, americas: null,
    data: {}, day: 1, today: null, isTest: params.has("day") || /\/test\/?$/.test(location.pathname), testDay: null,
    offset: 0, params: params, page: pageName, listeners: []
  };

  // State of a source as recorded by the robot. Missing status file = assume fine if its data loaded.
  ctx.state = function (name) {
    var s = ctx.status && ctx.status.sources && ctx.status.sources[name];
    return s ? s.state : (ctx.data[name] ? "ok" : "missing");
  };
  ctx.ok = function (name) { return ctx.state(name) === "ok" || (ctx.state(name) === "failing"); };   // one blip does not hide a section
  ctx.connected = function (name) { var s = ctx.state(name); return s !== "not_connected" && s !== "skipped"; };
  ctx.listenHref = function () { var c = ctx.config; return (c.podLink && c.podLink.trim()) || c.links.pocketCasts || c.links.spotify; };
  ctx.withDay = function (href) { return ctx.testDay ? href + (href.indexOf("?") >= 0 ? "&" : "?") + "day=" + ctx.testDay : href; };
  ctx.mark = function () { var t = document.createElement("template"); t.innerHTML = MARK_SVG; return t.content.firstChild; };
  ctx.el = el; ctx.pick = pick;

  // Archived day files (archive/days/NNN.json), fetched once and remembered. null = none yet.
  var archives = {};
  ctx.archive = function (n) {
    n = Number(n);
    if (!(n >= 1)) return Promise.resolve(null);
    if (archives[n] !== undefined) return Promise.resolve(archives[n]);
    return quiet("archive/days/" + String(n).padStart(3, "0") + ".json").then(function (a) { archives[n] = a; return a; });
  };
  // Change the day being shown (time travel). Updates the address so the view can be shared.
  ctx.setDay = function (n) {
    if (!ctx.plan) return;
    n = window.Trip.clampDay(ctx.plan, n);
    ctx.day = n;
    // "Home" is the real today, or the simulated day when the page was opened with ?day=
    ctx.homeDay = ctx.testDay || ctx.todayClamped;
    ctx.travelDay = (n === ctx.homeDay) ? null : n;
    ctx.live = !ctx.travelDay && !ctx.testDay;
    try {
      var u = new URL(location.href);
      if (ctx.travelDay || ctx.testDay) u.searchParams.set("day", n); else u.searchParams.delete("day");
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) { /* older browsers: fine without */ }
    ctx.listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  };

  // Instagram post for a day number (by the post's timestamp), newest first
  ctx.postsForDay = function (n) {
    var ig = ctx.data.instagram;
    if (!ig || !ig.items || !ctx.ok("instagram")) return [];
    return ig.items.filter(function (p) { return window.Trip.dayOfTimestamp(ctx.plan, p.timestamp, ctx.offset) === n; });
  };
  ctx.photoPlaceholder = function (tagText, small) {
    var ph = ctx.config.copy.placeholders || {};
    var box = el("div", { class: "placeholder" }, [
      ctx.mark(),
      small ? null : el("p", { text: ph.photoLine || "" }),
      small ? null : el("a", { href: ctx.config.links.instagram, target: "_blank", rel: "noopener", text: ph.photoLink || "Instagram" })
    ]);
    if (tagText) box.appendChild(el("span", { class: "tag", text: tagText }));
    return box;
  };

  function applyChrome() {
    var c = ctx.config, m = c.menu || {}, links = c.links || {};
    document.querySelectorAll("[data-config]").forEach(function (node) {
      var v = pick(c, node.getAttribute("data-config"));
      if (typeof v === "string") node.textContent = v;
    });
    document.querySelectorAll("[data-href]").forEach(function (a) {
      var key = a.getAttribute("data-href"), href;
      if (key === "listen") href = ctx.listenHref();
      else if (key === "email") href = "mailto:" + c.site.email;
      else if (key === "home") href = ctx.withDay("index.html");
      else if (key === "days") href = ctx.withDay("days.html");
      else if (key === "about") href = ctx.withDay("about.html");
      else href = pick(c, key) || links[key];
      if (href) a.setAttribute("href", href); else a.hidden = true;
      if (/^https?:/.test(href || "")) { a.target = "_blank"; a.rel = "noopener"; }
    });
    var hp = c.home || {};
    var root = document.documentElement.style;
    if (hp.bannerHeight) root.setProperty("--banner-height", hp.bannerHeight);
    if (hp.titleSize) root.setProperty("--title-size", hp.titleSize);
    if (hp.photoHeight) root.setProperty("--photo-height", hp.photoHeight);
    if (hp.mapHeight) root.setProperty("--map-height", hp.mapHeight);
    if (hp.dayCards) root.setProperty("--day-cards", hp.dayCards);
    var toggle = document.querySelector(".menu-toggle"), menu = document.querySelector(".menu");
    if (toggle && menu && !toggle._wired) { toggle._wired = true; toggle.addEventListener("click", function () { menu.classList.toggle("open"); toggle.setAttribute("aria-expanded", menu.classList.contains("open")); }); }
    var yt = document.querySelector("[data-when-videos]");
    if (yt) yt.hidden = !(c.sections && c.sections.videos && c.sections.videos.enabled);
    document.querySelectorAll(".menu a").forEach(function (a) {
      var here = location.pathname.split("/").pop() || "index.html";
      var target = (a.getAttribute("href") || "").split("?")[0];
      if (target === here || (here === "home.html" && target === "index.html")) a.setAttribute("aria-current", "page");
    });
  }

  function statusStrip() {
    if (!ctx.isTest) return;
    var names = ["plan", "dispatches", "instagram", "videos", "rides", "position", "weather"];
    var strip = el("div", { class: "status-strip", role: "status" }, [el("b", { text: "TEST MODE · DAY " + ctx.day })]);
    names.forEach(function (n) { var s = ctx.state(n); strip.appendChild(el("span", { class: "s " + s, text: n + " " + s.replace("_", " ") })); });
    strip.appendChild(el("a", { href: "test/", text: "test page" }));
    if (/\/test\/?$/.test(location.pathname)) strip.lastChild.remove();
    document.body.appendChild(strip);
    document.body.classList.add("has-strip");
  }

  function decideDay() {
    var Trip = window.Trip, plan = ctx.plan;
    var meta = ctx.meta || {};
    var weather = ctx.data.weather || {};
    ctx.offset = typeof weather.utc_offset_seconds === "number" ? weather.utc_offset_seconds
      : typeof meta.utc_offset_seconds === "number" ? meta.utc_offset_seconds : (ctx.config.trip.fallbackUtcOffsetHours || 0) * 3600;
    var computed = plan ? Trip.dayNumberAt(plan, Date.now(), ctx.offset) : 1;
    ctx.today = computed;
    ctx.todayClamped = plan ? Trip.clampDay(plan, computed) : 1;
    if (params.has("day")) { ctx.testDay = plan ? Trip.clampDay(plan, params.get("day")) : Number(params.get("day")); ctx.day = ctx.testDay; }
    else ctx.day = ctx.todayClamped;
    ctx.travelDay = null;
    ctx.homeDay = ctx.testDay || ctx.todayClamped;
    ctx.live = !ctx.testDay;                       // live = real today, not a simulated or time-travelled day
  }

  var light = document.body.hasAttribute("data-light");   // about page: config only
  var loads = [getJSON("config/site.config.json").catch(function () { return null; })];
  if (!light) {
    loads.push(quiet("data/plan.json"), quiet("data/meta.json"), quiet("data/status.json"), quiet("data/countries.json"), quiet("data/route_line.json"),
      quiet("data/dispatches.json"), quiet("data/instagram.json"), quiet("data/rides.json"), quiet("data/position.json"), quiet("data/weather.json"), quiet("data/videos.json"));
    if (document.body.hasAttribute("data-needs-map")) loads.push(quiet("data/americas.json"), quiet("data/calories.json"), quiet("data/countries_outlines.json"), quiet("data/route_elevation.json"));
  }

  window.Site = ctx;
  ctx.ready = Promise.all(loads).then(function (r) {
    ctx.config = r[0];
    if (!ctx.config) { console.warn("config failed to load; leaving the page as written"); return ctx; }
    if (!light) {
      ctx.plan = r[1]; ctx.meta = r[2]; ctx.status = r[3]; ctx.countries = r[4] || []; ctx.route = r[5];
      ctx.data = { dispatches: r[6], instagram: r[7], rides: r[8], position: r[9], weather: r[10], videos: r[11] };
      ctx.americas = r[12] || null;
      ctx.data.calories = r[13] || null;
      ctx.outlines = r[14] || null;
      ctx.elevation = (r[15] && r[15].elevation_m && ctx.route && r[15].elevation_m.length === ctx.route.points.length) ? r[15] : null;
      if (ctx.plan) decideDay();
    }
    applyChrome();
    if (!light) statusStrip();
    return ctx;
  });
  ctx.applyChrome = applyChrome;
  // Tinker panel calls this after changing config in memory
  ctx.onChange = function (fn) { ctx.listeners.push(fn); };
  ctx.changed = function () { applyChrome(); ctx.listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };
})();
