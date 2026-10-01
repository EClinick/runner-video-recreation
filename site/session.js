/* Static render of the whole Claude Code session in the TUI style.
   Reads data.replay from data.json. */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // Inline markdown the TUI renders (bold, inline code, headings), parsed into
  // styled segments so no raw ** or ` markers ever show.
  function mdSegments(s) {
    var segs = [];
    s.split("\n").forEach(function (line, li) {
      if (li) segs.push({ t: "\n", c: "" });
      var h = line.match(/^#{1,4}\s+(.*)$/);
      if (h) { segs.push({ t: h[1].replace(/\*\*|`/g, ""), c: "b" }); return; }
      var re = /\*\*(.+?)\*\*|`([^`\n]+)`/g, last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) segs.push({ t: line.slice(last, m.index), c: "" });
        segs.push(m[1] != null ? { t: m[1].replace(/`/g, ""), c: "b" } : { t: m[2], c: "ic" });
        last = re.lastIndex;
      }
      if (last < line.length) segs.push({ t: line.slice(last), c: "" });
    });
    return segs;
  }
  function segHTML(segs) {
    return segs.map(function (sg) {
      return sg.c === "b" ? "<b>" + esc(sg.t) + "</b>" : sg.c === "ic" ? '<span class="ic">' + esc(sg.t) + "</span>" : esc(sg.t);
    }).join("");
  }
  function fmtTokens(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "k";
    return String(n);
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function firstLine(s) {
    var l = (s || "").split("\n").find(function (x) { return x.trim(); });
    return l ? l.trim() : "";
  }

  function resultLine(e) {
    if (e.summary) return "<span>" + esc(e.summary) + "</span>";
    var out = e.output || "";
    var l = firstLine(out);
    if (!l) return "<span>(No output)</span>";
    if (out.indexOf("[image]") === 0 || l === "[image]") return "<span>Read image</span>";
    var more = e.lines > 1 ? " … +" + (e.lines - 1) + " lines (click to expand)" : "";
    return "<span>" + esc(l.slice(0, 160)) + "</span>" + esc(more);
  }

  function node(e, promptNo) {
    var el = document.createElement("div");
    if (e.t === "prompt") {
      el.className = "t-user";
      el.id = "tp-" + promptNo;
      var att = e.image && e.text.indexOf("[Image") === -1 ? ' <span class="att">[user attached an image]</span>' : "";
      el.innerHTML = '<span class="chev">❯</span>' + esc(e.text) + att;
    } else if (e.t === "text") {
      el.className = "t-row t-asst";
      el.innerHTML = '<span class="dot">●</span><div class="body">' + segHTML(mdSegments(e.text)) + "</div>";
    } else if (e.t === "tool") {
      el.className = "t-row t-tool" + (e.error ? " err" : "");
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-expanded", "false");
      el.innerHTML = '<span class="dot">●</span><div class="body">' +
        '<div class="tool-line"><b>' + esc(e.name) + "</b>(" + esc(e.arg.split("\n")[0]) + ")</div>" +
        '<div class="tool-res"><span class="elbow">⎿</span>' + resultLine(e) + "</div>" +
        '<div class="tool-detail"><span class="lbl">Input</span><pre>' + esc(e.input || "") + "</pre>" +
        '<span class="lbl">Output</span><pre>' + esc(e.output || "(no output)") + "</pre></div></div>";
    } else if (e.t === "report") {
      el.className = "t-row t-report";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-expanded", "false");
      var head = e.score != null ? "Score " + (e.score % 1 ? e.score.toFixed(1) : e.score) + "/10" : firstLine(e.text);
      el.innerHTML = '<span class="dot">●</span><div class="body">' +
        '<div class="tool-line"><b>' + esc(e.agent) + "</b> reported back</div>" +
        '<div class="tool-res"><span class="elbow">⎿</span>' + esc(head) + "</div>" +
        '<div class="tool-detail"><pre>' + esc(e.text) + "</pre></div></div>";
    } else if (e.t === "interrupt") {
      el.className = "t-int";
      el.innerHTML = '<span class="elbow">⎿</span>Interrupted · What should Claude do instead?';
    }
    return el;
  }

  function Session(data) {
    var ev = data.replay;
    var log = document.getElementById("termLog");
    var scroll = document.getElementById("termScroll");
    var fade = document.getElementById("termFade");

    // whole session, in order
    var frag = document.createDocumentFragment(), n = 0;
    ev.forEach(function (e) {
      if (e.t === "prompt") n++;
      frag.appendChild(node(e, n));
    });
    log.appendChild(frag);

    // final totals in the status line
    var last = ev[ev.length - 1];
    document.getElementById("sElapsed").textContent = fmtClock((Date.parse(data.session.end) - Date.parse(data.session.start)) / 1000);
    document.getElementById("sTokens").textContent = fmtTokens(last.cum[0]);
    document.getElementById("sCost").textContent = "$" + last.cum[1].toFixed(2);
    document.getElementById("sTools").textContent = String(last.cum[2]);

    // expand / collapse tool calls and subagent reports
    function toggle(row) {
      row.setAttribute("aria-expanded", String(row.getAttribute("aria-expanded") !== "true"));
    }
    log.addEventListener("click", function (e) {
      var row = e.target.closest(".t-tool, .t-report");
      if (row && !window.getSelection().toString()) toggle(row);
    });
    log.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest(".t-tool, .t-report");
      if (!row) return;
      e.preventDefault();
      toggle(row);
    });

    // fade + hint at the bottom edge until the end is reached
    function updateFade() {
      fade.classList.toggle("done", scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 24);
    }
    scroll.addEventListener("scroll", updateFade, { passive: true });
    updateFade();

    // prompt chips: scroll the terminal to that prompt
    var chips = document.getElementById("promptChips");
    if (chips) {
      var html = "";
      for (var i = 1; i <= n; i++) html += '<button type="button" class="pchip" data-p="' + i + '" aria-label="Scroll the session to prompt ' + i + '">' + i + "</button>";
      chips.innerHTML = html;
      chips.addEventListener("click", function (e) {
        var b = e.target.closest(".pchip");
        if (!b) return;
        var target = document.getElementById("tp-" + b.dataset.p);
        var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        scroll.scrollTo({ top: target.offsetTop - 12, behavior: reduced ? "auto" : "smooth" });
        chips.querySelectorAll(".pchip").forEach(function (x) { x.setAttribute("aria-current", String(x === b)); });
      });
    }
  }

  window.Session = Session;
})();
