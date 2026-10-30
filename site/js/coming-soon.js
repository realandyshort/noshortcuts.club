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

    // The one ask: subscribe on Substack
    var cta = document.getElementById("cta");
    if (cta && links.substack) {
      var pitch = document.getElementById("pitch"), button = document.getElementById("cta-button");
      pitch.textContent = (cs.pitch || "").trim();
      pitch.setAttribute("data-config", "comingSoon.pitch");
      pitch.hidden = !pitch.textContent && !document.body.classList.contains("editing");
      button.textContent = cs.ctaLabel || "Subscribe on Substack";
      button.setAttribute("data-config", "comingSoon.ctaLabel");
      button.href = (cs.ctaHref && cs.ctaHref.trim()) || links.substack.replace(/\/+$/, "") + "/subscribe";
      button.target = "_blank"; button.rel = "noopener";
      cta.hidden = false;
    }

    // Quiet links underneath: Listen (podcast), See (Instagram), About (hover text)
    var nav = document.getElementById("links");
    if (!nav || cs.showLinks === false) { return; }

    var listenHref = (config.podLink && config.podLink.trim()) || links.spotify;
    var items = [
      { label: labels.see || "See", href: links.instagram }
    ];
    if (cs.showListen === true) items.unshift({ label: labels.listen || "Listen", href: listenHref });

    nav.innerHTML = "";
    items.forEach(function (item) {
      if (!item.href) { return; }
      var a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      a.target = "_blank";
      a.rel = "noopener";
      nav.appendChild(a);
    });

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
        var ctaBlock = document.getElementById("cta");
        if (window.innerWidth <= 640 && ctaBlock && !ctaBlock.hidden) {
          bubble.style.bottom = (window.innerHeight - ctaBlock.getBoundingClientRect().top + 12) + "px";
        } else { bubble.style.bottom = ""; }
      };
      about.addEventListener("mouseenter", place);
      about.addEventListener("focus", place);
      about.addEventListener("click", place);
      window.addEventListener("resize", place);
    }

    // The email is off on the coming-soon page unless comingSoon.showEmail is true
    var email = pick(config, "site.email");
    if (email && cs.showEmail === true) {
      var m = document.createElement("a");
      m.href = "mailto:" + email;
      m.textContent = email;
      m.className = "email";
      nav.appendChild(m);
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

  var configPromise = getJSON("config/site.config.json").catch(function () { return null; });
  var routePromise = getJSON("data/route_line.json").catch(function () { return null; });

  Promise.all([configPromise, routePromise]).then(function (results) {
    var config = results[0] || {};
    var route = results[1];
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
    }
  });
})();
