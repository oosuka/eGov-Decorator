const TARGET_URL_PATTERN = /^https:\/\/(?:elaws|laws)\.e-gov\.go\.jp\//;
const BADGE_TEXT_ON = "ON";
const BADGE_TEXT_OFF = "OFF";
const BADGE_BG_ON = "#d93025";
const BADGE_BG_OFF = "#188038";
const actionApi = chrome.action || chrome.browserAction;

function isTargetUrl(url) {
  return typeof url === "string" && TARGET_URL_PATTERN.test(url);
}

function setBadgeForTab(tabId, url, enabled) {
  if (tabId == null || !actionApi) return;
  const isTarget = isTargetUrl(url);
  if (typeof actionApi.setPopup === "function") {
    actionApi.setPopup({ tabId, popup: isTarget ? "popup.html" : "" });
  }

  if (!isTarget) {
    actionApi.setBadgeText({ tabId, text: "" });
    return;
  }

  const text = enabled ? BADGE_TEXT_ON : BADGE_TEXT_OFF;
  const color = enabled ? BADGE_BG_ON : BADGE_BG_OFF;
  actionApi.setBadgeText({ tabId, text });
  actionApi.setBadgeBackgroundColor({ tabId, color });
}

function withDecoratorEnabled(callback) {
  chrome.storage.local.get(["decoratorEnabled"], (result) => {
    callback(result.decoratorEnabled !== false);
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

function refreshBadgeForAllTabsFromStorage() {
  withDecoratorEnabled((enabled) => {
    refreshBadgeForAllTabs(enabled);
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-decorator") {
    chrome.storage.local.get(["decoratorEnabled"], (result) => {
      const newStatus = !result.decoratorEnabled;
      chrome.storage.local.set({ decoratorEnabled: newStatus }, () => {
        refreshBadgeForAllTabs(newStatus);
      });
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ decoratorEnabled: true });
  refreshBadgeForAllTabs(true);
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadgeForAllTabsFromStorage();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    refreshBadgeForTab(activeInfo.tabId, tab && tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === "string") {
    refreshBadgeForTab(tabId, changeInfo.url);
    return;
  }

  if (changeInfo.status === "complete") {
    refreshBadgeForTab(tabId, tab && tab.url);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  refreshBadgeForActiveTab();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.decoratorEnabled) return;
  const enabled = changes.decoratorEnabled.newValue !== false;
  refreshBadgeForAllTabs(enabled);
});
