const DEFAULT_BG_COLOR = "#e6e6e6";
const DEFAULT_TEXT_COLOR = "#ffffff";
const HIGHLIGHT_BG_COLOR_KEY = "highlightBgColor";
const HIGHLIGHT_TEXT_COLOR_KEY = "highlightTextColor";
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

function loadSettings() {
  chrome.storage.local.get(
    [HIGHLIGHT_BG_COLOR_KEY, HIGHLIGHT_TEXT_COLOR_KEY],
    (result) => {
      setInputs(
        getColorOrDefault(result.highlightBgColor, DEFAULT_BG_COLOR),
        getColorOrDefault(result.highlightTextColor, DEFAULT_TEXT_COLOR),
      );
    },
  );
}

function saveSettings(bgColor, textColor) {
  chrome.storage.local.set(
    {
      [HIGHLIGHT_BG_COLOR_KEY]: bgColor,
      [HIGHLIGHT_TEXT_COLOR_KEY]: textColor,
    },
    () => {
      showStatus("保存しました");
    },
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const form = byId("color-form");
  const resetBtn = byId("resetBtn");

  loadSettings();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const bgColor = byId("bgColor").value;
    const textColor = byId("textColor").value;
    saveSettings(bgColor, textColor);
  });

  resetBtn.addEventListener("click", () => {
    setInputs(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR);
    saveSettings(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR);
  });
});
