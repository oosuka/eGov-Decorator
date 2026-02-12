function createHighlightedElement(text) {
  const span = document.createElement('span');
  span.className = 'highlight';
  span.textContent = text;
  return span;
}

const BRACKET_PATTERN = /（.*?）/;
const DEFAULT_BG_COLOR = '#e6e6e6';
const DEFAULT_TEXT_COLOR = '#ffffff';

// テキストノードを分解し、対応する全角括弧の範囲だけを span.highlight で包む
function applyHighlightToNode(node) {
  let text = node.textContent;
  let startIndex = 0;
  let openBrackets = 0;
  const docFragment = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '（') {
      if (openBrackets === 0) startIndex = i;
      openBrackets++;
    } else if (text[i] === '）') {
      openBrackets--;
      if (openBrackets === 0) {
        if (startIndex > 0) {
          docFragment.appendChild(document.createTextNode(text.slice(0, startIndex)));
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

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let node;

  while ((node = walker.nextNode())) {
    const parent = node.parentNode;
    if (!parent) continue;

    const parentName = parent.nodeName.toLowerCase();
    const isValidParent = !['script', 'style'].includes(parentName);
    const isAlreadyHighlighted = parent.classList && parent.classList.contains('highlight');
    if (isValidParent && !isAlreadyHighlighted && BRACKET_PATTERN.test(node.nodeValue)) {
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

  root.style.setProperty('--egov-highlight-bg', bgColor || DEFAULT_BG_COLOR);
  root.style.setProperty('--egov-highlight-text', textColor || DEFAULT_TEXT_COLOR);
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
    document.querySelectorAll('span.highlight').forEach((span) => {
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
  characterData: true
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
  chrome.storage.local.get(['decoratorEnabled', 'highlightBgColor', 'highlightTextColor'], (result) => {
    decoratorEnabled = result.decoratorEnabled !== false;
    applyHighlightColors(result.highlightBgColor, result.highlightTextColor);
    startObserverWhenReady();
    setDecoratorEnabled(decoratorEnabled);
  });
}

// 読み込み済みなら即初期化、未完了なら DOMContentLoaded 待ち
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDecorator, { once: true });
} else {
  initializeDecorator();
}

// メッセージ受信時は現在の状態を再適用だけ行う（状態変更は storage.onChanged を正とする）
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'toggle-decorator') {
    setDecoratorEnabled(decoratorEnabled);
  }
});

// storage 変更時のみメモリ状態を更新して反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.highlightBgColor || changes.highlightTextColor) {
    applyHighlightColors(
      changes.highlightBgColor ? changes.highlightBgColor.newValue : undefined,
      changes.highlightTextColor ? changes.highlightTextColor.newValue : undefined
    );
  }

  if (changes.decoratorEnabled) {
    const nextValue = !!changes.decoratorEnabled.newValue;
    if (nextValue !== decoratorEnabled) {
      setDecoratorEnabled(nextValue);
    }
  }
});
