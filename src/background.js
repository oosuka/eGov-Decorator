const TARGET_URL_PATTERN = /^https:\/\/(?:elaws|laws)\.e-gov\.go\.jp\/law\//;
const DECORATOR_ENABLED_KEY = "decoratorEnabled";
const HIGHLIGHT_LEVEL_KEY = "highlightLevel";
const DEFAULT_HIGHLIGHT_LEVEL = 0;
const OFF_HIGHLIGHT_LEVEL = 4;
const MAX_HIGHLIGHT_LEVEL = OFF_HIGHLIGHT_LEVEL;
const BADGE_TEXT_OFF = "OFF";
const BADGE_BG_ON = "#d93025";
const BADGE_BG_OFF = "#188038";
const ENABLED_POPUP_PATH = "src/popup.html";
const DISABLED_POPUP_PATH = "src/popup-disabled.html";
const CONTENT_FORCE_SYNC_MESSAGE = { type: "egov-force-sync" };
const actionApi = chrome.action || chrome.browserAction;
const badgeStateCache = new Map();
const contentSyncUrlCache = new Map();
const NO_TAB_WITH_ID_ERROR_PREFIX = "No tab with id:";
const ACTION_API_ERROR_PREFIX = "[e-Gov Decorator] action API call failed:";

function isTargetUrl(url) {
  return typeof url === "string" && TARGET_URL_PATTERN.test(url);
}

function isDecoratorEnabled(value) {
  return value !== false;
}

function normalizeHighlightLevel(value) {
  const level = Number(value);
  if (!Number.isInteger(level)) return null;
  if (level < DEFAULT_HIGHLIGHT_LEVEL || level > MAX_HIGHLIGHT_LEVEL) {
    return null;
  }
  return level;
}

function getStoredHighlightLevel(result) {
  const normalizedLevel = normalizeHighlightLevel(result[HIGHLIGHT_LEVEL_KEY]);
  if (normalizedLevel != null) {
    return normalizedLevel;
  }
  return isDecoratorEnabled(result[DECORATOR_ENABLED_KEY])
    ? DEFAULT_HIGHLIGHT_LEVEL
    : OFF_HIGHLIGHT_LEVEL;
}

function isHighlightEnabled(level) {
  return level !== OFF_HIGHLIGHT_LEVEL;
}

function getBadgeText(level) {
  return isHighlightEnabled(level) ? `H${level + 1}` : BADGE_TEXT_OFF;
}

function getBadgeColor(level) {
  return isHighlightEnabled(level) ? BADGE_BG_ON : BADGE_BG_OFF;
}

function getNextHighlightLevel(level) {
  if (level >= MAX_HIGHLIGHT_LEVEL || level < DEFAULT_HIGHLIGHT_LEVEL) {
    return DEFAULT_HIGHLIGHT_LEVEL;
  }
  return level + 1;
}

function isNoTabWithIdError(error) {
  return (
    typeof error?.message === "string" &&
    error.message.startsWith(NO_TAB_WITH_ID_ERROR_PREFIX)
  );
}

function runActionApiCall(tabId, fn) {
  try {
    const maybePromise = fn();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch((error) => {
        badgeStateCache.delete(tabId);
        if (isNoTabWithIdError(error)) return;
        console.error(ACTION_API_ERROR_PREFIX, error);
      });
    }
    return true;
  } catch (error) {
    badgeStateCache.delete(tabId);
    if (isNoTabWithIdError(error)) {
      return false;
    }
    console.error(ACTION_API_ERROR_PREFIX, error);
    return true;
  }
}

function setBadgeForTab(tabId, url, highlightLevel) {
  if (tabId == null || !actionApi) return;
  const isTarget = isTargetUrl(url);
  const nextBadgeState = isTarget ? `level-${highlightLevel}` : "hidden";
  if (badgeStateCache.get(tabId) === nextBadgeState) return;

  if (typeof actionApi.setPopup === "function") {
    if (
      !runActionApiCall(tabId, () =>
        actionApi.setPopup({
          tabId,
          popup: isTarget ? ENABLED_POPUP_PATH : DISABLED_POPUP_PATH,
        }),
      )
    ) {
      return;
    }
  }

  if (!isTarget) {
    if (
      !runActionApiCall(tabId, () =>
        actionApi.setBadgeText({ tabId, text: "" }),
      )
    ) {
      return;
    }
    badgeStateCache.set(tabId, nextBadgeState);
    return;
  }

  if (
    !runActionApiCall(tabId, () =>
      actionApi.setBadgeText({ tabId, text: getBadgeText(highlightLevel) }),
    )
  ) {
    return;
  }
  if (
    !runActionApiCall(tabId, () =>
      actionApi.setBadgeBackgroundColor({
        tabId,
        color: getBadgeColor(highlightLevel),
      }),
    )
  ) {
    return;
  }
  badgeStateCache.set(tabId, nextBadgeState);
}

