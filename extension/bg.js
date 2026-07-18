/**
 * Terrace background worker. Content scripts hold their own socket (works on the
 * demo pages), and just ask us to raise native desktop notifications for goals,
 * cards, and settlements — those require the extension context.
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "notify") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: msg.title || "Terrace",
      message: msg.body || "",
      priority: 2,
    });
  }
});
