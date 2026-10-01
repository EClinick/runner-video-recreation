/* Renders the page sections from data.json. */
(function () {
  "use strict";

  // Series styling: muted brand colors plus distinct marker shapes and dashes,
  // so identity never relies on color alone.
  var SERIES = {
    a: { shape: "circle", dash: "" },
    b: { shape: "square", dash: "6 4" },
    c: { shape: "diamond", dash: "" },
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n(x) { return Number(x).toLocaleString("en-US"); }
  function mtok(x) { return x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : String(x); }
  function usd(x) { return "$" + Number(x).toFixed(2); }
  function hm(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (m === 60) { h++; m = 0; }
    return (h ? h + "h " : "") + m + "m";
  }
  function hms(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function utc(iso) { return new Date(iso).toISOString().slice(11, 16) + " UTC"; }
  function score(x) { return x % 1 ? x.toFixed(1) : String(x); }
  function md(s) {
    return esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`\n]+)`/g, "<code>$1</code>");
  }
  function friendly(name) { return name || "subagent"; }
  function ssim(x) { return x.toFixed(4).replace(/0+$/, ""); }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function marker(shape, cx, cy, r, attrs, parent) {
    var el;
    if (shape === "square") el = svgEl("rect", { x: cx - r * 0.9, y: cy - r * 0.9, width: r * 1.8, height: r * 1.8, rx: 1 }, parent);
    else if (shape === "diamond") el = svgEl("path", { d: "M" + cx + " " + (cy - r * 1.25) + "L" + (cx + r * 1.25) + " " + cy + "L" + cx + " " + (cy + r * 1.25) + "L" + (cx - r * 1.25) + " " + cy + "Z" }, parent);
    else el = svgEl("circle", { cx: cx, cy: cy, r: r }, parent);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  var reducedMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  fetch("data.json").then(function (r) { return r.json(); }).then(function (data) {
    try { new window.Session(data); } catch (e) { console.error(e); }
    kpis(data);
    scoreChart(data);
    ssimChart(data);
    toolBars(data);
    renderList(data);
    tokenTable(data);
    pricingTable(data);
    strip(data);
    cards(data);
    takeaways(data);
    footer(data);
    var lastW = window.innerWidth, rt;
    window.addEventListener("resize", function () {
      if (Math.abs(window.innerWidth - lastW) < 40) return;
      lastW = window.innerWidth;
      clearTimeout(rt);
      rt = setTimeout(function () { scoreChart(data); ssimChart(data); strip(data); }, 150);
    });
  });

  /* ---------- KPIs ---------- */
  function kpis(d) {
    var c = d.counts, u = d.usage.total, s = d.session;
    var scored = d.versions.filter(function (v) { return v.ssim != null; });
    var secs = d.versions.filter(function (v) { return v.samples === 1; }).map(function (v) { return v.seconds; });
    var tile = function (k, v, sub) { return '<dl class="kpi"><dt>' + esc(k) + '</dt><dd><span class="v">' + esc(v) + '</span>' + (sub ? '<span class="s">' + esc(sub) + "</span>" : "") + "</dd></dl>"; };
    $("kpiMain").innerHTML = [
      tile("Session time", hm(s.wall_clock_seconds), "First prompt to last reply"),
      tile("Prompts", c.user_prompts, "One to start, one to stop, one for the comparison"),
      tile("Tool calls", c.tool_calls_main_total + c.tool_calls_subagents_total, c.tool_calls_main_total + " main, " + c.tool_calls_subagents_total + " in critics"),
      tile("Estimated cost", usd(u.cost_usd), "At API list prices"),
    ].join("");
    $("kpiQuiet").innerHTML = [
      tile("Final SSIM", ssim(scored[scored.length - 1].ssim), "Up from " + ssim(scored[0].ssim) + " on the first scored render"),
      tile("Critics", c.subagents, c.critic_rounds + " rounds of " + Math.round(c.subagents / c.critic_rounds) + " in parallel"),
      tile("Full renders", c.renders, Math.round(Math.min.apply(null, secs)) + " to " + Math.round(Math.max.apply(null, secs)) + " s each for 352 frames"),
      tile("Tokens", mtok(u.input + u.output + u.cache_write + u.cache_read), mtok(u.cache_read) + " cache reads"),
    ].join("");
  }

  /* ---------- Line charts ---------- */
  // opts: { host, series: [{key,label,short,points:[{x,y}]}], xs, xLabel(x), yMin, yMax, yStep, yFmt, aria, tip(s,p) }
  function lineChart(o) {
    var host = o.host;
    host.textContent = "";
    if (o.series.length > 1) {
      var legend = document.createElement("ul");
      legend.className = "legend";
      o.series.forEach(function (s) {
        var meta = SERIES[s.key] || SERIES.a;
        var li = document.createElement("li");
        var sv = svgEl("svg", { viewBox: "0 0 22 10", "aria-hidden": "true" }, li);
        svgEl("line", { x1: 0, x2: 22, y1: 5, y2: 5, style: "stroke:var(--s-" + s.key + ");stroke-width:2", "stroke-dasharray": meta.dash }, sv);
        marker(meta.shape, 11, 5, 3.4, { style: "fill:var(--s-" + s.key + ")" }, sv);
        li.appendChild(document.createTextNode(s.label));
        legend.appendChild(li);
      });
      host.appendChild(legend);
    }
    var W = Math.max(300, Math.min(host.clientWidth || 820, 836)), H = W < 520 ? 210 : 240;
    var m = { l: o.ml || 34, r: o.mr != null ? o.mr : (W < 520 ? 64 : 96), t: 18, b: 34 };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": o.aria }, host);
    var xs = o.xs, pad = (W - m.l - m.r) * 0.06;
    var x = function (v) { var i = xs.indexOf(v); return m.l + pad + (xs.length > 1 ? i / (xs.length - 1) : 0.5) * (W - m.l - m.r - 2 * pad); };
    var y = function (v) { return m.t + (o.yMax - v) / (o.yMax - o.yMin) * (H - m.t - m.b); };
    var g = svgEl("g", { class: "grid" }, svg), ax = svgEl("g", { class: "axis" }, svg);
    for (var v = o.yMin; v <= o.yMax + 1e-9; v += o.yStep) {
      svgEl("line", { x1: m.l, x2: W - m.r + 8, y1: y(v), y2: y(v) }, g);
      svgEl("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end" }, ax).textContent = o.yFmt(v);
    }
    xs.forEach(function (xv) {
      svgEl("text", { x: x(xv), y: H - m.b + 22, "text-anchor": "middle" }, ax).textContent = o.xLabel(xv);
    });
    var tip = document.createElement("div");
    tip.className = "tip";
    host.appendChild(tip);
    var placed = [];
    o.series.forEach(function (s) {
      var meta = SERIES[s.key] || SERIES.a, col = "var(--s-" + s.key + ")";
      var gs = svgEl("g", { class: "series" }, svg);
      svgEl("path", { d: s.points.map(function (p, i) { return (i ? "L" : "M") + x(p.x) + " " + y(p.y); }).join(" "), style: "stroke:" + col, "stroke-dasharray": meta.dash }, gs);
      s.points.forEach(function (p) {
        marker(meta.shape, x(p.x), y(p.y), 4.5, { class: "mk", style: "fill:" + col }, gs);
        var hit = svgEl("circle", { class: "hit", cx: x(p.x), cy: y(p.y), r: 13, tabindex: 0, "aria-label": o.tip(s, p, true) }, svg);
        var show = function () {
          var r = host.getBoundingClientRect(), b = hit.getBoundingClientRect();
          tip.innerHTML = o.tip(s, p);
          tip.style.left = (b.left - r.left + b.width / 2) + "px";
          tip.style.top = (b.top - r.top + b.height / 2) + "px";
          tip.classList.add("on");
        };
        var hide = function () { tip.classList.remove("on"); };
        hit.addEventListener("mouseenter", show);
        hit.addEventListener("focus", show);
        hit.addEventListener("mouseleave", hide);
        hit.addEventListener("blur", hide);
      });
      if (s.short) {
        var last = s.points[s.points.length - 1], ly = y(last.y) + 4;
        placed.forEach(function (q) { if (Math.abs(q - ly) < 15) ly = q + 15; });
        placed.push(ly);
        svgEl("text", { class: "lbl", x: x(last.x) + 12, y: ly }, svg).textContent = s.short;
      }
    });
  }

  function scoreChart(d) {
    var series = d.scores.map(function (s) {
      return { key: s.key, label: s.label + ": " + s.title, short: s.label.replace(" s", "s") + " " + score(s.points[s.points.length - 1].score), title: s.title, segment: s.label,
        points: s.points.map(function (p) { return { x: p.round, y: p.score }; }) };
    });
    var rounds = [];
    d.scores.forEach(function (s) { s.points.forEach(function (p) { if (rounds.indexOf(p.round) < 0) rounds.push(p.round); }); });
    rounds.sort();
    lineChart({
      host: $("scoreChart"), series: series, xs: rounds, xLabel: function (r) { return "Round " + r; },
      yMin: 0, yMax: 10, yStep: 2, yFmt: String, mr: $("scoreChart").clientWidth < 520 ? 78 : 104,
      aria: "Critic scores out of 10 for each segment in each round",
      tip: function (s, p, plain) { return plain ? s.segment + ", round " + p.x + ": " + score(p.y) + " out of 10" : esc(s.segment) + ", round " + p.x + ": <b>" + score(p.y) + "/10</b>"; },
    });
    var t = "<thead><tr><th>Segment</th>" + rounds.map(function (r) { return '<th class="n">Round ' + r + "</th>"; }).join("") + "</tr></thead><tbody>";
    d.scores.forEach(function (s) {
      t += "<tr><td>" + esc(s.label) + "<small>" + esc(s.title) + "</small></td>" + rounds.map(function (r) {
        var p = s.points.find(function (q) { return q.round === r; });
        return '<td class="n">' + (p ? score(p.score) : "") + "</td>";
      }).join("") + "</tr>";
    });
    $("scoreTable").innerHTML = t + "</tbody>";
  }

  function ssimChart(d) {
    var pts = d.versions.filter(function (v) { return v.ssim != null; });
    lineChart({
      host: $("ssimChart"),
      series: [{ key: "a", label: "SSIM", short: ssim(pts[pts.length - 1].ssim), points: pts.map(function (v) { return { x: v.version, y: v.ssim }; }) }],
      xs: pts.map(function (v) { return v.version; }), xLabel: function (v) { return "r" + v; },
      yMin: 0.85, yMax: 0.93, yStep: 0.02, yFmt: function (v) { return v.toFixed(2); }, ml: 42, mr: 64,
      aria: "Mean SSIM after each scored render",
      tip: function (s, p, plain) { return plain ? "Render " + p.x + ": SSIM " + ssim(p.y) : "Render " + p.x + ": <b>" + ssim(p.y) + "</b>"; },
    });
  }

  /* ---------- Breakdown ---------- */
  function toolBars(d) {
    var c = d.counts;
    function group(title, obj) {
      var entries = Object.keys(obj).map(function (k) { return [k, obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
      return '<p class="bars-title">' + esc(title) + '</p><ul class="bars">' + entries.map(function (e) {
        return '<li><span class="name">' + esc(e[0]) + '</span><span class="track"><span class="fill" style="width:' + (100 * e[1] / max).toFixed(1) + '%"></span></span><span class="v">' + e[1] + "</span></li>";
      }).join("") + "</ul>";
    }
    $("toolBars").innerHTML = group("Main session (Opus 5.5), " + c.tool_calls_main_total + " calls", c.tool_calls_main) +
      group("Critics (Opus 5.5), " + c.tool_calls_subagents_total + " calls", c.tool_calls_subagents);
  }

  function renderList(d) {
    var start = Date.parse(d.session.start);
    $("renderList").innerHTML = d.versions.map(function (v) {
      var bits = ["+" + hms((Date.parse(v.at) - start) / 1000), Math.round(v.seconds) + " s render" + (v.samples > 1 ? ", " + v.samples + " subframes" : "")];
      if (v.ssim != null) bits.push("SSIM " + ssim(v.ssim));
      return '<li><span class="rv">r' + v.version + "</span><span>" + esc(v.note) + '<span class="rt">' + esc(bits.join(", ")) + "</span></span></li>";
    }).join("");
  }

  function tokenTable(d) {
    var rows = [["Main session", "Claude Opus 5.5", d.usage.main]].concat(d.subagents.map(function (s) {
      var m = d.pricing.models[s.model];
      return [s.name, m ? m.label : s.model, s.usage];
    }));
    var head = '<thead><tr><th>Agent</th><th class="n">Input</th><th class="n">Output</th><th class="n">Cache write</th><th class="n">Cache read</th><th class="n">Cost</th></tr></thead>';
    function row(r, cls) {
      var u = r[2];
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + esc(r[0]) + (r[1] ? "<small>" + esc(r[1]) + "</small>" : "") + '</td><td class="n">' + n(u.input) +
        '</td><td class="n">' + n(u.output) + '</td><td class="n">' + n(u.cache_write) + (u.cache_write_1h && u.cache_write_5m ? "" : "<small>" + (u.cache_write_1h ? "1-hour TTL" : "5-minute TTL") + "</small>") +
        '</td><td class="n">' + n(u.cache_read) + '</td><td class="n">' + usd(u.cost_usd) + "</td></tr>";
    }
    $("tokenTable").innerHTML = head + "<tbody>" + rows.map(function (r) { return row(r); }).join("") + row(["Total", "", d.usage.total], "total") + "</tbody>";
  }

  function pricingTable(d) {
    $("pricingSource").textContent = d.pricing.source + " Prices are USD per million tokens.";
    var head = '<thead><tr><th>Model</th><th class="n">Input</th><th class="n">Output</th><th class="n">Cache write, 5 min</th><th class="n">Cache write, 1 hour</th><th class="n">Cache read</th></tr></thead>';
    var body = Object.keys(d.pricing.models).map(function (k) {
      var p = d.pricing.models[k];
      return "<tr><td>" + esc(p.label) + "<small>" + esc(k) + '</small></td><td class="n">' + usd(p.input) + '</td><td class="n">' + usd(p.output) +
        '</td><td class="n">' + usd(p.cache_write_5m) + '</td><td class="n">' + usd(p.cache_write_1h) + '</td><td class="n">' + usd(p.cache_read) + "</td></tr>";
    }).join("");
    $("pricingTable").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  /* ---------- Session strip ---------- */
  function jumpTo(i) {
    var el = $("p-" + (i + 1));
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    document.querySelectorAll(".pcard.active").forEach(function (c) { c.classList.remove("active"); });
    el.classList.add("active");
    document.querySelectorAll(".strip .p-mark").forEach(function (c, k) { c.classList.toggle("active", k === i); });
  }

  function strip(d) {
    var host = $("strip");
    host.textContent = "";
    var start = Date.parse(d.session.start), end = Date.parse(d.session.end), span = end - start;
    var W = Math.max(300, host.clientWidth || 900), wide = W >= 640;
    var H = 128, m = { l: wide ? 74 : 62, r: 12 };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "group", "aria-label": "Session overview: prompts, renders and critic reports over time" }, host);
    var px = function (t) { return m.l + (t - start) / span * (W - m.l - m.r); };
    var x = function (iso) { return px(Date.parse(iso)); };
    var lanes = { p: 24, r: 62, c: 90 };
    (d.session.idle_gaps || []).forEach(function (gap) {
      var x1 = x(gap[0]), x2 = x(gap[1]);
      svgEl("rect", { class: "idle", x: x1, y: 8, width: x2 - x1, height: 92, rx: 4 }, svg);
      if (x2 - x1 > 64) svgEl("text", { class: "idle-lbl", x: (x1 + x2) / 2, y: 112, "text-anchor": "middle" }, svg).textContent = "idle " + Math.round((Date.parse(gap[1]) - Date.parse(gap[0])) / 60000) + " min";
    });
    [["p", "Prompts"], ["r", "Renders"], ["c", "Critics"]].forEach(function (l) {
      svgEl("line", { class: "base", x1: m.l, x2: W - m.r, y1: lanes[l[0]], y2: lanes[l[0]] }, svg);
      svgEl("text", { class: "lane-lbl", x: 0, y: lanes[l[0]] + 4 }, svg).textContent = l[1];
    });
    var tk = svgEl("g", { class: "tick" }, svg), step = (wide ? 15 : 30) * 60000;
    for (var t = 0; t <= span; t += step) {
      svgEl("text", { x: px(start + t), y: H - 1, "text-anchor": t === 0 ? "start" : "middle" }, tk).textContent = "+" + Math.floor(t / 3600000) + ":" + String(Math.round((t % 3600000) / 60000)).padStart(2, "0");
    }
    var lastLbl = -99, lastX = x(d.versions[d.versions.length - 1].at);
    d.versions.forEach(function (v) {
      var vx = x(v.at);
      svgEl("rect", { class: "r-mark", x: vx - 1.5, y: lanes.r - 8, width: 3, height: 16, rx: 1.5 }, svg);
      if (vx - lastLbl > 28 && (lastX - vx > 28 || v.version === d.versions.length)) {
        svgEl("text", { class: "r-lbl", x: vx, y: lanes.r - 13, "text-anchor": "middle" }, svg).textContent = "r" + v.version;
        lastLbl = vx;
      }
    });
    d.events.forEach(function (e) {
      if (e.kind === "report") svgEl("circle", { class: "c-mark", cx: x(e.at), cy: lanes.c, r: 3.5 }, svg);
    });
    d.prompts.forEach(function (p, i) {
      var cx = x(p.at);
      var mk = svgEl("circle", { class: "p-mark" + (p.queued ? " q" : ""), cx: cx, cy: lanes.p, r: 6 }, svg);
      var hit = svgEl("circle", { class: "p-hit", cx: cx, cy: lanes.p, r: 12, tabindex: 0, role: "link", "aria-label": "Jump to prompt " + (i + 1) }, svg);
      svgEl("title", {}, hit).textContent = "Prompt " + (i + 1) + ": " + p.text.slice(0, 80);
      hit.addEventListener("click", function () { jumpTo(i); });
      hit.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jumpTo(i); } });
      hit.addEventListener("mouseenter", function () { mk.classList.add("active"); });
      hit.addEventListener("mouseleave", function () { if (!$("p-" + (i + 1)).classList.contains("active")) mk.classList.remove("active"); });
    });
  }

  /* ---------- Prompt cards ---------- */
  function cards(d) {
    var start = Date.parse(d.session.start);
    $("turns").innerHTML = d.prompts.map(function (p, i) {
      var evs = d.events.filter(function (e) { return e.segment === i; });
      var chips = [];
      if (p.renders.length === 1) chips.push('<span class="chip">Render r' + p.renders[0] + "</span>");
      else if (p.renders.length > 1) chips.push('<span class="chip">Renders r' + p.renders[0] + " to r" + p.renders[p.renders.length - 1] + "</span>");
      if (p.agents_launched.length) chips.push('<span class="chip chip-warm">Launched ' + p.agents_launched.length + " critics</span>");
      var reports = evs.filter(function (e) { return e.kind === "report"; });
      if (reports.length) chips.push('<span class="chip chip-warm">' + reports.length + " critic reports</span>");

      var facts = [];
      var tools = Object.keys(p.tools).map(function (k) { return k + " " + p.tools[k]; }).join(", ");
      if (tools) facts.push(["Tool calls", tools]);
      if (p.files.length) facts.push(["Files written", p.files.join(", ")]);
      var evHtml = evs.map(function (e) {
        if (e.kind === "interrupt") return "<li>The user interrupted Claude at +" + hms((Date.parse(e.at) - start) / 1000) + ".</li>";
        return "<li>" + esc(friendly(e.agent)) + " reported" +
          (e.score != null ? ": <b>" + score(e.score) + "/10</b>" : "") + "</li>";
      }).join("");
      var rest = p.summary.slice(1);
      var hasMore = rest.length || facts.length || evHtml || p.last_reply;
      var moreLabel = (rest.length ? "More detail, tools" : "Tools") + (evs.some(function (e) { return e.kind === "report"; }) ? ", critic scores" : "") + " and Claude's reply";

      var meta = '<span class="n">Prompt ' + (i + 1) + '</span><span title="' + esc(utc(p.at)) + '">+' + hms((Date.parse(p.at) - start) / 1000) + "</span>" +
        (p.queued ? '<span class="chip">Typed while Claude was working</span>' : "") + chips.join("") +
        ((rest.length || facts.length || evHtml || p.last_reply) ? '<button type="button" class="more-btn" aria-expanded="false" aria-controls="pm-' + (i + 1) + '" title="' + esc(moreLabel) + '">Details</button>' : "");
      return '<li class="pcard" id="p-' + (i + 1) + '">' +
        '<div class="pmeta">' + meta + "</div>" +
        '<p class="ptext">' + esc(p.text) + (p.image ? '<span class="att">[user attached an image]</span>' : "") + "</p>" +
        (p.summary.length ? '<p class="pdid"><span class="pdid-label">What Claude did:</span> ' + esc(p.summary[0]) + "</p>" : "") +
        (hasMore ? '<div class="pmore-wrap" id="pm-' + (i + 1) + '" hidden><p class="pmore-title">' + esc(moreLabel) + "</p>" +
          (rest.length ? '<div class="pmore">' + rest.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("") + "</div>" : "") +
          (facts.length ? '<dl class="facts">' + facts.map(function (f) { return "<dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd>"; }).join("") + "</dl>" : "") +
          (evHtml ? '<ul class="events">' + evHtml + "</ul>" : "") +
          (p.last_reply ? '<p class="reply-label">Claude\'s last message in this turn</p><div class="reply">' + md(p.last_reply) + "</div>" : "") +
          "</div>" : "") +
        "</li>";
    }).join("");
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".more-btn");
    if (!btn) return;
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    btn.textContent = open ? "Details" : "Hide details";
    $(btn.getAttribute("aria-controls")).hidden = open;
  });

  function takeaways(d) {
    $("takeawayList").innerHTML = d.takeaways.map(function (t) {
      return '<article class="takeaway"><h3>' + esc(t.title) + "</h3><p>" + esc(t.body) + "</p></article>";
    }).join("");
  }

  function footer(d) {
    var snap = new Date(d.snapshot_at);
    $("footSnapshot").textContent = "Transcript snapshot taken " + snap.toISOString().slice(0, 16).replace("T", " ") + " UTC. The last reply before the cut is at " + new Date(d.session.end).toISOString().slice(11, 19) + " UTC.";
  }

  /* ---------- Synced video playback ---------- */
  var a = $("vOriginal"), b = $("vFinal"), syncing = false;
  $("syncPlay").addEventListener("click", function () {
    syncing = true;
    a.muted = true;
    b.muted = false;
    a.currentTime = 0;
    b.currentTime = 0;
    Promise.all([a.play(), b.play()]).catch(function () {});
  });
  b.addEventListener("timeupdate", function () {
    if (!syncing || a.paused) return;
    if (Math.abs(a.currentTime - b.currentTime) > 0.12) a.currentTime = b.currentTime;
  });
  b.addEventListener("pause", function () { if (syncing) a.pause(); });
  b.addEventListener("play", function () { if (syncing && a.paused) { a.currentTime = b.currentTime; a.play().catch(function () {}); } });
  a.addEventListener("play", function () { if (syncing && b.paused) syncing = false; });
  b.addEventListener("ended", function () { syncing = false; });
})();
