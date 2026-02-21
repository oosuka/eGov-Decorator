function createHighlightedElement(text) {
  const span = document.createElement("span");
  span.className = "egov-highlight";
  span.textContent = text;
  return span;
}

const BRACKET_PATTERN = /[（）]/;
const TARGET_URL_PATTERN = /^https:\/\/(?:elaws|laws)\.e-gov\.go\.jp\/law\//;
const DEFAULT_BG_COLOR = "#e6e6e6";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DECORATOR_ENABLED_KEY = "decoratorEnabled";
const HIGHLIGHT_LEVEL_KEY = "highlightLevel";
const DEFAULT_HIGHLIGHT_LEVEL = 0;
const OFF_HIGHLIGHT_LEVEL = 4;
const MAX_HIGHLIGHT_LEVEL = OFF_HIGHLIGHT_LEVEL;
const CROSS_NODE_CONTAINER_TAGS = new Set([
  "p",
  "div",
  "li",
  "dd",
  "dt",
  "section",
  "article",
  "main",
  "aside",
  "blockquote",
]);
const UNSAFE_CROSS_NODE_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "colgroup",
  "col",
]);
const HIGHLIGHT_BG_COLOR_KEY = "highlightBgColor";
const HIGHLIGHT_TEXT_COLOR_KEY = "highlightTextColor";
let currentHighlightBgColor = DEFAULT_BG_COLOR;
let currentHighlightTextColor = DEFAULT_TEXT_COLOR;
let isCurrentUrlTarget = false;
let lastKnownUrl = "";
let observerRoot = null;

function getColorOrDefault(value, defaultColor) {
  return value || defaultColor;
}

function getStoredColor(result, key, defaultColor) {
  return getColorOrDefault(result[key], defaultColor);
}

function isDecoratorEnabled(value) {
  return value !== false;
}

