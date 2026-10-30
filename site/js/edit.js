/* Edit mode: change the words, links, sizes, section order and switches of the site in the browser,
   upload the About portrait, then Save. Open any page with ?edit=1.

   Where saves go:
   - In the local preview (npm run dev), straight into config/site.config.json.
   - On the live site, into the GitHub repository through GitHub's own API, using a key you paste
     once (kept only in this browser). GitHub then republishes within about a minute.
   Visitors never see any of this. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var active = params.get("edit") === "1" || params.get("tinker") === "1";
  var LS = { on: "ns_edit_on", token: "ns_gh_token" };
  function ls(key, val) { try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { return null; } }

  if (!active) {
    // A small Edit link for the browser that has edited before
    if (ls(LS.on) === "1") window.addEventListener("DOMContentLoaded", function () {
      var a = document.createElement("a"); a.className = "edit-link"; a.textContent = "Edit";
      var u = new URL(location.href); u.searchParams.set("edit", "1"); a.href = u.pathname + u.search; document.body.appendChild(a);
    });
    return;
  }

  // Edit-mode styles live in their own file so any page (including the coming-soon page) can load them
  (function () { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/edit.css"; document.head.appendChild(l); })();

  var SIZES = [
    ["home.bannerHeight", "Banner height", 160, 640, "px"],
    ["home.titleSize", "Title size", 1.6, 7, "rem"],
    ["home.photoHeight", "Photo height (small screens)", 200, 820, "px"],
    ["home.mapHeight", "Map and photo height", 240, 760, "px"],
    ["home.dayCards", "Day cards", 2, 10, ""]
  ];
  var SWITCHES = [
    ["sections.videos.enabled", "Video section on"],
    ["home.odometer", "Counters roll up"],
    ["home.timeTravel", "Time travel (hover the line)"],
    ["comingSoon.showEmail", "Email on the coming-soon page"],
    ["showDates", "Show dates (keep off until you decide)"]
  ];
  var SECTION_NAMES = { banner: "Banner", latest: "Map + latest photo", dispatch: "Dispatch player", days: "The days", stamps: "Passport", videos: "Videos" };

  function get(o, path) { return path.split(".").reduce(function (a, k) { return a && a[k]; }, o); }
  function set(o, path, v) { var ks = path.split("."), last = ks.pop(); var t = ks.reduce(function (a, k) { return a[k] = a[k] || {}; }, o); t[last] = v; }
  function b64(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
  function b64bytes(buf) { var bytes = new Uint8Array(buf), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }

  // ---- Save backends ----
  var backend = { kind: null };
  function detect() {
    return fetch("/__tinker/ping").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ok) {
      if (ok) backend.kind = "local";
      else if (ls(LS.token)) backend.kind = "github";
      else backend.kind = "none";
    });
  }
  function gh(ctx, method, path, body) {
    var repo = ctx.config.site.repo;
    return fetch("https://api.github.com/repos/" + repo + "/contents/" + path, {
      method: method, headers: { Authorization: "Bearer " + ls(LS.token), Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || ("GitHub said " + r.status)); return j; }); });
  }
  function ghPut(ctx, path, contentB64, message) {
    return gh(ctx, "GET", path + "?ref=main").catch(function () { return {}; }).then(function (cur) {
      return gh(ctx, "PUT", path, { message: message, content: contentB64, sha: cur.sha, branch: "main" });
    });
  }
  function saveConfig(ctx) {
    var text = JSON.stringify(ctx.config, null, 2) + "\n";
    if (backend.kind === "local") return fetch("/__tinker/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: text }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error); return "Saved to config/site.config.json"; });
    if (backend.kind === "github") return ghPut(ctx, "config/site.config.json", b64(text), "Edit from the site: words, links or settings").then(function () { ls(LS.on, "1"); return "Saved. Live in about a minute."; });
    return Promise.reject(new Error("Add your GitHub key first (see Saving, below)."));
  }
  // Shrinks a photo so the repository stays small, then uploads it
  function uploadImage(ctx, file, path, maxPx) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); img.onload = function () {
        var sc = Math.min(1, maxPx / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (blob) { blob.arrayBuffer().then(function (buf) { resolve(b64bytes(buf)); }); }, "image/jpeg", 0.86);
      };
      img.onerror = function () { reject(new Error("That file is not an image I can read.")); };
      img.src = URL.createObjectURL(file);
    }).then(function (data) {
      if (backend.kind === "github") return ghPut(ctx, "site/" + path, data, "Edit from the site: new image " + path);
      if (backend.kind === "local") return fetch("/__tinker/upload?path=" + encodeURIComponent(path), { method: "POST", headers: { "Content-Type": "text/plain" }, body: data }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error); });
      throw new Error("Add your GitHub key first.");
    });
  }

  function build(ctx) {
    var c = ctx.config, el = ctx.el;
    document.body.classList.add("editing");
    var panel = el("aside", { class: "tinker", "aria-label": "Edit panel" });
    var status = el("p", { class: "status", text: "" });
    function say(msg, err) { status.textContent = msg; status.classList.toggle("err", !!err); }
    var dirty = function (rerender) { say("Unsaved changes"); if (rerender) ctx.changed(); };

    // Inline text: every piece of wording on the page becomes editable in place
    document.querySelectorAll("[data-config]").forEach(function (node) {
      var path = node.getAttribute("data-config");
      if (typeof get(c, path) !== "string") return;
      node.setAttribute("contenteditable", "plaintext-only");
      node.setAttribute("spellcheck", "true");
      node.addEventListener("input", function () { set(c, path, node.textContent); say("Unsaved changes"); });
      node.addEventListener("keydown", function (e) { if (e.key === "Enter" && node.tagName !== "P") { e.preventDefault(); node.blur(); } });
    });
    document.addEventListener("click", function (e) {         // links around editable words must not navigate
      var a = e.target.closest && e.target.closest("a");
      if (a && a.querySelector("[data-config]") || (a && a.hasAttribute("data-config"))) e.preventDefault();
    }, true);

    panel.appendChild(el("h2", { text: "Edit mode" }));
    panel.appendChild(el("p", { class: "mono", text: "CLICK ANY WORDING ON THE PAGE TO CHANGE IT · THEN SAVE" }));
    panel.appendChild(status);

    var saveBtn = el("button", { class: "btn btn-persimmon", type: "button", text: "Save" });
    saveBtn.addEventListener("click", function () {
      say("Saving…");
      saveConfig(ctx).then(function (m) { say(m); }).catch(function (e) { say(e.message, true); });
    });
    var closeBtn = el("a", { class: "btn btn-outline-ink", href: (function () { var u = new URL(location.href); u.searchParams.delete("edit"); u.searchParams.delete("tinker"); return u.pathname + u.search; })(), text: "Done" });
    panel.appendChild(el("div", { class: "row" }, [saveBtn, closeBtn]));

    var onHome = !!document.getElementById("home");
    // Section order (home page only)
    if (onHome) panel.appendChild(el("h3", { text: "Home page: section order (drag)" }));
    var list = el("ul", { class: "order" });
    function drawList() {
      list.textContent = "";
      (c.home.sectionOrder || []).forEach(function (n) {
        var li = el("li", { draggable: "true" }, [el("span", { text: SECTION_NAMES[n] || n }), el("span", { class: "mono", text: n === "videos" && !get(c, "sections.videos.enabled") ? "off" : "drag" })]);
        li.addEventListener("dragstart", function (e) { li.classList.add("dragging"); e.dataTransfer.setData("text/plain", n); });
        li.addEventListener("dragend", function () { li.classList.remove("dragging"); });
        li.addEventListener("dragover", function (e) { e.preventDefault(); });
        li.addEventListener("drop", function (e) {
          e.preventDefault();
          var from = e.dataTransfer.getData("text/plain"), order = c.home.sectionOrder.slice();
          if (from === n) return;
          order.splice(order.indexOf(from), 1); order.splice(order.indexOf(n), 0, from);
          c.home.sectionOrder = order; drawList(); dirty(true);
        });
        list.appendChild(li);
      });
    }
    drawList(); if (onHome) panel.appendChild(list);

    panel.appendChild(el("h3", { text: "Switches" }));
    SWITCHES.forEach(function (sw) {
      var input = el("input", { type: "checkbox" }); input.checked = !!get(c, sw[0]);
      input.addEventListener("change", function () { set(c, sw[0], input.checked); drawList(); dirty(true); });
      panel.appendChild(el("label", { class: "row" }, [input, el("span", { text: sw[1] })]));
    });

    panel.appendChild(el("h3", { text: "Sizes" }));
    SIZES.forEach(function (s) {
      var cur = parseFloat(String(get(c, s[0]) || "")) || (s[4] === "px" ? 360 : s[4] === "rem" ? 3 : 5);
      var out = el("span", { class: "mono", text: String(get(c, s[0])) });
      var input = el("input", { type: "range", min: s[2], max: s[3], step: s[4] === "rem" ? 0.1 : 1, value: cur });
      input.addEventListener("input", function () { var v = s[4] ? input.value + s[4] : Number(input.value); set(c, s[0], v); out.textContent = v; dirty(true); });
      panel.appendChild(el("label", {}, [el("span", { text: s[1] }), input, out]));
    });

    panel.appendChild(el("h3", { text: "Links" }));
    var linkPaths = [["podLink", "Apple Podcasts link (switches every Listen button when filled)"]].concat(Object.keys(c.links).map(function (k) { return ["links." + k, k]; }));
    linkPaths.forEach(function (lp) {
      var input = el("input", { type: "text", value: get(c, lp[0]) || "" });
      input.addEventListener("input", function () { set(c, lp[0], input.value); dirty(false); });
      input.addEventListener("change", function () { ctx.changed(); });
      panel.appendChild(el("label", {}, [el("span", { text: lp[1] }), input]));
    });

    panel.appendChild(el("h3", { text: "About page portrait" }));
    var file = el("input", { type: "file", accept: "image/*" });
    file.addEventListener("change", function () {
      if (!file.files[0]) return;
      say("Uploading photo…");
      var box = document.getElementById("portrait");
      if (box) { box.textContent = ""; box.appendChild(el("img", { src: URL.createObjectURL(file.files[0]), alt: c.copy.about.portraitAlt || "" })); }
      uploadImage(ctx, file.files[0], "assets/portrait.jpg", 1600).then(function () {
        set(c, "copy.about.portraitSrc", "assets/portrait.jpg?v=" + Date.now().toString(36));
        return saveConfig(ctx);
      }).then(function (m) { say("Photo uploaded. " + m); }).catch(function (e) { say(e.message, true); });
    });
    panel.appendChild(el("label", {}, [el("span", { text: "Choose a photo (it is shrunk to 1600px and saved as assets/portrait.jpg)" }), file]));

    // Saving: where it goes, and the key for the live site
    panel.appendChild(el("h3", { text: "Saving" }));
    var saveInfo = el("p", { class: "help" });
    function describe() {
      saveInfo.textContent = backend.kind === "local" ? "Local preview: Save writes config/site.config.json on your Mac. Publish with git push when ready."
        : backend.kind === "github" ? "Live site: Save publishes through GitHub with the key kept in this browser. Changes are live about a minute later."
        : "To save from the live site, paste a GitHub key once. It stays in this browser only.";
    }
    describe(); panel.appendChild(saveInfo);
    if (backend.kind !== "local") {
      var tokenRow = el("div");
      function drawToken() {
        tokenRow.textContent = "";
        if (ls(LS.token)) {
          var forget = el("button", { class: "btn btn-outline-ink", type: "button", text: "Forget the key in this browser" });
          forget.addEventListener("click", function () { ls(LS.token, null); ls(LS.on, null); backend.kind = "none"; describe(); drawToken(); });
          tokenRow.appendChild(el("div", { class: "row" }, [el("span", { class: "mono", text: "KEY SAVED" }), forget]));
        } else {
          var input = el("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" });
          var use = el("button", { class: "btn btn-ink", type: "button", text: "Use this key" });
          use.addEventListener("click", function () {
            var v = input.value.trim(); if (!v) return;
            ls(LS.token, v); backend.kind = "github";
            say("Checking the key…");
            gh(ctx, "GET", "config/site.config.json?ref=main").then(function () { ls(LS.on, "1"); say("Key works."); describe(); drawToken(); })
              .catch(function (e) { ls(LS.token, null); backend.kind = "none"; say("That key did not work: " + e.message, true); });
          });
          var help = el("div", { class: "help" });
          help.innerHTML = "How to make the key (two minutes, once):<ol><li>Open <a href=\"https://github.com/settings/personal-access-tokens/new\" target=\"_blank\" rel=\"noopener\">github.com/settings/personal-access-tokens/new</a> (signed in as realandyshort).</li><li>Name: <b>No Shortcuts edit</b>. Expiration: 1 year. Repository access: <b>Only select repositories</b> → noshortcuts.club.</li><li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else.</li><li>Generate, copy the key (starts with github_pat_), paste it here.</li></ol>";
          tokenRow.appendChild(el("div", { class: "row" }, [input, use]));
          tokenRow.appendChild(help);
        }
      }
      drawToken(); panel.appendChild(tokenRow);
    }

    document.body.appendChild(panel);
    document.body.classList.add("tinker-open");
  }

  function start() { detect().then(function () { return window.Site.ready; }).then(function (ctx) { if (ctx && ctx.config) build(ctx); }); }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start); else start();
})();
