/* Coming-soon page: loads the config, draws the route, fills in the links.
   If anything fails to load, that part simply stays hidden. The page never shows an error. */

(function () {
  "use strict";

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) { throw new Error(url + " " + r.status); }
      return r.json();
    });
  }

  // Small helper: read "a.b.c" out of an object without blowing up
  function pick(obj, path) {
    return path.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, obj);
  }

  function applyConfig(config) {
    var cs = config.comingSoon || {};

    // Wording that lives in config (the HTML holds a fallback copy)
    document.querySelectorAll("[data-config]").forEach(function (el) {
      var value = pick(config, el.getAttribute("data-config"));
      if (typeof value === "string" && value.trim()) { el.textContent = value; }
    });

    if (cs.titleSize) {
      document.documentElement.style.setProperty("--title-size", cs.titleSize);
    }

    var links = config.links || {};
    var labels = config.labels || {};

    // The one ask: the email field. It hands the address to Substack (config signup.mode, as on the full site).
    var cta = document.getElementById("cta");
    if (cta && links.substack) {
      var base = links.substack.replace(/\/+$/, ""), direct = config.signup && config.signup.mode === "direct";
      cta.setAttribute("action", direct ? base + "/api/v1/free?nojs=true" : base + "/subscribe");
      cta.setAttribute("method", direct ? "post" : "get");
      var pitch = document.getElementById("pitch"), button = document.getElementById("cta-button"), field = document.getElementById("cta-email");
      pitch.textContent = (cs.pitch || "").trim();
      pitch.setAttribute("data-config", "comingSoon.pitch");
      pitch.hidden = !pitch.textContent && !document.body.classList.contains("editing");
      button.textContent = cs.ctaLabel || "Don’t miss the launch.";
      button.setAttribute("data-config", "comingSoon.ctaLabel");
      var ph = pick(config, "copy.signup.placeholder");
      if (typeof ph === "string" && ph.trim()) field.placeholder = ph;
      cta.hidden = false;
    }

    // Underneath on the left: About (hover text) and the coming-soon note
    var nav = document.getElementById("links");
    if (!nav) { return; }
    nav.innerHTML = "";

    // "About": a button that shows a short piece of text on hover, focus or tap
    var aboutText = (cs.aboutText || "").trim();
    if (aboutText) {
      var about = document.createElement("button");
      about.type = "button";
      about.className = "about";
      about.setAttribute("aria-expanded", "false");
      var aboutLabel = document.createElement("span");
      aboutLabel.textContent = labels.about || "About";
      aboutLabel.setAttribute("data-config", "labels.about");
      about.appendChild(aboutLabel);
      var bubble = document.createElement("span");
      bubble.className = "about-text";
      bubble.setAttribute("role", "tooltip");
      bubble.textContent = aboutText;
      bubble.setAttribute("data-config", "comingSoon.aboutText");
      about.appendChild(bubble);
      about.addEventListener("click", function () {           // phones: tap to open, tap again to close
        about.setAttribute("aria-expanded", about.getAttribute("aria-expanded") === "true" ? "false" : "true");
      });
      document.addEventListener("click", function (e) { if (!about.contains(e.target)) { about.setAttribute("aria-expanded", "false"); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { about.setAttribute("aria-expanded", "false"); } });
      nav.appendChild(about);
      // Keep the bubble on screen: flip it when the button sits near the right edge, and on
      // phones (where it is a fixed card) sit it just above the subscribe block
      var place = function () {
        var r = about.getBoundingClientRect();
        about.classList.toggle("flip", r.left + bubble.offsetWidth > window.innerWidth - 16 && r.right > bubble.offsetWidth);
        // (the form itself has no box of its own, so measure the pitch line or the email field)
        var anchor = document.querySelector("#pitch:not([hidden])") || document.getElementById("cta-email");
        if (window.innerWidth <= 640 && anchor && anchor.getBoundingClientRect().height) {
          bubble.style.bottom = (window.innerHeight - anchor.getBoundingClientRect().top + 12) + "px";
        } else { bubble.style.bottom = ""; }
      };
      about.addEventListener("mouseenter", place);
      about.addEventListener("focus", place);
      about.addEventListener("click", place);
      window.addEventListener("resize", place);
    }

    // Small "coming soon" note at the end of the row
    if (cs.note && cs.note.trim()) {
      var note = document.createElement("span");
      note.className = "note";
      note.textContent = cs.note.trim();
      note.setAttribute("data-config", "comingSoon.note");
      nav.appendChild(note);
    }

    if (nav.children.length) { nav.hidden = false; }
  }

  // The 18 country outlines, drawn in the line's own stretched drawing space (as on the home banner),
  // fading in one after another north to south, holding, fading out, resting, and going again.
  // Timings come from config comingSoon.countriesFade; reduced motion shows them still and faint.
  function cycleCountries(outlines, route, cs) {
    var svg = document.getElementById("route-countries"), line = document.getElementById("route-line");
    var o = cs.countriesFade || {};
    if (!svg || !line || !outlines || !outlines.countries || o.on === false || !window.RouteLine) { return; }
    svg.setAttribute("viewBox", line.getAttribute("viewBox"));
    var map = window.RouteLine.projector(route.points), NS = "http://www.w3.org/2000/svg";
    var paths = outlines.countries.slice().sort(function (a, b) { return a.first_day - b.first_day; }).map(function (c) {
      var d = c.rings.map(function (ring) { return "M" + ring.map(function (ll) { var q = map([ll[1], ll[0]]); return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L") + "Z"; }).join("");
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
      return path;
    });
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { svg.classList.add("still"); paths.forEach(function (p) { p.classList.add("in"); }); return; }
    var tIn = Number(o.secondsIn) || 4, stagger = Number(o.secondsBetween) || 0.6, hold = Number(o.secondsHold) || 10, tOut = Number(o.secondsOut) || 4, rest = Number(o.secondsOff) || 8;
    svg.style.setProperty("--fade-in", tIn + "s");
    svg.style.setProperty("--fade-out", tOut + "s");
    var timers = [];
    function run() {
      timers.forEach(clearTimeout); timers = [];
      paths.forEach(function (p, i) { timers.push(setTimeout(function () { p.classList.add("in"); }, i * stagger * 1000)); });
      var allIn = (paths.length - 1) * stagger + tIn;
      timers.push(setTimeout(function () {
        paths.forEach(function (p) { p.classList.remove("in"); });
        timers.push(setTimeout(run, (tOut + rest) * 1000));
      }, (allIn + hold) * 1000));
    }
    timers.push(setTimeout(run, (o.secondsStart !== undefined ? Number(o.secondsStart) : 3) * 1000));   // after the line has drawn itself
  }

  var configPromise = getJSON("config/site.config.json").catch(function () { return null; });
  var routePromise = getJSON("data/route_line.json").catch(function () { return null; });
  var outlinesPromise = getJSON("data/countries_outlines.json").catch(function () { return null; });

  Promise.all([configPromise, routePromise, outlinesPromise]).then(function (results) {
    var config = results[0] || {};
    var route = results[1];
    var outlines = results[2];
    var cs = config.comingSoon || {};

    if (results[0]) { applyConfig(config); }

    // A small stand-in for the full site's Site object, so js/edit.js can edit this page too
    var listeners = [];
    window.Site = {
      config: config, ready: Promise.resolve(null), listeners: listeners,
      el: function (tag, attrs, children) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { if (k === "class") e.className = attrs[k]; else if (k === "text") e.textContent = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k]); });
        (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
        return e;
      },
      onChange: function (fn) { listeners.push(fn); },
      changed: function () { applyConfig(config); listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
    };
    window.Site.ready = Promise.resolve(window.Site);

    if (route && route.points && window.RouteLine) {
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.RouteLine.draw(document.getElementById("route-line"), route.points, {
        strokePx: cs.routeStrokePx,
        animate: cs.drawOnLoad !== false && !reduced
      });
      cycleCountries(outlines, route, cs);
    }
  });
})();
