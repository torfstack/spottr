(() => {
  const input = document.getElementById("spottr-input");
  const resultsList = document.getElementById("spottr-results");

  let results = [];
  let selectedIndex = -1;
  let debounce = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    let result = "";
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      result += escapeHtml(text.slice(lastIndex, match.index));
      result += `<mark class="match">${escapeHtml(match[1])}</mark>`;
      lastIndex = regex.lastIndex;
    }
    result += escapeHtml(text.slice(lastIndex));
    return result;
  }

  function render() {
    resultsList.innerHTML = "";
    const query = input.value.trim();
    results.forEach((item, i) => {
      const li = document.createElement("li");
      if (i === selectedIndex) li.classList.add("selected");
      // Try to show a favicon like the in-page overlay
      let favicon = "";
      try {
        const hostname = new URL(item.url).hostname;
        favicon = `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${hostname}&sz=16" alt="">`;
      } catch (_) {
        // ignore invalid URL
      }
      li.innerHTML = `
        ${favicon}
        <span class="title">${highlightMatch(item.title || item.url, query)}</span>
        <span class="url">${highlightMatch(item.url, query)}</span>
        <span class="source">${item.source}</span>
      `;
      li.addEventListener("click", () => openItem(item));
      li.addEventListener("mousemove", (e) => {
        if (e.screenX === lastMouseX && e.screenY === lastMouseY) return;
        lastMouseX = e.screenX;
        lastMouseY = e.screenY;

        selectedIndex = i;
        resultsList.querySelector(".selected")?.classList.remove("selected");
        li.classList.add("selected");
      });
      resultsList.appendChild(li);
    });
    const selected = resultsList.querySelector(".selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function searchNow() {
    const q = input.value.trim();
    if (!q) {
      // Match overlay behavior: show nothing until user types
      results = [];
      selectedIndex = -1;
      render();
      return;
    }
    chrome.runtime.sendMessage({ action: "search", query: q }, (resp) => {
      const { bookmarks = [], history = [] } = resp || {};
      // Simple merge: bookmarks first, then history
      results = [...bookmarks, ...history].slice(0, 200);
      selectedIndex = results.length ? 0 : -1;
      render();
    });
  }

  function debouncedSearch() {
    clearTimeout(debounce);
    debounce = setTimeout(searchNow, 10);
  }

  function openItem(item) {
    if (!item) return;
    chrome.runtime.sendMessage({ action: "open-tab", url: item.url });
    window.close();
  }

  input.addEventListener("input", debouncedSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex + 1) % results.length;
      render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
      render();
      return;
    }
    if (e.key === "Enter") {
      const item = results[selectedIndex] || results[0];
      if (item) {
        e.preventDefault();
        openItem(item);
      }
      return;
    }
  });

  // Initial focus and initial data
  window.addEventListener("DOMContentLoaded", () => {
    input.focus();
    // Do not auto-populate results; wait for user input
  });
})();
