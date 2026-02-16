const TARGET_URL_PATTERN = /^https:\/\/(?:elaws|laws)\.e-gov\.go\.jp\//;
const DECORATOR_ENABLED_KEY = "decoratorEnabled";
const BADGE_TEXT_ON = "ON";
const BADGE_TEXT_OFF = "OFF";
const BADGE_BG_ON = "#d93025";
const BADGE_BG_OFF = "#188038";
const actionApi = chrome.action || chrome.browserAction;
const badgeStateCache = new Map();

function isTargetUrl(url) {
  return typeof url === "string" && TARGET_URL_PATTERN.test(url);
}

function isDecoratorEnabled(value) {
  return value !== false;
}

function getStoredDecoratorEnabled(result) {
  return isDecoratorEnabled(result[DECORATOR_ENABLED_KEY]);
}

function setBadgeForTab(tabId, url, enabled) {
  if (tabId == null || !actionApi) return;
  const isTarget = isTargetUrl(url);
  const nextBadgeState = isTarget ? (enabled ? "on" : "off") : "hidden";
  if (badgeStateCache.get(tabId) === nextBadgeState) return;

  if (typeof actionApi.setPopup === "function") {
    actionApi.setPopup({ tabId, popup: isTarget ? "src/popup.html" : "" });
  }

  if (!isTarget) {
    actionApi.setBadgeText({ tabId, text: "" });
    badgeStateCache.set(tabId, nextBadgeState);
    return;
  }

  const text = enabled ? BADGE_TEXT_ON : BADGE_TEXT_OFF;
  const color = enabled ? BADGE_BG_ON : BADGE_BG_OFF;
  actionApi.setBadgeText({ tabId, text });
  actionApi.setBadgeBackgroundColor({ tabId, color });
  badgeStateCache.set(tabId, nextBadgeState);
}

function withDecoratorEnabled(callback) {
  chrome.storage.local.get([DECORATOR_ENABLED_KEY], (result) => {
    // Treat any value other than explicit false (including undefined / missing) as enabled by default.
    callback(getStoredDecoratorEnabled(result));
  });
}

function refreshBadgeForTab(tabId, url) {
  withDecoratorEnabled((enabled) => {
    setBadgeForTab(tabId, url, enabled);
  });
}

function refreshBadgeForActiveTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    refreshBadgeForTab(tab.id, tab.url);
  });
}

function refreshBadgeForAllTabs(enabled) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id == null) return;
      setBadgeForTab(tab.id, tab.url, enabled);
    });
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-decorator") {
    chrome.storage.local.get([DECORATOR_ENABLED_KEY], (result) => {
      const newStatus = !getStoredDecoratorEnabled(result);
      chrome.storage.local.set({ [DECORATOR_ENABLED_KEY]: newStatus }, () => {
        refreshBadgeForAllTabs(newStatus);
      });
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ [DECORATOR_ENABLED_KEY]: true });
  refreshBadgeForAllTabs(true);
});

chrome.runtime.onStartup.addListener(() => {
  withDecoratorEnabled(refreshBadgeForAllTabs);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    refreshBadgeForTab(activeInfo.tabId, tab?.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === "string") {
    refreshBadgeForTab(tabId, changeInfo.url);
    return;
  }

  if (changeInfo.status === "complete" && tab && typeof tab.url === "string") {
    refreshBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  badgeStateCache.delete(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  refreshBadgeForActiveTab();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[DECORATOR_ENABLED_KEY]) return;
  const { oldValue, newValue } = changes[DECORATOR_ENABLED_KEY];
  if (oldValue === newValue) return;
  const enabled = isDecoratorEnabled(newValue);
  refreshBadgeForAllTabs(enabled);
});
