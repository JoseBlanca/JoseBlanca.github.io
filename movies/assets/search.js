// Search and filters for the main page. Without JavaScript every card stays visible.
(function () {
  "use strict";
  const grid = document.getElementById("grid");
  if (!grid) return;
  const items = Array.from(grid.children);
  const byId = new Map(items.map((li) => [li.dataset.id, li]));
  const $ = (id) => document.getElementById(id);
  const q = $("q"), fType = $("f-type"), fDecade = $("f-decade"), fTheme = $("f-theme"), fSort = $("f-sort");
  const count = $("count"), empty = $("empty");

  let mini = null;
  fetch("search-index.json")
    .then((r) => r.json())
    .then((docs) => {
      mini = new MiniSearch({
        fields: ["title", "alt", "themes", "text"],
        storeFields: ["id"],
        searchOptions: { boost: { title: 4, alt: 2, themes: 2 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
      });
      mini.addAll(docs);
      update();
    })
    .catch(() => { /* search unavailable: filters still work */ });

  function matchesFilters(li) {
    const t = fType.value;
    if (t === "documentary" ? li.dataset.doc !== "yes" : t && li.dataset.type !== t) return false;
    if (fDecade.value && li.dataset.decade !== fDecade.value) return false;
    if (fTheme && fTheme.value && !li.dataset.themes.split("|").includes(fTheme.value)) return false;
    return true;
  }

  function update() {
    const query = q.value.trim();
    let ranked = null;
    if (query && mini) ranked = mini.search(query).map((r) => r.id);

    let order;
    if (ranked) {
      order = ranked.map((id) => byId.get(id)).filter(Boolean);
    } else {
      order = items.slice();
      const s = fSort.value;
      if (s === "-year") order.sort((a, b) => b.dataset.year - a.dataset.year || a.dataset.title.localeCompare(b.dataset.title));
      else if (s === "title") order.sort((a, b) => a.dataset.title.localeCompare(b.dataset.title));
      else order.sort((a, b) => a.dataset.year - b.dataset.year || a.dataset.title.localeCompare(b.dataset.title));
    }
    const visible = new Set(order.filter(matchesFilters));
    for (const li of order) grid.appendChild(li);           // reorder
    for (const li of items) li.hidden = !visible.has(li);   // show matches only
    const n = visible.size;
    count.textContent = n === 1 ? "1 title" : `${n} titles`;
    empty.hidden = n !== 0;
    fSort.disabled = Boolean(ranked);

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    for (const [k, el] of [["type", fType], ["decade", fDecade], ["theme", fTheme], ["sort", fSort]]) {
      if (el && el.value && !(k === "sort" && el.value === "year")) params.set(k, el.value);
    }
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  // Restore state from the URL, so searches can be shared and survive "back".
  const params = new URLSearchParams(location.search);
  if (params.has("q")) q.value = params.get("q");
  for (const [k, el] of [["type", fType], ["decade", fDecade], ["theme", fTheme], ["sort", fSort]]) {
    if (el && params.has(k)) el.value = params.get(k);
  }

  let timer;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 120); });
  for (const el of [fType, fDecade, fTheme, fSort]) if (el) el.addEventListener("change", update);
  update();
})();
