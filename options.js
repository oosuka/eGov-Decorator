const DEFAULT_BG_COLOR = '#e6e6e6';
const DEFAULT_TEXT_COLOR = '#ffffff';

function showStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
    }
  }, 1500);
}

function setInputs(bgColor, textColor) {
  document.getElementById('bgColor').value = bgColor;
  document.getElementById('textColor').value = textColor;
}

function loadSettings() {
  chrome.storage.local.get(['highlightBgColor', 'highlightTextColor'], (result) => {
    setInputs(
      result.highlightBgColor || DEFAULT_BG_COLOR,
      result.highlightTextColor || DEFAULT_TEXT_COLOR
    );
  });
}

function saveSettings(bgColor, textColor) {
  chrome.storage.local.set({
    highlightBgColor: bgColor,
    highlightTextColor: textColor
  }, () => {
    showStatus('保存しました');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('color-form');
  const resetBtn = document.getElementById('resetBtn');

  loadSettings();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const bgColor = document.getElementById('bgColor').value;
    const textColor = document.getElementById('textColor').value;
    saveSettings(bgColor, textColor);
  });

  resetBtn.addEventListener('click', () => {
    setInputs(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR);
    saveSettings(DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR);
  });
});
