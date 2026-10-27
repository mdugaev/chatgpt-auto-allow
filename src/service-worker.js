"use strict";

const ENABLED_TABS_KEY = "enabledTabs";
let mutationQueue = Promise.resolve();

function serialize(operation) {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.catch(() => {});
  return next;
}

async function readEnabledTabs() {
  const result = await chrome.storage.session.get(ENABLED_TABS_KEY);
  const value = result[ENABLED_TABS_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function updateBadge(tabId, enabled) {
  try {
    await chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" });
    if (enabled) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#177d58" });
  } catch { /* The badge is cosmetic; storage remains authoritative. */ }
}

function getEnabled(tabId) {
  return serialize(async () => {
    const tabs = await readEnabledTabs();
    const enabled = tabs[String(tabId)] === true;
    await updateBadge(tabId, enabled);
    return { enabled };
  });
}

function setEnabled(tabId, enabled) {
  return serialize(async () => {
    const tabs = await readEnabledTabs();
    if (enabled) tabs[String(tabId)] = true;
    else delete tabs[String(tabId)];
    await chrome.storage.session.set({ [ENABLED_TABS_KEY]: tabs });
    await updateBadge(tabId, enabled);
    return { enabled };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !Number.isInteger(sender.tab?.id)) return false;
  const tabId = sender.tab.id;
  if (message.type === "GET_TAB_ENABLED") {
    getEnabled(tabId).then(sendResponse).catch(() => sendResponse({ enabled: false, error: true }));
    return true;
  }
  if (message.type === "SET_TAB_ENABLED") {
    setEnabled(tabId, message.enabled === true)
      .then((state) => sendResponse({ ok: true, ...state }))
      .catch(() => sendResponse({ ok: false, enabled: false }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setEnabled(tabId, false).catch(() => {});
});