function withHighlightLevel(callback) {
  chrome.storage.local.get(
    [HIGHLIGHT_LEVEL_KEY, DECORATOR_ENABLED_KEY],
    (result) => {
      callback(getStoredHighlightLevel(result));
    },
  );
}

function saveHighlightLevel(highlightLevel, callback) {
  chrome.storage.local.set(
    {
      [HIGHLIGHT_LEVEL_KEY]: highlightLevel,
      // Keep legacy key in sync for backward compatibility.
      [DECORATOR_ENABLED_KEY]: isHighlightEnabled(highlightLevel),
    },
    callback,
  );
}

function readHighlightLevelFromChanges(changes) {
  if (changes[HIGHLIGHT_LEVEL_KEY]) {
    const normalized = normalizeHighlightLevel(
      changes[HIGHLIGHT_LEVEL_KEY].newValue,
    );
    return normalized != null ? normalized : DEFAULT_HIGHLIGHT_LEVEL;
  }
  if (changes[DECORATOR_ENABLED_KEY]) {
    return isDecoratorEnabled(changes[DECORATOR_ENABLED_KEY].newValue)
      ? DEFAULT_HIGHLIGHT_LEVEL
      : OFF_HIGHLIGHT_LEVEL;
  }
  return null;
}

function refreshBadgeForTab(tabId, url) {
  withHighlightLevel((highlightLevel) => {
    setBadgeForTab(tabId, url, highlightLevel);
  });
}

function requestContentSyncForTab(tabId, url) {
  if (
    tabId == null ||
    typeof url !== "string" ||
    !chrome.tabs ||
    typeof chrome.tabs.sendMessage !== "function"
  ) {
    return;
  }
  if (contentSyncUrlCache.get(tabId) === url) return;
  chrome.tabs.sendMessage(tabId, CONTENT_FORCE_SYNC_MESSAGE, () => {
    // Ignore missing receiver errors; content script may not be loaded yet.
    if (chrome.runtime.lastError) return;
    contentSyncUrlCache.set(tabId, url);
  });
}

function refreshBadgeForActiveTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    refreshBadgeForTab(tab.id, tab.url);
  });
}

function refreshBadgeForAllTabs(highlightLevel) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id == null) return;
      setBadgeForTab(tab.id, tab.url, highlightLevel);
    });
  });
}

function refreshBadgeForAllTabsFromStorage() {
  withHighlightLevel(refreshBadgeForAllTabs);
}

function handleContentReadyMessage(message, sender) {
  if (!message || message.type !== "egov-content-ready") return;
  const senderTab = sender && sender.tab;
  if (!senderTab || senderTab.id == null) return;
  refreshBadgeForTab(senderTab.id, senderTab.url);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-decorator") {
    withHighlightLevel((currentLevel) => {
      const nextLevel = getNextHighlightLevel(currentLevel);
      saveHighlightLevel(nextLevel, () => {
        refreshBadgeForAllTabs(nextLevel);
      });
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  saveHighlightLevel(DEFAULT_HIGHLIGHT_LEVEL);
  refreshBadgeForAllTabs(DEFAULT_HIGHLIGHT_LEVEL);
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadgeForAllTabsFromStorage();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    refreshBadgeForTab(activeInfo.tabId, tab?.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    badgeStateCache.delete(tabId);
    contentSyncUrlCache.delete(tabId);
  }

  if (typeof changeInfo.url === "string") {
    refreshBadgeForTab(tabId, changeInfo.url);
    requestContentSyncForTab(tabId, changeInfo.url);
  }

  if (changeInfo.status === "complete" && tab && typeof tab.url === "string") {
    refreshBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  badgeStateCache.delete(tabId);
  contentSyncUrlCache.delete(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  refreshBadgeForActiveTab();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const highlightLevel = readHighlightLevelFromChanges(changes);
  if (highlightLevel == null) return;
  refreshBadgeForAllTabs(highlightLevel);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  handleContentReadyMessage(message, sender);
});

// Ensure popup/badge state is initialized even when the service worker is reloaded mid-session.
refreshBadgeForAllTabsFromStorage();
