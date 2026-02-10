// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-spottr") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("brave://")) return;
      chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not yet injected, inject it first
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          }, () => {
            chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ["content.css"]
            }, () => {
              chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" });
            });
          });
        }
      });
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "search") {
    const query = msg.query;
    Promise.all([
      new Promise((resolve) => {
        chrome.bookmarks.search(query, (nodes) => {
          resolve(
            nodes
              .filter((n) => n.url)
              .slice(0, 10)
              .map((n) => ({ title: n.title || n.url, url: n.url, source: "bookmark" }))
          );
        });
      }),
      new Promise((resolve) => {
        chrome.history.search({ text: query, maxResults: 10 }, (items) => {
          resolve(
            items.map((i) => ({ title: i.title || i.url, url: i.url, source: "history" }))
          );
        });
      }),
    ]).then(([bookmarks, history]) => {
      sendResponse({ bookmarks, history });
    });
    return true; // async response
  }

  if (msg.action === "open-tab") {
    chrome.tabs.create({ url: msg.url });
  }
});

// Also allow clicking the extension icon to toggle
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("brave://")) return;
  chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" }, (response) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }, () => {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content.css"]
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: "toggle-spottr" });
        });
      });
    }
  });
});
