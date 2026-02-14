(() => {
  const input = document.getElementById("spottr-input");
  const resultsList = document.getElementById("spottr-results");

  let results = [];
  let selectedIndex = -1;
  let debounce = null;
  const lastMouse = { x: 0, y: 0, selectedIndex: -1 };

  function render() {
    resultsList.innerHTML = "";
    const query = input.value.trim();
    results.forEach((item, i) => {
      const li = buildResultItem(item, i, query, {
        selectedIndex,
        lastMouse,
        resultsList,
        onSelect: openItem,
      });
      li.addEventListener("mousemove", () => {
        selectedIndex = lastMouse.selectedIndex;
      });
      resultsList.appendChild(li);
    });
    const selected = resultsList.querySelector(".selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function searchNow() {
    const q = input.value.trim();
    if (!q) {
      results = [];
      selectedIndex = -1;
      render();
      return;
    }
    chrome.runtime.sendMessage({ action: "search", query: q }, (resp) => {
      const { bookmarks = [], history = [] } = resp || {};
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

  window.addEventListener("DOMContentLoaded", () => {
    input.focus();
  });
})();
