/* Tinker panel: local preview only. Open any page with ?tinker=1 while "npm run dev" is running.
   Drag sections to reorder, slide the main sizes, edit copy and links, then Save writes
   config/site.config.json through the dev server. On the published site this file does nothing:
   it only wakes up when the dev server answers /__tinker/ping. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  if (params.get("tinker") !== "1") return;
  fetch("/__tinker/ping").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ok) {
    if (!ok) return;
    window.Site.ready.then(build);
  });

  var SIZES = [
    ["home.bannerHeight", "Banner height", 160, 640, "px"],
    ["home.titleSize", "Title size", 1.6, 7, "rem"],
    ["home.photoHeight", "Photo height", 200, 820, "px"],
    ["home.mapHeight", "Map height", 240, 760, "px"],
    ["home.dayCards", "Day cards", 2, 10, ""]
  ];
  var TEXT_GROUPS = [["site", "Site"], ["menu", "Menu"], ["labels", "Button labels"], ["links", "Links"], ["copy", "Copy"], ["home.counters", "Counter labels"], ["comingSoon", "Coming-soon page"], ["sections", "Switches"]];

  function get(o, path) { return path.split(".").reduce(function (a, k) { return a && a[k]; }, o); }
  function set(o, path, v) { var ks = path.split("."), last = ks.pop(); var t = ks.reduce(function (a, k) { return a[k] = a[k] || {}; }, o); t[last] = v; }
  function leaves(obj, prefix, out) {
    Object.keys(obj || {}).forEach(function (k) {
      if (k.charAt(0) === "_") return;
      var v = obj[k], p = prefix ? prefix + "." + k : k;
      if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, p, out);
      else if (typeof v === "string" || typeof v === "boolean") out.push([p, v]);
    });
    return out;
  }

  function build(ctx) {
    var c = ctx.config, el = ctx.el;
    var panel = el("aside", { class: "tinker", "aria-label": "Tinker panel" });
    panel.appendChild(el("h2", { text: "Tinker" }));
    panel.appendChild(el("p", { class: "mono", text: "LOCAL ONLY · CHANGES SHOW AT ONCE · SAVE WRITES THE CONFIG FILE" }));
    var saved = el("span", { class: "saved", text: "" });
    var dirty = function () { saved.textContent = "unsaved changes"; ctx.changed(); };

    // Section order: drag to reorder
    panel.appendChild(el("h3", { text: "Home section order" }));
    var list = el("ul", { class: "order" });
    var names = { banner: "Banner", latest: "Latest photo", mapDispatch: "Map + dispatch", days: "The days", videos: "Videos" };
    function drawList() {
      list.textContent = "";
      (c.home.sectionOrder || []).forEach(function (n) {
        var li = el("li", { draggable: "true", "data-name": n }, [el("span", { text: names[n] || n }), el("span", { class: "mono", text: "drag" })]);
        li.addEventListener("dragstart", function (e) { li.classList.add("dragging"); e.dataTransfer.setData("text/plain", n); });
        li.addEventListener("dragend", function () { li.classList.remove("dragging"); });
        li.addEventListener("dragover", function (e) { e.preventDefault(); });
        li.addEventListener("drop", function (e) {
          e.preventDefault();
          var from = e.dataTransfer.getData("text/plain"), order = c.home.sectionOrder.slice();
          order.splice(order.indexOf(from), 1); order.splice(order.indexOf(n), 0, from);
          c.home.sectionOrder = order; drawList(); dirty();
        });
        list.appendChild(li);
      });
    }
    drawList(); panel.appendChild(list);

    panel.appendChild(el("h3", { text: "Sizes" }));
    SIZES.forEach(function (s) {
      var cur = parseFloat(String(get(c, s[0]) || "")) || (s[2] + s[3] === "px" ? 360 : 3);
      var out = el("span", { text: get(c, s[0]) });
      var input = el("input", { type: "range", min: s[2], max: s[3], step: s[4] === "rem" ? 0.1 : 1, value: cur });
      input.addEventListener("input", function () { var v = s[4] ? input.value + s[4] : Number(input.value); set(c, s[0], v); out.textContent = v; dirty(); });
      panel.appendChild(el("label", {}, [el("span", { text: s[1] + " (" + s[0] + ")" }), input, out]));
    });

    TEXT_GROUPS.forEach(function (g) {
      var obj = get(c, g[0]); if (!obj) return;
      panel.appendChild(el("h3", { text: g[1] }));
      leaves(obj, g[0], []).forEach(function (leaf) {
        var p = leaf[0], v = leaf[1], input;
        if (typeof v === "boolean") { input = el("input", { type: "checkbox" }); input.checked = v; input.addEventListener("change", function () { set(c, p, input.checked); dirty(); }); }
        else if (v.length > 70) { input = el("textarea", { text: v }); input.addEventListener("input", function () { set(c, p, input.value); dirty(); }); }
        else { input = el("input", { type: "text", value: v }); input.addEventListener("input", function () { set(c, p, input.value); dirty(); }); }
        panel.appendChild(el("label", {}, [el("span", { text: p }), input]));
      });
    });
    var podLink = el("input", { type: "text", value: c.podLink || "" });
    podLink.addEventListener("input", function () { c.podLink = podLink.value; dirty(); });
    panel.insertBefore(el("label", {}, [el("span", { text: "podLink (Apple Podcasts link, switches every Listen button)" }), podLink]), panel.children[2]);

    var save = el("button", { class: "btn btn-persimmon", type: "button", text: "Save to config" });
    save.addEventListener("click", function () {
      fetch("/__tinker/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) })
        .then(function (r) { return r.json(); }).then(function (j) { saved.textContent = j.ok ? "saved" : "could not save: " + j.error; })
        .catch(function (e) { saved.textContent = "could not save: " + e.message; });
    });
    var close = el("button", { class: "btn btn-outline", type: "button", text: "Close" });
    close.addEventListener("click", function () { panel.remove(); document.body.classList.remove("tinker-open"); });
    panel.appendChild(el("div", { class: "actions" }, [save, close, saved]));
    document.body.appendChild(panel);
    document.body.classList.add("tinker-open");
  }
})();
