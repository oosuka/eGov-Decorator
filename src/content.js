function createHighlightedElement(text) {
  const span = document.createElement("span");
  span.className = "highlight";
  span.textContent = text;
  return span;
}

const BRACKET_PATTERN = /（.*?）/;
const DEFAULT_BG_COLOR = "#e6e6e6";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DECORATOR_ENABLED_KEY = "decoratorEnabled";
const HIGHLIGHT_BG_COLOR_KEY = "highlightBgColor";
const HIGHLIGHT_TEXT_COLOR_KEY = "highlightTextColor";
let currentHighlightBgColor = DEFAULT_BG_COLOR;
let currentHighlightTextColor = DEFAULT_TEXT_COLOR;

function getColorOrDefault(value, defaultColor) {
  return value || defaultColor;
}

function getStoredColor(result, key, defaultColor) {
  return getColorOrDefault(result[key], defaultColor);
}

function isDecoratorEnabled(value) {
  return value !== false;
}

function applyColorChanges(changes) {
  let shouldUpdateColors = false;

  if (changes[HIGHLIGHT_BG_COLOR_KEY]) {
    currentHighlightBgColor = getColorOrDefault(
      changes[HIGHLIGHT_BG_COLOR_KEY].newValue,
      DEFAULT_BG_COLOR,
    );
    shouldUpdateColors = true;
  }
  if (changes[HIGHLIGHT_TEXT_COLOR_KEY]) {
    currentHighlightTextColor = getColorOrDefault(
      changes[HIGHLIGHT_TEXT_COLOR_KEY].newValue,
      DEFAULT_TEXT_COLOR,
    );
    shouldUpdateColors = true;
  }
  if (shouldUpdateColors) {
    applyHighlightColors(currentHighlightBgColor, currentHighlightTextColor);
  }
}

function notifyContentReady() {
  if (!chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
    return;
  }
  try {
    chrome.runtime.sendMessage({ type: "egov-content-ready" });
  } catch {
    // Ignore transient sendMessage failures when background is restarting.
  }
}

// テキストノードを分解し、対応する全角括弧の範囲だけを span.highlight で包む
function applyHighlightToNode(node) {
  let text = node.textContent;
  let startIndex = 0;
  let openBrackets = 0;
  const docFragment = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "（") {
      if (openBrackets === 0) startIndex = i;
      openBrackets++;
    } else if (text[i] === "）") {
      openBrackets--;
      if (openBrackets === 0) {
        if (startIndex > 0) {
          docFragment.appendChild(
            document.createTextNode(text.slice(0, startIndex)),
          );
        }
        const matchedText = text.slice(startIndex, i + 1);
        docFragment.appendChild(createHighlightedElement(matchedText));
        text = text.slice(i + 1);
        i = -1;
      }
    }
  }

  if (text.length > 0) {
    docFragment.appendChild(document.createTextNode(text));
  }

  return docFragment;
}

function collectDecoratableTextNodes(root) {
  if (!root) return [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );
  const nodes = [];
  let node;

  while ((node = walker.nextNode())) {
    const parent = node.parentNode;
    if (!parent) continue;

    const parentName = parent.nodeName.toLowerCase();
    const isValidParent = !["script", "style"].includes(parentName);
    const isAlreadyHighlighted =
      parent.classList && parent.classList.contains("highlight");
    if (
      isValidParent &&
      !isAlreadyHighlighted &&
      BRACKET_PATTERN.test(node.nodeValue)
    ) {
      nodes.push(node);
    }
  }

  return nodes;
}

function applyHighlightInRoot(root) {
  const nodes = collectDecoratableTextNodes(root);
  nodes.forEach((node) => {
    const parent = node.parentNode;
    if (parent) {
      const highlightedContent = applyHighlightToNode(node);
      parent.replaceChild(highlightedContent, node);
    }
  });
}

function applyHighlightColors(bgColor, textColor) {
  const root = document.documentElement;
  if (!root) return;

  root.style.setProperty("--egov-highlight-bg", bgColor || DEFAULT_BG_COLOR);
  root.style.setProperty(
    "--egov-highlight-text",
    textColor || DEFAULT_TEXT_COLOR,
  );
}

function withObserverPaused(callback) {
  const wasObserving = isObserving && !!document.body;
  if (wasObserving) {
    observer.disconnect();
    isObserving = false;
  }

  callback();

  if (wasObserving && document.body) {
    observer.observe(document.body, observerConfig);
    isObserving = true;
  }
}

function applyHighlight(root = document.body) {
  withObserverPaused(() => {
    applyHighlightInRoot(root);
  });
}

function removeHighlight() {
  withObserverPaused(() => {
    document.querySelectorAll("span.highlight").forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
      }
    });
  });
}

const observerConfig = {
  childList: true,
  subtree: true,
  characterData: true,
};

let decoratorEnabled = true;
let isObserving = false;
let scheduled = false;

// 変更通知は1フレームにまとめ、全体再走査の回数を抑える
function scheduleHighlightRefresh() {
  if (!decoratorEnabled || scheduled) return;

  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (decoratorEnabled) {
      applyHighlight();
    }
  });
}

function setDecoratorEnabled(enabled) {
  decoratorEnabled = enabled;
  if (decoratorEnabled) {
    applyHighlight();
  } else {
    removeHighlight();
  }
}

const observer = new MutationObserver(() => {
  scheduleHighlightRefresh();
});

function startObserverWhenReady() {
  if (document.body && !isObserving) {
    observer.observe(document.body, observerConfig);
    isObserving = true;
    return;
  }

  requestAnimationFrame(startObserverWhenReady);
}

function initializeDecorator() {
  // storage は初期化時に1回だけ読み込み、以降はメモリ状態を参照する
  chrome.storage.local.get(
    [DECORATOR_ENABLED_KEY, HIGHLIGHT_BG_COLOR_KEY, HIGHLIGHT_TEXT_COLOR_KEY],
    (result) => {
      decoratorEnabled = isDecoratorEnabled(result[DECORATOR_ENABLED_KEY]);
      currentHighlightBgColor = getStoredColor(
        result,
        HIGHLIGHT_BG_COLOR_KEY,
        DEFAULT_BG_COLOR,
      );
      currentHighlightTextColor = getStoredColor(
        result,
        HIGHLIGHT_TEXT_COLOR_KEY,
        DEFAULT_TEXT_COLOR,
      );
      applyHighlightColors(currentHighlightBgColor, currentHighlightTextColor);
      startObserverWhenReady();
      setDecoratorEnabled(decoratorEnabled);
      notifyContentReady();
    },
  );
}

// 読み込み済みなら即初期化、未完了なら DOMContentLoaded 待ち
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDecorator, {
    once: true,
  });
} else {
  initializeDecorator();
}

// storage 変更時のみメモリ状態を更新して反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  applyColorChanges(changes);

  if (changes[DECORATOR_ENABLED_KEY]) {
    const nextValue = isDecoratorEnabled(
      changes[DECORATOR_ENABLED_KEY].newValue,
    );
    if (nextValue !== decoratorEnabled) {
      setDecoratorEnabled(nextValue);
    }
  }
});
