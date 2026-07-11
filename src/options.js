const {
  DEFAULT_BG_COLOR,
  DEFAULT_TEXT_COLOR,
  DEFAULT_HIGHLIGHT_LEVEL,
  STORAGE_KEYS,
  getStoredColor,
  getStoredHighlightLevel,
  createHighlightLevelStorage,
} = globalThis.EgovDecoratorSettings;

const DECORATOR_ENABLED_KEY = STORAGE_KEYS.decoratorEnabled;
const HIGHLIGHT_LEVEL_KEY = STORAGE_KEYS.highlightLevel;
const HIGHLIGHT_BG_COLOR_KEY = STORAGE_KEYS.highlightBgColor;
const HIGHLIGHT_TEXT_COLOR_KEY = STORAGE_KEYS.highlightTextColor;
const STATUS_CLEAR_DELAY_MS = 1500;

function byId(id) {
  return document.getElementById(id);
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

function saveSettings(bgColor, textColor, highlightLevel) {
  chrome.storage.local.set(
    {
      [HIGHLIGHT_BG_COLOR_KEY]: bgColor,
      [HIGHLIGHT_TEXT_COLOR_KEY]: textColor,
      ...createHighlightLevelStorage(highlightLevel),
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
