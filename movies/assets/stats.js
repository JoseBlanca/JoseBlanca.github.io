// Statistics dashboard: theme badges select a subset of titles; every chart is redrawn for that subset.
// Records come from build_site.py (stats_records): y year, th themes, g genres, p overall portrayal,
// o intervention outcome, h harm present, v villain present, pr [[framing, affiliations, aims], ...] (p, o, h, v
// only for evaluated titles: genetics plot themes and eugenics), s scope tokens (gp genetics plot theme, gm genetics
// mention, eu eugenics, nn nature vs nurture, fo forensics), nn what a nature-vs-nurture story favours.
(function () {
  "use strict";
  const DATA = JSON.parse(document.getElementById("stats-data").textContent);
  const GENRES = JSON.parse(document.getElementById("genre-labels").textContent);
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";

  const DECADES = ["Before 1970", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s so far"];
  const decadeOf = (y) => (y < 1970 ? 0 : Math.min(6, Math.floor((y - 1970) / 10) + 1));

  // Fixed category orders and colour roles (CSS classes r-pos, r-mix, r-neg, r-neu).
  const PORTRAYAL = [["positive", "Positive", "pos"], ["neutral", "Neutral", "neu"], ["mixed", "Mixed", "mix"], ["negative", "Negative", "neg"]];
  const YESNO = [["yes", "Yes", "neg"], ["no", "No", "neu"]];
  const FRAMING = [["hero", "Hero", "pos"], ["neutral", "Neutral", "neu"], ["ambivalent", "Ambivalent", "mix"], ["villain", "Villain", "neg"]];
  const AFFILIATION = { corporation: "Corporation", government: "Government", military: "Military", academia: "Academia",
    independent: "Independent", criminal: "Criminal", medical: "Medical", religious: "Religious", other: "Other", unknown: "Unknown" };
  const NN = [["nature", "Nature", "nat"], ["both", "Both", "neu"], ["nurture", "Nurture", "nur"]];
  const PORTRAYAL_NA = [...PORTRAYAL, ["na", "Not rated", "na"]];
  const SCOPE_TOKENS = { ge: ["gp", "eu"], gp: ["gp"], g: ["gp", "gm"], eu: ["eu"], nn: ["nn"], fo: ["fo"] };
  const PIES = [
    ["h", "Does genetics cause harm?", YESNO],
    ["v", "Is there a villainous geneticist?", YESNO],
    ["p", "How does genetics come across?", PORTRAYAL],
    ["o", "Outcome of the genetic intervention", PORTRAYAL],
  ];

  const el = (tag, attrs = {}, text) => {
    const n = tag.startsWith("svg:") ? document.createElementNS(SVG, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const titles = (n) => (n === 1 ? "1 title" : `${n} titles`);

  // ---------- tooltip: any element with data-tip ----------
  const tip = $("tip");
  document.addEventListener("pointerover", (ev) => {
    const t = ev.target.closest && ev.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
  });
  document.addEventListener("pointermove", (ev) => {
    if (tip.hidden) return;
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${ev.clientY + 16}px`;
  });

  // ---------- line chart (counts per decade, one or more series) ----------
  function lineChart(box, series, ariaLabel) {
    box.replaceChildren();
    const W = 640, H = 230, L = 36, R = 110, T = 12, B = 30;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const x = (i) => L + (i * (W - L - R)) / (DECADES.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel, class: "line-svg" });
    for (let v = 0; v <= top; v += step) {
      svg.append(el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v ? "grid" : "axis" }));
      svg.append(el("svg:text", { x: L - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, String(v)));
    }
    DECADES.forEach((d, i) => svg.append(el("svg:text", { x: x(i), y: H - 8, class: "tick", "text-anchor": "middle" }, d)));
    const ends = [];
    for (const s of series) {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      svg.append(el("svg:polyline", { points: pts, class: `line l-${s.role}` }));
      s.values.forEach((v, i) => svg.append(el("svg:circle", { cx: x(i), cy: y(v), r: 4, class: `dot l-${s.role}` })));
      ends.push({ s, yy: y(s.values[s.values.length - 1]) });
    }
    // direct labels at the line ends, nudged apart if they would overlap
    ends.sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) ends[i].yy = Math.max(ends[i].yy, ends[i - 1].yy + 16);
    for (const e of ends) svg.append(el("svg:text", { x: W - R + 10, y: e.yy + 4, class: "end-label" }, e.s.label));
    // hover columns: one per decade, with every series' value
    DECADES.forEach((d, i) => {
      const half = (W - L - R) / (DECADES.length - 1) / 2;
      const text = `${d}: ` + series.map((s) => (series.length > 1 ? `${s.label} ${s.values[i]}` : titles(s.values[i]))).join(", ");
      svg.append(el("svg:rect", { x: x(i) - half, y: T, width: 2 * half, height: H - T - B, class: "hover-col", "data-tip": text }));
    });
    box.append(svg);
  }
  function niceStep(max) {
    const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  }

  // ---------- pie ----------
  function arc(a0, a1, r = 96) {
    if (a1 - a0 >= 0.9999) return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
    const pt = (f) => [r * Math.sin(2 * Math.PI * f), -r * Math.cos(2 * Math.PI * f)];
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  }
  function pie(title, values, order) {
    const keys = new Set(order.map((o) => o[0]));
    const vals = values.filter((v) => keys.has(v));
    const n = vals.length;
    const fig = el("figure", { class: "pie" });
    const cap = el("figcaption", {}, `${title} `);
    cap.append(el("span", { class: "muted" }, `(${titles(n)})`));
    fig.append(cap);
    const svg = el("svg:svg", { viewBox: "-100 -100 200 200", role: "img" });
    const legend = el("ul", { class: "legend" });
    let start = 0;
    const aria = [];
    for (const [key, label, role] of order) {
      const c = vals.filter((v) => v === key).length;
      if (!c) continue;
      const tipText = `${label}: ${c} of ${n} (${pct(c, n)}%)`;
      svg.append(el("svg:path", { d: arc(start, start + c / n), class: `slice r-${role}`, "data-tip": tipText }));
      start += c / n;
      aria.push(`${label} ${pct(c, n)}%`);
      const li = el("li");
      li.append(el("span", { class: `swatch r-${role}`, "aria-hidden": "true" }), el("span", { class: "legend-label" }, label));
      const val = el("span", { class: "legend-value" }, `${pct(c, n)}% `);
      val.append(el("span", { class: "muted" }, `(${c})`));
      li.append(val);
      legend.append(li);
    }
    svg.setAttribute("aria-label", `${title}: ${aria.join(", ") || "no titles"}`);
    fig.append(svg, legend);
    return fig;
  }

  // ---------- 100% stacked bars: rows of {label, counts{key: n}} ----------
  function stacked(box, rows, order, unit) {
    box.replaceChildren();
    const legend = el("ul", { class: "legend legend-inline" });
    for (const [, label, role] of order) {
      const li = el("li");
      li.append(el("span", { class: `swatch r-${role}`, "aria-hidden": "true" }), el("span", {}, label));
      legend.append(li);
    }
    box.append(legend);
    const list = el("ul", { class: "stack-rows" });
    for (const row of rows) {
      const n = order.reduce((a, [k]) => a + (row.counts[k] || 0), 0);
      if (!n) continue;
      const li = el("li");
      li.append(el("span", { class: "bar-label" }, row.label));
      const track = el("span", { class: "stack-track", role: "img",
        "aria-label": `${row.label}: ` + order.filter(([k]) => row.counts[k]).map(([k, l]) => `${l} ${pct(row.counts[k], n)}%`).join(", ") });
      for (const [k, label, role] of order) {
        const c = row.counts[k] || 0;
        if (!c) continue;
        track.append(el("span", { class: `seg r-${role}`, style: `flex-grow:${c}`,
          "data-tip": `${row.label}, ${label.toLowerCase()}: ${c} of ${n} ${unit} (${pct(c, n)}%)` }));
      }
      li.append(track, el("span", { class: "bar-value" }, String(n)));
      list.append(li);
    }
    box.append(list);
    if (!list.children.length) box.append(el("p", { class: "muted" }, "No data for this selection."));
  }

  // ---------- bars whose length is a count, split into segments: rows of {label, count, counts{key: n}} ----------
  function stackedCounts(box, rows, order, n) {
    box.replaceChildren();
    const legend = el("ul", { class: "legend legend-inline" });
    for (const [, label, role] of order) {
      const li = el("li");
      li.append(el("span", { class: `swatch r-${role}`, "aria-hidden": "true" }), el("span", {}, label));
      legend.append(li);
    }
    box.append(legend);
    const top = Math.max(1, ...rows.map((r) => r.count));
    const list = el("ul", { class: "stack-rows stack-rows-wide" });
    for (const r of rows) {
      if (!r.count) continue;
      const li = el("li");
      li.append(el("span", { class: "bar-label" }, r.label));
      const outer = el("span", { class: "stack-outer" });
      const track = el("span", { class: "stack-track", style: `width:${(100 * r.count) / top}%`, role: "img",
        "aria-label": `${r.label}: ${r.count} titles; ` + order.filter(([k]) => r.counts[k]).map(([k, l]) => `${l} ${r.counts[k]}`).join(", ") });
      for (const [k, label, role] of order) {
        const c = r.counts[k] || 0;
        if (!c) continue;
        track.append(el("span", { class: `seg r-${role}`, style: `flex-grow:${c}`,
          "data-tip": `${r.label}, ${label.toLowerCase()}: ${c} of ${r.count} titles (${pct(c, r.count)}%)` }));
      }
      outer.append(track);
      const val = el("span", { class: "bar-value" }, `${r.count} `);
      val.append(el("span", { class: "muted" }, `(${pct(r.count, n)}%)`));
      li.append(outer, val);
      list.append(li);
    }
    box.append(list);
  }

  // ---------- state ----------
  const badges = Array.from(document.querySelectorAll(".theme-badge"));
  const selected = new Set();
  const fScope = $("f-scope");
  const inScope = (r) => { const want = SCOPE_TOKENS[fScope.value]; return !want || r.s.some((t) => want.includes(t)); };
  const matches = (r) => inScope(r) && (!selected.size || r.th.some((t) => selected.has(t)));

  function render() {
    const recs = DATA.filter(matches);
    const n = recs.length;
    for (const b of badges) {
      const on = selected.has(b.dataset.theme);
      b.setAttribute("aria-pressed", String(on));
      b.querySelector(".badge-n").textContent = DATA.filter((r) => inScope(r) && r.th.includes(b.dataset.theme)).length;
    }
    $("sel-count").textContent = selected.size ? `${titles(n)} with ${[...selected].map((t) => t.replace(/_/g, " ")).join(" or ")}.`
      : `All ${titles(n)}.`;
    $("clear").hidden = !selected.size;

    const perDecade = (f) => DECADES.map((_, i) => recs.filter((r) => decadeOf(r.y) === i && f(r)).length);
    lineChart($("c-decades"), [{ label: "Titles", role: "bar", values: perDecade(() => true) }], "Titles per decade");
    lineChart($("c-negdecades"), [
      { label: "Negative", role: "neg", values: perDecade((r) => r.p === "negative") },
      { label: "Mixed", role: "mix", values: perDecade((r) => r.p === "mixed") },
      { label: "Positive", role: "pos", values: perDecade((r) => r.p === "positive") },
    ], "Titles with a negative, mixed and positive portrayal of genetics, per decade");
    const nNeutral = recs.filter((r) => r.p === "neutral").length;
    $("neutral-note").textContent = nNeutral
      ? `Neutral portrayals (${titles(nNeutral)}) are not shown.` : "";

    const rated = recs.filter((r) => r.p);
    $("eval-note").hidden = rated.length === n;
    $("eval-note").textContent = `Only titles where genetics is a plot theme, and eugenics titles, are rated: ${titles(rated.length)} of the ${titles(n)} selected.`;
    $("c-pies").replaceChildren(...PIES.map(([f, title, order]) => pie(title, rated.map((r) => r[f]), order)));
    const nnRecs = recs.filter((r) => r.nn);
    $("b-nn").hidden = !nnRecs.length;
    $("c-nn").replaceChildren(pie("What the story favours", nnRecs.map((r) => r.nn), NN));
    lineChart($("c-nn-decades"), NN.map(([k, label, role]) => (
      { label, role, values: perDecade((r) => r.nn === k) })), "Nature versus nurture stories per decade, by what they favour");

    const framingBy = (idx, labels) => {
      const rows = Object.entries(labels).map(([k, label]) => ({ key: k, label, counts: {} }));
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
      for (const r of recs) for (const p of r.pr) for (const k of p[idx]) if (byKey[k]) byKey[k].counts[p[0]] = (byKey[k].counts[p[0]] || 0) + 1;
      const villainShare = (r) => (r.counts.villain || 0) / Math.max(1, Object.values(r.counts).reduce((a, b) => a + b, 0));
      return rows.sort((a, b) => villainShare(b) - villainShare(a));
    };
    stacked($("c-aff"), framingBy(1, AFFILIATION), FRAMING, "characters");

    const genreRows = Object.keys(GENRES).filter((g) => g !== "documentary").map((g) => {
      const counts = {};
      let count = 0;
      for (const r of recs) if (r.g.includes(g)) { count++; const k = r.p || "na"; counts[k] = (counts[k] || 0) + 1; }
      return { label: GENRES[g], count, counts };
    }).sort((a, b) => b.count - a.count);
    stackedCounts($("c-genres"), genreRows, rated.length === n ? PORTRAYAL : PORTRAYAL_NA, recs.filter((r) => r.g.length).length);

    const params = new URLSearchParams(location.search);
    if (selected.size) params.set("themes", [...selected].join(",")); else params.delete("themes");
    if (fScope.value !== "ge") params.set("show", fScope.value); else params.delete("show");
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  for (const b of badges) b.addEventListener("click", () => {
    const t = b.dataset.theme;
    if (selected.has(t)) selected.delete(t); else selected.add(t);
    render();
  });
  $("clear").addEventListener("click", () => { selected.clear(); render(); });

  fScope.addEventListener("change", render);
  const show = new URLSearchParams(location.search).get("show");
  if (show && (show === "all" || show in SCOPE_TOKENS)) fScope.value = show;
  const fromUrl = new URLSearchParams(location.search).get("themes");
  if (fromUrl) for (const t of fromUrl.split(",")) if (badges.some((b) => b.dataset.theme === t)) selected.add(t);
  render();
})();