function isTargetUrl(url) {
  return typeof url === "string" && TARGET_URL_PATTERN.test(url);
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

function getMinHighlightDepth(level) {
  return level + 1;
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

function appendSegment(docFragment, text, shouldHighlight) {
  if (!text) return;
  if (shouldHighlight) {
    docFragment.appendChild(createHighlightedElement(text));
    return;
  }
  docFragment.appendChild(document.createTextNode(text));
}

function buildHighlightFragmentWithDepth(
  text,
  minHighlightDepth,
  initialDepth,
) {
  if (!text || text.length === 0) {
    return {
      docFragment: document.createDocumentFragment(),
      endDepth: initialDepth,
      hasHighlight: false,
    };
  }

  let depth = initialDepth;
  const highlightByIndex = new Array(text.length).fill(false);
  const localOpenPositions = [];

  function shouldHighlightChar(char, position) {
    if (char === "（") {
      depth += 1;
      if (initialDepth === 0) {
        localOpenPositions.push(position);
      }
      return depth >= minHighlightDepth;
    }
    if (char === "）") {
      const shouldHighlight = depth >= minHighlightDepth;
      if (depth > 0) {
        depth -= 1;
        if (initialDepth === 0 && localOpenPositions.length > 0) {
          localOpenPositions.pop();
        }
      }
      return shouldHighlight;
    }
    return depth >= minHighlightDepth && depth > 0;
  }

  for (let i = 0; i < text.length; i++) {
    highlightByIndex[i] = shouldHighlightChar(text[i], i);
  }

  const danglingStart =
    initialDepth === 0 && localOpenPositions.length > 0
      ? localOpenPositions[0]
      : null;
  if (danglingStart != null) {
    for (let i = danglingStart; i < highlightByIndex.length; i++) {
      highlightByIndex[i] = false;
    }
  }

  const { docFragment: maskedFragment, hasHighlight } = buildFragmentFromMask(
    text,
    highlightByIndex,
  );
  return { docFragment: maskedFragment, endDepth: depth, hasHighlight };
}

// テキストノードを分解し、指定ネスト階層以降のみ span.egov-highlight で包む
function applyHighlightToNode(
  node,
  minHighlightDepth = getMinHighlightDepth(currentHighlightLevel),
) {
  const text = node.textContent || "";
  const { docFragment } = buildHighlightFragmentWithDepth(
    text,
    minHighlightDepth,
    0,
  );
  return docFragment;
}

function computeMatchedHighlightMask(text, minHighlightDepth) {
  const length = text.length;
  if (length === 0) return [];

  const diff = new Array(length + 1).fill(0);
  const openStack = [];

  for (let i = 0; i < length; i++) {
    const char = text[i];
    if (char === "（") {
      const depthAtOpen = openStack.length + 1;
      openStack.push({ index: i, depthAtOpen });
      continue;
    }
    if (char === "）" && openStack.length > 0) {
      const open = openStack.pop();
      if (open.depthAtOpen >= minHighlightDepth) {
        diff[open.index] += 1;
        diff[i + 1] -= 1;
      }
    }
  }

  const mask = new Array(length).fill(false);
  let active = 0;
  for (let i = 0; i < length; i++) {
    active += diff[i];
    mask[i] = active > 0;
  }
  return mask;
}

function buildFragmentFromMask(text, highlightMask) {
  const docFragment = document.createDocumentFragment();
  if (!text || text.length === 0) {
    return { docFragment, hasHighlight: false };
  }

  let hasHighlight = false;
  let segmentStart = 0;
  let currentSegmentHighlighted = !!highlightMask[0];

  if (currentSegmentHighlighted) {
    hasHighlight = true;
  }

  for (let i = 1; i < text.length; i++) {
    const shouldHighlight = !!highlightMask[i];
    if (shouldHighlight !== currentSegmentHighlighted) {
      appendSegment(
        docFragment,
        text.slice(segmentStart, i),
        currentSegmentHighlighted,
      );
      segmentStart = i;
      currentSegmentHighlighted = shouldHighlight;
      if (shouldHighlight) {
        hasHighlight = true;
      }
    }
  }

  appendSegment(
    docFragment,
    text.slice(segmentStart),
    currentSegmentHighlighted,
  );

  return { docFragment, hasHighlight };
}

function fragmentHasHighlight(fragment) {
  if (!fragment || !fragment.childNodes) return false;
  return Array.from(fragment.childNodes).some(
    (child) => child.classList && child.classList.contains("egov-highlight"),
  );
}

function shouldSkipTextNodeByParentName(parentName) {
  return parentName === "script" || parentName === "style";
}

function isInsideHighlightElement(node) {
  let current = node && node.parentNode;
  while (current) {
    if (current.classList && current.classList.contains("egov-highlight")) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function isHighlightableTextNode(node) {
  const parent = node && node.parentNode;
  if (!parent) return false;

  const parentName = parent.nodeName.toLowerCase();
  if (shouldSkipTextNodeByParentName(parentName)) {
    return false;
  }

  return !isInsideHighlightElement(node);
}

function collectHighlightableTextNodes(root) {
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
    if (isHighlightableTextNode(node)) {
      nodes.push(node);
    }
  }

  return nodes;
}

function getCrossNodeContainer(node) {
  let current = node && node.parentNode;

  while (current) {
    const tagName = current.nodeName && current.nodeName.toLowerCase();
    if (UNSAFE_CROSS_NODE_TAGS.has(tagName)) {
      return null;
    }
    if (CROSS_NODE_CONTAINER_TAGS.has(tagName)) {
      return current;
    }
    if (current === document.body) {
      return null;
    }
    current = current.parentNode;
  }

  return null;
}

function applyHighlightInContainer(root, minHighlightDepth) {
  const nodes = collectHighlightableTextNodes(root);
  if (nodes.length === 0) {
    return;
  }
  if (collectDecoratableTextNodes(nodes).length === 0) {
    return;
  }

  const groupedByContainer = new Map();

  nodes.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;

    const container = getCrossNodeContainer(node);
    const isCrossNodeEnabled = !!container;
    if (!isCrossNodeEnabled) {
      if (!BRACKET_PATTERN.test(node.nodeValue || "")) {
        return;
      }
      const highlightedContent = applyHighlightToNode(node, minHighlightDepth);
      if (fragmentHasHighlight(highlightedContent)) {
        parent.replaceChild(highlightedContent, node);
      }
      return;
    }

    if (!groupedByContainer.has(container)) {
      groupedByContainer.set(container, []);
    }
    groupedByContainer.get(container).push(node);
  });

  groupedByContainer.forEach((containerNodes) => {
    const texts = containerNodes.map((node) => node.textContent || "");
    const joinedText = texts.join("");
    if (!BRACKET_PATTERN.test(joinedText)) {
      return;
    }
    const highlightMask = computeMatchedHighlightMask(
      joinedText,
      minHighlightDepth,
    );

    let offset = 0;
    containerNodes.forEach((node, index) => {
      const text = texts[index];
      const nextOffset = offset + text.length;
      const nodeMask = highlightMask.slice(offset, nextOffset);
      const { docFragment, hasHighlight } = buildFragmentFromMask(
        text,
        nodeMask,
      );
      offset = nextOffset;

      if (hasHighlight) {
        const parent = node.parentNode;
        if (parent) {
          parent.replaceChild(docFragment, node);
        }
      }
    });
  });
}

function collectDecoratableTextNodes(rootOrNodes) {
  const nodes = Array.isArray(rootOrNodes)
    ? rootOrNodes
    : collectHighlightableTextNodes(rootOrNodes);
  return nodes.filter((node) => BRACKET_PATTERN.test(node.nodeValue || ""));
}

function applyHighlightInRoot(root) {
  const minHighlightDepth = getMinHighlightDepth(currentHighlightLevel);
  applyHighlightInContainer(root, minHighlightDepth);
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
  const wasObserving = isObserving && !!observerRoot;
  if (wasObserving) {
    observer.disconnect();
    isObserving = false;
    observerRoot = null;
  }

  callback();

  const nextRoot = getObserverRoot();
  if (wasObserving && nextRoot) {
    observer.observe(nextRoot, observerConfig);
    isObserving = true;
    observerRoot = nextRoot;
  }
}

function applyHighlight(root = document.body) {
  if (!isCurrentUrlTarget) return;
  withObserverPaused(() => {
    applyHighlightInRoot(root);
  });
}

function removeHighlightInRoot(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const touchedParents = new Set();
  root.querySelectorAll("span.egov-highlight").forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent), span);
      touchedParents.add(parent);
    }
  });

  // H2/H3/H4 で分割された隣接テキストノードを再結合し、H1 再適用時の取りこぼしを防ぐ
  touchedParents.forEach((parent) => {
    if (typeof parent.normalize === "function") {
      parent.normalize();
    }
  });
}

