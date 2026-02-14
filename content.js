(() => {
  // Prevent double-injection
  if (document.getElementById("spottr-host")) return;

  // Detect if loaded directly by newtab.html (page world) with auto-open flag
  const spottrScriptEl = typeof document !== "undefined" ? document.currentScript : null;

  const THEMES = ["neon-dusk", "light", "midnight"];
  const DEFAULT_THEME = "midnight";
  const THEME_ICONS = { "neon-dusk": "🌆", "light": "☀️", "midnight": "🌑" };

  const QUICK_ACTIONS = [
    {
      title: "> Settings",
      keywords: ["settings", "options", "preferences"],
      action: () => chrome.runtime.sendMessage({ action: "open-tab", url: "chrome://settings" }),
      source: "QUICK ACTIONS",
    },
    {
      title: "> Clear",
      keywords: ["clear", "cache", "history", "delete"],
      action: () => chrome.runtime.sendMessage({ action: "open-tab", url: "chrome://settings/clearBrowserData" }),
      source: "QUICK ACTIONS",
    },
  ];

  let results = [];
  let selectedIndex = -1;
  let debounceTimer = null;
  const lastMouse = { x: 0, y: 0, selectedIndex: -1 };

  // --- Build DOM ---
  const host = document.createElement("div");
  host.id = "spottr-host";
  host.style.display = "none";

  const backdrop = document.createElement("div");
  backdrop.id = "spottr-backdrop";

  const themeToggle = document.createElement("button");
  themeToggle.id = "spottr-theme-toggle";
  themeToggle.title = "Switch theme";

  const dialog = document.createElement("div");
  dialog.id = "spottr-dialog";

  const input = document.createElement("input");
  input.id = "spottr-input";
  input.type = "text";
  input.placeholder = "Search bookmarks, history, or enter a URL…";

  const resultsList = document.createElement("ul");
  resultsList.id = "spottr-results";

  dialog.appendChild(input);
  dialog.appendChild(resultsList);
  backdrop.appendChild(themeToggle);
  backdrop.appendChild(dialog);
  host.appendChild(backdrop);
  document.documentElement.appendChild(host);

  // --- Theme ---
  let currentTheme = DEFAULT_THEME;

  function applyTheme(theme) {
    currentTheme = theme;
    THEMES.forEach((t) => host.classList.remove(t));
    host.classList.add(theme);
    chrome.storage.local.set({ "spottr-theme": theme });
    themeToggle.textContent = THEME_ICONS[theme] || "🌆";
  }

  themeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = THEMES.indexOf(currentTheme);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
    input.focus();
  });

  // Load saved theme
  chrome.storage.local.get("spottr-theme", (data) => {
    applyTheme(data["spottr-theme"] || DEFAULT_THEME);
  });

  // --- Show / Hide ---
  function show() {
    host.style.display = "";
    input.value = "";
    results = [];
    selectedIndex = -1;
    resultsList.innerHTML = "";
    requestAnimationFrame(() => input.focus());
  }

  function hide() {
    host.style.display = "none";
    input.value = "";
    results = [];
    selectedIndex = -1;
    resultsList.innerHTML = "";
  }

  function toggle() {
    if (host.style.display === "none") show();
    else hide();
  }

  // --- Close on backdrop click ---
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) hide();
  });

  // --- Navigation ---
  function navigate(query) {
    if (!query) return;

    let url;
    if (/^https?:\/\//i.test(query)) {
      url = query;
    } else if (/^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+/.test(query)) {
      url = "https://" + query;
    } else {
      url = "https://www.google.com/search?q=" + encodeURIComponent(query);
    }

    hide();
    chrome.runtime.sendMessage({ action: "open-tab", url: url });
  }

  // --- Item selection handler ---
  function onSelect(item) {
    if (item.action) { item.action(); hide(); return; }
    navigate(item.url);
  }

  // --- Search ---
  function search(query) {
    if (!query) {
      results = [];
      selectedIndex = -1;
      render();
      return;
    }

    chrome.runtime.sendMessage({ action: "search", query: query }, (response) => {
      if (!response) return;
      const quickActions = matchQuickActions(query);
      const seen = new Set();
      // Collect and de-dupe raw results from background
      const raw = [];
      for (const item of [...(response.bookmarks || []), ...(response.history || [])]) {
        if (item && item.url && !seen.has(item.url)) {
          seen.add(item.url);
          raw.push(item);
        }
      }
      // Apply fuzzy filtering to tolerate minor typos (off-by-one incl. transposition)
      const q = query.toLowerCase();
      const browseResults = raw.filter((item) =>
        fuzzyIncludes(item.title || item.url, q) || fuzzyIncludes(item.url || "", q)
      );

      results = [...quickActions, ...browseResults].slice(0, 20);
      selectedIndex = results.length > 0 ? 0 : -1;
      render();
    });
  }

  function matchQuickActions(query) {
    const q = query.toLowerCase();
    return QUICK_ACTIONS.filter((a) => a.keywords.some((k) => k.includes(q)));
  }

  // --- Fuzzy match helpers ---
  function fuzzyIncludes(text, q) {
    if (!text) return false;
    const t = (text + "").toLowerCase();
    if (t.includes(q)) return true;
    // Tokenize on non-alphanumeric to keep it cheap
    const tokens = t.split(/[^a-z0-9]+/g).filter(Boolean);
    for (const token of tokens) {
      if (isOneEditOrTransposition(token, q)) return true;
      // Also check substrings of the token with the same length as q (cheap sliding window)
      if (q.length > 2 && token.length >= q.length) {
        for (let i = 0; i <= token.length - q.length; i++) {
          const sub = token.slice(i, i + q.length);
          if (isOneEditOrTransposition(sub, q)) return true;
        }
      }
    }
    return false;
  }

  function isOneEditOrTransposition(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;

    // Same length -> allow 1 substitution or 1 adjacent transposition
    if (la === lb) {
      let diff = 0;
      for (let i = 0; i < la; i++) if (a[i] !== b[i]) diff++;
      if (diff <= 1) return true; // substitution or already equal
      // transposition: exactly 2 diffs and they are adjacent swap
      for (let i = 0; i < la - 1; i++) {
        if (a[i] !== b[i]) {
          if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2) && a.slice(0, i) === b.slice(0, i)) {
            return true;
          }
          break;
        }
      }
      return false;
    }

    // Length differs by 1 -> one insertion/deletion
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; }
      else {
        edits++;
        if (edits > 1) return false;
        if (la > lb) i++; else j++;
      }
    }
    // account for trailing extra char
    if (i < la || j < lb) edits++;
    return edits <= 1;
  }

  // --- Input ---
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(input.value.trim()), 10);
  });

  // --- Keyboard ---
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        render();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, 0);
        render();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      input.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        const item = results[selectedIndex];
        if (item.action) { item.action(); hide(); return; }
        navigate(item.url);
      } else {
        navigate(input.value.trim());
      }
    }
  });

  // Close on Escape even when host doesn't have focus
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.style.display !== "none") {
      e.preventDefault();
      hide();
    }
  });

  // --- Render ---
  function render() {
    resultsList.innerHTML = "";
    const query = input.value.trim();

    results.forEach((item, i) => {
      const li = buildResultItem(item, i, query, {
        selectedIndex,
        lastMouse,
        resultsList,
        onSelect,
      });
      li.addEventListener("mousemove", () => {
        selectedIndex = lastMouse.selectedIndex;
      });
      resultsList.appendChild(li);
    });

    const selected = resultsList.querySelector(".selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  // --- Message listener ---
  function handleMessage(msg, sender, sendResponse) {
    if (msg.action === "toggle-spottr") {
      toggle();
      sendResponse({ ok: true });
    }
  }

  chrome.runtime.onMessage.addListener(handleMessage);
})();
