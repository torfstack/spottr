(() => {
  // Prevent double-injection
  if (document.getElementById("spottr-host")) return;

  const THEMES = ["neon-dusk", "light", "midnight"];
  const DEFAULT_THEME = "neon-dusk";
  const THEME_ICONS = { "neon-dusk": "🌆", "light": "☀️", "midnight": "🌑" };

  const QUICK_ACTIONS = [
    {
      title: "> settings",
      keywords: ["settings", "options", "preferences"],
      action: () => chrome.runtime.sendMessage({ action: "open-tab", url: "chrome://settings" }),
      source: "QUICK ACTIONS",
    },
    {
      title: "> clear",
      keywords: ["clear", "cache", "history", "delete"],
      action: () => chrome.runtime.sendMessage({ action: "open-tab", url: "chrome://settings/clearBrowserData" }),
      source: "QUICK ACTIONS",
    },
  ];

  let results = [];
  let selectedIndex = -1;
  let debounceTimer = null;

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
      const browseResults = [];
      for (const item of [...(response.bookmarks || []), ...(response.history || [])]) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          browseResults.push(item);
        }
      }
      results = [...quickActions, ...browseResults].slice(0, 20);
      selectedIndex = results.length > 0 ? 0 : -1;
      render();
    });
  }

  function matchQuickActions(query) {
    const q = query.toLowerCase();
    return QUICK_ACTIONS.filter((a) => a.keywords.some((k) => k.includes(q)));
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
      const li = document.createElement("li");
      if (i === selectedIndex) li.classList.add("selected");

      if (item.action) {
        li.classList.add("quick-action");
        li.innerHTML = `
          <span class="title">${highlightMatch(item.title, query)}</span>
          <span class="source">${item.source}</span>
        `;
      } else {
        li.innerHTML = `
          <img class="favicon" src="https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=16" alt="">
          <span class="title">${highlightMatch(item.title, query)}</span>
          <span class="url">${highlightMatch(item.url, query)}</span>
          <span class="source">${item.source}</span>
        `;
      }

      li.addEventListener("click", () => {
        if (item.action) { item.action(); hide(); return; }
        navigate(item.url);
      });
      li.addEventListener("mouseenter", () => {
        selectedIndex = i;
        resultsList.querySelector(".selected")?.classList.remove("selected");
        li.classList.add("selected");
      });

      resultsList.appendChild(li);
    });

    const selected = resultsList.querySelector(".selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return escaped.replace(regex, `<mark class="match">$1</mark>`);
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