function removeHighlight() {
  withObserverPaused(() => {
    removeHighlightInRoot(document);
  });
}

const observerConfig = {
  childList: true,
  subtree: true,
  characterData: true,
};

let currentHighlightLevel = DEFAULT_HIGHLIGHT_LEVEL;
let isObserving = false;
let scheduled = false;

// 変更通知は1フレームにまとめ、全体再走査の回数を抑える
function scheduleHighlightRefresh() {
  if (
    !isCurrentUrlTarget ||
    !isHighlightEnabled(currentHighlightLevel) ||
    scheduled
  ) {
    return;
  }

  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (isHighlightEnabled(currentHighlightLevel)) {
      applyHighlight();
    }
  });
}

function setHighlightLevel(level) {
  const normalizedLevel = normalizeHighlightLevel(level);
  const nextLevel =
    normalizedLevel != null ? normalizedLevel : DEFAULT_HIGHLIGHT_LEVEL;
  if (nextLevel === currentHighlightLevel) return;

  currentHighlightLevel = nextLevel;
  if (!isCurrentUrlTarget) return;

  withObserverPaused(() => {
    removeHighlightInRoot(document);
    if (isHighlightEnabled(currentHighlightLevel)) {
      applyHighlightInRoot(document.body);
    }
  });
}

const observer = new MutationObserver(() => {
  scheduleHighlightRefresh();
});

