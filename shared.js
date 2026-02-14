/* === Shared Spottr utilities (used by both content overlay and popup) === */

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

function buildResultItem(item, i, query, { selectedIndex, lastMouse, resultsList, onSelect }) {
  const li = document.createElement("li");
  if (i === selectedIndex) li.classList.add("selected");

  if (item.action) {
    li.classList.add("quick-action");
    li.innerHTML = `
      <span class="title">${highlightMatch(item.title, query)}</span>
      <span class="source">${item.source}</span>
    `;
  } else {
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
  }

  li.addEventListener("click", () => onSelect(item));
  li.addEventListener("mousemove", (e) => {
    if (e.screenX === lastMouse.x && e.screenY === lastMouse.y) return;
    lastMouse.x = e.screenX;
    lastMouse.y = e.screenY;

    resultsList.querySelector(".selected")?.classList.remove("selected");
    li.classList.add("selected");
    // Update caller's selectedIndex via callback-style mutation
    lastMouse.selectedIndex = i;
  });

  return li;
}
