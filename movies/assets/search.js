// Search and theme filter for the main page. Without JavaScript every card stays visible.
// A search shows the titles whose name matches first; titles that only mention the words in their
// plot, genetics text or themes go in a collapsible section below.
(function () {
  "use strict";
  const grid = document.getElementById("grid");
  if (!grid) return;
  const items = Array.from(grid.children);   // page order: oldest first
  const byId = new Map(items.map((li) => [li.dataset.id, li]));
  const $ = (id) => document.getElementById(id);
  const q = $("q"), fTheme = $("f-theme"), fScope = $("f-scope");
  const count = $("count"), empty = $("empty");
  const more = $("more"), moreSummary = $("more-summary"), gridMore = $("grid-more");

  // Words too common to search for (English and Spanish titles).
  const STOP = new Set(["the", "a", "an", "of", "and", "or", "in", "on", "to", "for", "with", "from", "by", "at",
    "el", "la", "los", "las", "lo", "de", "del", "y", "en", "un", "una", "al"]);
  const processTerm = (t) => { t = t.toLowerCase(); return STOP.has(t) ? null : t; };
  const opts = { prefix: true, fuzzy: 0.2, combineWith: "AND" };

  let titleIdx = null, textIdx = null;
  fetch("search-index.json")
    .then((r) => r.json())
    .then((docs) => {
      titleIdx = new MiniSearch({ fields: ["title", "alt"], storeFields: ["id"], processTerm,
        searchOptions: { ...opts, boost: { title: 2 } } });
      textIdx = new MiniSearch({ fields: ["themes", "text"], storeFields: ["id"], processTerm,
        searchOptions: { ...opts, boost: { themes: 2 } } });
      titleIdx.addAll(docs);
      textIdx.addAll(docs);
      update();
    })
    .catch(() => { /* search unavailable: the theme filter still works */ });

  // Scope tokens on each card: gp genetics plot theme, gm genetics mention, eu eugenics, nn nature vs nurture, fo forensics.
  const SCOPE_TOKENS = { ge: ["gp", "eu"], gp: ["gp"], g: ["gp", "gm"], eu: ["eu"], nn: ["nn"], fo: ["fo"] };
  const scopeOk = (li) => {
    const want = SCOPE_TOKENS[fScope ? fScope.value : "ge"];
    return !want || li.dataset.scope.split(" ").some((t) => want.includes(t));
  };
  const themeOk = (li) => scopeOk(li) && (!(fTheme && fTheme.value) || li.dataset.themes.split("|").includes(fTheme.value));
  const plural = (n) => (n === 1 ? "1 title" : `${n} titles`);

  function place(target, list) {
    for (const li of list) target.appendChild(li);
  }

  function update() {
    const query = q.value.trim();
    let main, rest = [];
    if (query && titleIdx) {
      const inTitle = titleIdx.search(query).map((r) => r.id);
      const seen = new Set(inTitle);
      const inText = textIdx.search(query).map((r) => r.id).filter((id) => !seen.has(id));
      main = inTitle.map((id) => byId.get(id)).filter((li) => li && themeOk(li));
      rest = inText.map((id) => byId.get(id)).filter((li) => li && themeOk(li));
    } else {
      main = items.filter(themeOk);
    }
    const shown = new Set([...main, ...rest]);
    place(grid, main);
    place(gridMore, rest);
    for (const li of items) li.hidden = !shown.has(li);

    count.textContent = query ? `${plural(main.length)} with “${query}” in the title` : plural(main.length);
    empty.hidden = main.length !== 0 || rest.length !== 0;
    more.hidden = rest.length === 0;
    moreSummary.textContent = `Also mentioned in the plot of ${plural(rest.length)}`;
    if (rest.length && !main.length) more.open = true;   // nothing in titles: show the plot matches

    if (!query) place(grid, items);   // restore page order, all cards back in the main grid
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (fTheme && fTheme.value) params.set("theme", fTheme.value);
    if (fScope && fScope.value !== "ge") params.set("show", fScope.value);
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function validScope(v) { return v === "all" || v in SCOPE_TOKENS; }

  // Restore state from the URL, so searches can be shared and survive "back".
  const params = new URLSearchParams(location.search);
  if (params.has("q")) q.value = params.get("q");
  if (fTheme && params.has("theme")) fTheme.value = params.get("theme");
  if (fScope && params.has("show") && validScope(params.get("show"))) fScope.value = params.get("show");

  let timer, lastQuery = q.value.trim();
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const query = q.value.trim();
      if (query !== lastQuery) more.open = false;   // each new search starts with the section collapsed
      lastQuery = query;
      update();
    }, 120);
  });
  if (fTheme) fTheme.addEventListener("change", update);
  if (fScope) fScope.addEventListener("change", update);
  update();
})();