function getObserverRoot() {
  return document.body || null;
}

function startObserverWhenReady(onReady) {
  const root = getObserverRoot();
  if (root) {
    if (!isObserving || observerRoot !== root) {
      observer.disconnect();
      observer.observe(root, observerConfig);
      isObserving = true;
      observerRoot = root;
    }
    if (typeof onReady === "function") {
      onReady();
    }
    return;
  }

  requestAnimationFrame(() => {
    startObserverWhenReady(onReady);
  });
}

function getCurrentHref() {
  if (typeof window === "undefined" || !window.location) return "";
  return window.location.href || "";
}

function syncDecoratorByUrl(forceRefresh = false) {
  const nextUrl = getCurrentHref();
  const nextIsTarget = isTargetUrl(nextUrl);
  const urlChanged = nextUrl !== lastKnownUrl;
  if (!forceRefresh && !urlChanged && nextIsTarget === isCurrentUrlTarget)
    return;

  lastKnownUrl = nextUrl;
  isCurrentUrlTarget = nextIsTarget;

  if (!isCurrentUrlTarget) {
    removeHighlight();
    if (isObserving) {
      observer.disconnect();
      isObserving = false;
      observerRoot = null;
    }
    return;
  }

  startObserverWhenReady(() => {
    if (!isCurrentUrlTarget) return;
    if (isHighlightEnabled(currentHighlightLevel)) {
      applyHighlight();
    } else {
      removeHighlight();
    }
    notifyContentReady();
  });
}

function dispatchUrlChangeEvent() {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }
  if (typeof window.Event === "function") {
    window.dispatchEvent(new window.Event("egov-locationchange"));
    return;
  }
  if (
    typeof document !== "undefined" &&
    typeof document.createEvent === "function"
  ) {
    const event = document.createEvent("Event");
    event.initEvent("egov-locationchange", true, true);
    window.dispatchEvent(event);
  }
}

function patchHistoryMethod(methodName) {
  if (typeof window === "undefined" || !window.history) return;
  const original = window.history[methodName];
  if (typeof original !== "function") return;

  window.history[methodName] = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    dispatchUrlChangeEvent();
    return result;
  };
}

function handleUrlChangeSignal() {
  syncDecoratorByUrl(true);
}

function initializeDecorator() {
  // storage は初期化時に1回だけ読み込み、以降はメモリ状態を参照する
  chrome.storage.local.get(
    [
      DECORATOR_ENABLED_KEY,
      HIGHLIGHT_LEVEL_KEY,
      HIGHLIGHT_BG_COLOR_KEY,
      HIGHLIGHT_TEXT_COLOR_KEY,
    ],
    (result) => {
      currentHighlightLevel = getStoredHighlightLevel(result);
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
      syncDecoratorByUrl(true);
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

patchHistoryMethod("pushState");
patchHistoryMethod("replaceState");
if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function"
) {
  window.addEventListener("popstate", handleUrlChangeSignal);
  window.addEventListener("hashchange", handleUrlChangeSignal);
  window.addEventListener("pageshow", handleUrlChangeSignal);
  window.addEventListener("egov-locationchange", handleUrlChangeSignal);
}

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "egov-force-sync") {
      handleUrlChangeSignal();
    }
  });
}

// storage 変更時のみメモリ状態を更新して反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  applyColorChanges(changes);

  if (changes[HIGHLIGHT_LEVEL_KEY]) {
    const nextLevel = normalizeHighlightLevel(
      changes[HIGHLIGHT_LEVEL_KEY].newValue,
    );
    if (nextLevel != null) {
      setHighlightLevel(nextLevel);
      return;
    }
  }

  if (changes[DECORATOR_ENABLED_KEY]) {
    const nextLevel = isDecoratorEnabled(
      changes[DECORATOR_ENABLED_KEY].newValue,
    )
      ? DEFAULT_HIGHLIGHT_LEVEL
      : OFF_HIGHLIGHT_LEVEL;
    setHighlightLevel(nextLevel);
  }
});
