// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-spottr") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  // Determine if we can run content scripts; if not, open the action popup instead
  const restricted = !tab ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    url.startsWith("about:") ||
    url.includes("chrome.google.com/webstore");

  if (restricted) {
    // Use the popup as a fallback when activation in the page isn't possible
    try { await chrome.action.openPopup(); } catch (_) { /* ignore */ }
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not yet injected, inject it first
      chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["shared.css", "content.css"]
      }, () => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["shared.js", "content.js"]
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, () => {
            void chrome.runtime.lastError;
          });
        });
      });
    }
  });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "search") {
    const query = msg.query || "";

    function uniqueByUrl(items) {
      const seen = new Set();
      const out = [];
      for (const it of items) {
        if (it && it.url && !seen.has(it.url)) {
          seen.add(it.url);
          out.push(it);
        }
      }
      return out;
    }

    const pBookmarksSearch = new Promise((resolve) => {
      chrome.bookmarks.search(query, (nodes) => {
        resolve(
          nodes
            .filter((n) => n.url)
            .slice(0, 50)
            .map((n) => ({ title: n.title || n.url, url: n.url, source: "bookmark" }))
        );
      });
    });

    const pBookmarksAll = new Promise((resolve) => {
      chrome.bookmarks.getTree((trees) => {
        const items = [];
        (function walk(nodes) {
          for (const n of nodes || []) {
            if (n.url) items.push({ title: n.title || n.url, url: n.url, source: "bookmark" });
            if (n.children) walk(n.children);
          }
        })(trees);
        resolve(items.slice(0, 500));
      });
    });

    const pHistorySearch = new Promise((resolve) => {
      chrome.history.search({ text: query, maxResults: 50 }, (items) => {
        resolve(items.map((i) => ({ title: i.title || i.url, url: i.url, source: "history" })));
      });
    });

    const pHistoryRecent = new Promise((resolve) => {
      chrome.history.search({ text: "", maxResults: 100 }, (items) => {
        resolve(items.map((i) => ({ title: i.title || i.url, url: i.url, source: "history" })));
      });
    });

    Promise.all([pBookmarksSearch, pBookmarksAll, pHistorySearch, pHistoryRecent]).then(([bmSearch, bmAll, hSearch, hRecent]) => {
      const bookmarks = uniqueByUrl([...bmSearch, ...bmAll]).slice(0, 500);
      const history = uniqueByUrl([...hSearch, ...hRecent]).slice(0, 150);
      sendResponse({ bookmarks, history });
    });
    return true; // async response
  }

  if (msg.action === "open-tab") {
    chrome.tabs.create({ url: msg.url });
  }
});

// Also allow clicking the extension icon to toggle
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab?.url || "";
  const restricted = !tab ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    url.startsWith("about:") ||
    url.includes("chrome.google.com/webstore");

  if (restricted) {
    try { await chrome.action.openPopup(); } catch (_) { /* ignore */ }
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, (response) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["shared.css", "content.css"]
      }, () => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["shared.js", "content.js"]
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, () => {
            void chrome.runtime.lastError;
          });
        });
      });
    }
  });
});
