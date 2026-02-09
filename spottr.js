const input = document.getElementById("spottr-input");
const resultsList = document.getElementById("spottr-results");

let results = [];
let selectedIndex = -1;
let debounceTimer = null;

// --- Theme Switcher ---
const THEMES = ["neon-dusk", "light", "midnight"];
const DEFAULT_THEME = "neon-dusk";

function applyTheme(theme) {
  document.body.className = theme;
  localStorage.setItem("spottr-theme", theme);
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

document.querySelectorAll(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyTheme(btn.dataset.theme);
    input.focus();
  });
});

applyTheme(localStorage.getItem("spottr-theme") || DEFAULT_THEME);

// --- Search & Navigation ---
input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => search(input.value.trim()), 10);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
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
      navigate(results[selectedIndex].url);
    } else {
      navigate(input.value.trim());
    }
  } else if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
    input.focus();
  }
});

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

  // Show loading overlay
  document.getElementById("spottr-loading").classList.add("visible");
  window.location.href = url;
}

async function search(query) {
  if (!query) {
    results = [];
    selectedIndex = -1;
    render();
    return;
  }

  const [bookmarks, history] = await Promise.all([
    searchBookmarks(query),
    searchHistory(query),
  ]);

  const seen = new Set();
  results = [];

  for (const item of [...bookmarks, ...history]) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      results.push(item);
    }
  }

  results = results.slice(0, 20);
  selectedIndex = results.length > 0 ? 0 : -1;
  render();
}

function searchBookmarks(query) {
  return new Promise((resolve) => {
    chrome.bookmarks.search(query, (nodes) => {
      resolve(
        nodes
          .filter((n) => n.url)
          .slice(0, 10)
          .map((n) => ({ title: n.title || n.url, url: n.url, source: "bookmark" }))
      );
    });
  });
}

function searchHistory(query) {
  return new Promise((resolve) => {
    chrome.history.search({ text: query, maxResults: 10 }, (items) => {
      resolve(
        items.map((i) => ({ title: i.title || i.url, url: i.url, source: "history" }))
      );
    });
  });
}

function render() {
  resultsList.innerHTML = "";

  results.forEach((item, i) => {
    const li = document.createElement("li");
    if (i === selectedIndex) li.classList.add("selected");

    const query = input.value.trim();
    li.innerHTML = `
      <span class="title">${highlightMatch(item.title, query)}</span>
      <span class="url">${highlightMatch(item.url, query)}</span>
      <span class="source">${item.source}</span>
    `;

    li.addEventListener("click", () => navigate(item.url));
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
