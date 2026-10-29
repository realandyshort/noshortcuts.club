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

    // Buttons: Listen (podcast), See (Instagram), Consider (Substack)
    var nav = document.getElementById("links");
    if (!nav || cs.showLinks === false) { return; }

    var links = config.links || {};
    var labels = config.labels || {};
    var listenHref = (config.podLink && config.podLink.trim()) || links.spotify;
    var items = [
      { label: labels.listen || "Listen", href: listenHref },
      { label: labels.see || "See", href: links.instagram },
      { label: labels.consider || "Consider", href: links.substack }
    ];

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

    // The email is off on the coming-soon page unless comingSoon.showEmail is true
    var email = pick(config, "site.email");
    if (email && cs.showEmail === true) {
      var m = document.createElement("a");
      m.href = "mailto:" + email;
      m.textContent = email;
      m.className = "email";
      nav.appendChild(m);
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

    if (route && route.points && window.RouteLine) {
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.RouteLine.draw(document.getElementById("route-line"), route.points, {
        strokePx: cs.routeStrokePx,
        animate: cs.drawOnLoad !== false && !reduced
      });
    }
  });
})();
