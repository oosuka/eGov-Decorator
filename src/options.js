const DEFAULT_BG_COLOR = "#e6e6e6";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DECORATOR_ENABLED_KEY = "decoratorEnabled";
const HIGHLIGHT_LEVEL_KEY = "highlightLevel";
const HIGHLIGHT_BG_COLOR_KEY = "highlightBgColor";
const HIGHLIGHT_TEXT_COLOR_KEY = "highlightTextColor";
const DEFAULT_HIGHLIGHT_LEVEL = 0;
const OFF_HIGHLIGHT_LEVEL = 4;
const MAX_HIGHLIGHT_LEVEL = OFF_HIGHLIGHT_LEVEL;
const STATUS_CLEAR_DELAY_MS = 1500;

function byId(id) {
  return document.getElementById(id);
}

function getColorOrDefault(value, defaultColor) {
  return value || defaultColor;
}

function showStatus(message) {
  const status = byId("status");
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, STATUS_CLEAR_DELAY_MS);
}

function setInputs(bgColor, textColor) {
  byId("bgColor").value = bgColor;
  byId("textColor").value = textColor;
}

function setHighlightLevelInput(highlightLevel) {
  byId("highlightLevel").value = String(highlightLevel);
}

function loadSettings() {
  chrome.storage.local.get(
    [
      HIGHLIGHT_BG_COLOR_KEY,
      HIGHLIGHT_TEXT_COLOR_KEY,
      HIGHLIGHT_LEVEL_KEY,
      DECORATOR_ENABLED_KEY,
    ],
    (result) => {
      setInputs(
        getStoredColor(result, HIGHLIGHT_BG_COLOR_KEY, DEFAULT_BG_COLOR),
        getStoredColor(result, HIGHLIGHT_TEXT_COLOR_KEY, DEFAULT_TEXT_COLOR),
      );
      setHighlightLevelInput(getStoredHighlightLevel(result));
    },
  );
}

function getStoredColor(result, key, defaultColor) {
  const items = result && typeof result === "object" ? result : {};
  return getColorOrDefault(items[key], defaultColor);
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
  const items = result && typeof result === "object" ? result : {};
  const normalizedLevel = normalizeHighlightLevel(items[HIGHLIGHT_LEVEL_KEY]);
  if (normalizedLevel != null) {
    return normalizedLevel;
  }
  return isDecoratorEnabled(items[DECORATOR_ENABLED_KEY])
    ? DEFAULT_HIGHLIGHT_LEVEL
    : OFF_HIGHLIGHT_LEVEL;
}

function isHighlightEnabled(level) {
  return level !== OFF_HIGHLIGHT_LEVEL;
}

function saveSettings(bgColor, textColor, highlightLevel) {
  const normalizedLevel =
    normalizeHighlightLevel(highlightLevel) ?? DEFAULT_HIGHLIGHT_LEVEL;
  chrome.storage.local.set(
    {
      [HIGHLIGHT_BG_COLOR_KEY]: bgColor,
      [HIGHLIGHT_TEXT_COLOR_KEY]: textColor,
      [HIGHLIGHT_LEVEL_KEY]: normalizedLevel,
      [DECORATOR_ENABLED_KEY]: isHighlightEnabled(normalizedLevel),
    },
    () => {
      showStatus("保存しました");
    },
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const form = byId("color-form");
  const resetBtn = byId("resetBtn");
  const bgColorInput = byId("bgColor");
  const textColorInput = byId("textColor");
  const highlightLevelInput = byId("highlightLevel");

  loadSettings();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const bgColor = bgColorInput.value;
    const textColor = textColorInput.value;
    saveSettings(bgColor, textColor, highlightLevelInput.value);
  });

  resetBtn.addEventListener("click", () => {
    setInputs(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR);
    setHighlightLevelInput(DEFAULT_HIGHLIGHT_LEVEL);
    saveSettings(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR, DEFAULT_HIGHLIGHT_LEVEL);
  });
});
