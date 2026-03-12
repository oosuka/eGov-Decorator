const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadScript } = require("./helpers/load-script");

class FakeTextNode {
  constructor(value) {
    this.nodeValue = value;
    this.textContent = value;
    this.parentNode = null;
  }
}

class FakeElement {
  constructor(tagName) {
    this.nodeName = tagName.toUpperCase();
    this.className = "";
    this.textContent = "";
    this.childNodes = [];
    this.parentNode = null;
    this.classList = {
      contains: (name) =>
        this.className.split(" ").filter(Boolean).includes(name),
    };
  }

  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  replaceChild(newNode, oldNode) {
    const idx = this.childNodes.indexOf(oldNode);
    if (idx < 0) return oldNode;

    if (newNode instanceof FakeDocumentFragment) {
      const next = newNode.childNodes.map((child) => {
        child.parentNode = this;
        return child;
      });
      this.childNodes.splice(idx, 1, ...next);
      return oldNode;
    }

    newNode.parentNode = this;
    this.childNodes[idx] = newNode;
    return oldNode;
  }

  normalize() {
    const merged = [];
    this.childNodes.forEach((child) => {
      const prev = merged.at(-1);
      if (prev instanceof FakeTextNode && child instanceof FakeTextNode) {
        prev.textContent += child.textContent;
        prev.nodeValue = prev.textContent;
        return;
      }
      merged.push(child);
    });
    this.childNodes = merged;
  }
}

class FakeDocumentFragment {
  constructor() {
    this.childNodes = [];
  }

  appendChild(node) {
    this.childNodes.push(node);
    return node;
  }
}

function walkTextNodes(root, result = []) {
  if (!root) return result;
  if (root instanceof FakeTextNode) {
    result.push(root);
    return result;
  }
  if (!root.childNodes) return result;
  root.childNodes.forEach((child) => {
    walkTextNodes(child, result);
  });
  return result;
}

function collectHighlightTexts(root, result = []) {
  if (!root) return result;
  if (root.className === "egov-highlight") {
    result.push(root.textContent);
  }
  if (!root.childNodes) return result;
  root.childNodes.forEach((child) => {
    collectHighlightTexts(child, result);
  });
  return result;
}

function createContentContext() {
  const fakeDocument = {
    readyState: "loading",
    body: null,
    documentElement: { style: { setProperty: () => {} } },
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: (name) => new FakeElement(name),
    createTextNode: (text) => new FakeTextNode(text),
    createDocumentFragment: () => new FakeDocumentFragment(),
    createTreeWalker: (root) => {
      const nodes = walkTextNodes(root);
      let idx = 0;
      return {
        nextNode: () => {
          if (idx >= nodes.length) return null;
          return nodes[idx++];
        },
      };
    },
  };

  const context = {
    document: fakeDocument,
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      disconnect() {}
      observe() {}
    },
    requestAnimationFrame: () => 1,
    chrome: {
      storage: {
        local: { get: (_keys, cb) => cb({}) },
        onChanged: { addListener: () => {} },
      },
    },
    console,
  };

  loadScript(path.resolve(__dirname, "..", "src", "content.js"), context);
  return { context, FakeElement, FakeTextNode };
}

function createLifecycleContentContext({
  href = "https://laws.e-gov.go.jp/law/a",
  highlightLevel = 0,
  storageResult = { highlightLevel },
  body = {
    querySelectorAll: () => [],
  },
  withRuntime = true,
  sendMessageThrows = false,
  withWindowEvent = true,
  withWindowDispatchEvent = true,
  withDocumentCreateEvent = true,
  onObserve = null,
} = {}) {
  const rafQueue = [];
  const observerCalls = [];
  const observerDisconnects = [];
  const dispatchedEvents = [];
  const sentMessages = [];
  const styleCalls = [];
  const windowListeners = new Map();
  let storageChangedListener = null;
  let runtimeMessageListener = null;
  let observerCallback = null;

  const fakeDocument = {
    readyState: "complete",
    body,
    documentElement: {
      style: {
        setProperty: (...args) => styleCalls.push(args),
      },
    },
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: (name) => new FakeElement(name),
    createTextNode: (text) => new FakeTextNode(text),
    createDocumentFragment: () => new FakeDocumentFragment(),
    createTreeWalker: () => ({
      nextNode: () => null,
    }),
    createEvent: withDocumentCreateEvent
      ? () => ({
          type: "",
          initEvent(type) {
            this.type = type;
          },
        })
      : undefined,
  };

  const fakeLocation = { href };
  const updateHref = (nextUrl) => {
    if (typeof nextUrl !== "string") return;
    fakeLocation.href = new URL(nextUrl, fakeLocation.href).href;
  };
  const fakeWindow = {
    location: fakeLocation,
    history: {
      pushState: (_state, _unused, url) => {
        updateHref(url);
      },
      replaceState: (_state, _unused, url) => {
        updateHref(url);
      },
    },
    addEventListener: (type, handler) => {
      windowListeners.set(type, handler);
    },
    dispatchEvent: withWindowDispatchEvent
      ? (event) => {
          dispatchedEvents.push(event.type);
          const handler = windowListeners.get(event.type);
          if (handler) {
            handler(event);
          }
        }
      : undefined,
    Event: withWindowEvent
      ? function Event(type) {
          this.type = type;
        }
      : undefined,
  };

  const runtime = withRuntime
    ? {
        sendMessage: (message) => {
          sentMessages.push(message);
          if (sendMessageThrows) {
            throw new Error("runtime sendMessage failed");
          }
        },
        onMessage: {
          addListener: (listener) => {
            runtimeMessageListener = listener;
          },
        },
      }
    : undefined;

  const context = {
    window: fakeWindow,
    document: fakeDocument,
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }

      disconnect() {}

      observe(root, config) {
        observerCalls.push({ root, config });
      }
    },
    requestAnimationFrame: (callback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    chrome: {
      storage: {
        local: {
          get: (_keys, cb) => cb(storageResult),
        },
        onChanged: {
          addListener: (listener) => {
            storageChangedListener = listener;
          },
        },
      },
      runtime,
    },
    console,
  };

  context.MutationObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }

    disconnect() {
      observerDisconnects.push(true);
    }

    observe(root, config) {
      if (typeof onObserve === "function") {
        onObserve(context);
      }
      observerCalls.push({ root, config });
    }
  };

  loadScript(path.resolve(__dirname, "..", "src", "content.js"), context);
  return {
    context,
    fakeDocument,
    fakeWindow,
    rafQueue,
    observerCalls,
    observerDisconnects,
    dispatchedEvents,
    sentMessages,
    styleCalls,
    emitStorageChange: (changes, area = "local") => {
      storageChangedListener?.(changes, area);
    },
    emitRuntimeMessage: (message) => {
      runtimeMessageListener?.(message);
    },
    triggerObserver: () => {
      observerCallback?.();
    },
  };
}

test("applyHighlightToNode: 括弧部分のみハイライト要素化", () => {
  const { context, FakeTextNode } = createContentContext();
  const fragment = context.applyHighlightToNode(
    new FakeTextNode("abc（X）def"),
  );

  assert.equal(fragment.childNodes.length, 3);
  assert.equal(fragment.childNodes[0].textContent, "abc");
  assert.equal(fragment.childNodes[1].className, "egov-highlight");
  assert.equal(fragment.childNodes[1].textContent, "（X）");
  assert.equal(fragment.childNodes[2].textContent, "def");
});

test("applyHighlightToNode: ネスト括弧は1塊として扱う", () => {
  const { context, FakeTextNode } = createContentContext();
  const fragment = context.applyHighlightToNode(
    new FakeTextNode("a（b（c）d）e"),
  );

  assert.equal(fragment.childNodes.length, 3);
  assert.equal(fragment.childNodes[1].textContent, "（b（c）d）");
});

test("applyHighlightToNode: H2 相当では2階層目以降のみハイライト", () => {
  const { context, FakeTextNode } = createContentContext();
  const fragment = context.applyHighlightToNode(
    new FakeTextNode("■（あ（い（う）い）あ）■"),
    2,
  );

  assert.equal(fragment.childNodes.length, 3);
  assert.equal(fragment.childNodes[0].textContent, "■（あ");
  assert.equal(fragment.childNodes[1].className, "egov-highlight");
  assert.equal(fragment.childNodes[1].textContent, "（い（う）い）");
  assert.equal(fragment.childNodes[2].textContent, "あ）■");
});

test("applyHighlightToNode: H3 相当では3階層目以降のみハイライト", () => {
  const { context, FakeTextNode } = createContentContext();
  const fragment = context.applyHighlightToNode(
    new FakeTextNode("■（あ（い（う）い）あ）■"),
    3,
  );

  assert.equal(fragment.childNodes.length, 3);
  assert.equal(fragment.childNodes[0].textContent, "■（あ（い");
  assert.equal(fragment.childNodes[1].className, "egov-highlight");
  assert.equal(fragment.childNodes[1].textContent, "（う）");
  assert.equal(fragment.childNodes[2].textContent, "い）あ）■");
});

test("1-5階層: minDepth 1-5 で期待どおりに絞り込まれる", () => {
  const { context } = createContentContext();
  const text = "■（あ（い（う（え（お）え）う）い）あ）■";

  const expectedByDepth = new Map([
    [1, "（あ（い（う（え（お）え）う）い）あ）"],
    [2, "（い（う（え（お）え）う）い）"],
    [3, "（う（え（お）え）う）"],
    [4, "（え（お）え）"],
    [5, "（お）"],
  ]);

  for (let depth = 1; depth <= 5; depth++) {
    const result = context.buildHighlightFragmentWithDepth(text, depth, 0);
    const highlighted = collectHighlightTexts(result.docFragment);
    assert.deepEqual(highlighted, [expectedByDepth.get(depth)]);
  }
});

test("buildHighlightFragmentWithDepth: 跨ぎ中ノードは括弧文字なしでもハイライト", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("第三項", 1, 1);

  assert.equal(result.hasHighlight, true);
  assert.equal(result.endDepth, 1);
  assert.equal(result.docFragment.childNodes.length, 1);
  assert.equal(result.docFragment.childNodes[0].className, "egov-highlight");
  assert.equal(result.docFragment.childNodes[0].textContent, "第三項");
});

test("buildHighlightFragmentWithDepth: 閉じ括弧で深さが戻る", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("の規定）", 1, 1);

  assert.equal(result.hasHighlight, true);
  assert.equal(result.endDepth, 0);
});

test("buildHighlightFragmentWithDepth: 未閉じ開き括弧はハイライトしない", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("abc（未閉じ", 1, 0);
  const highlighted = collectHighlightTexts(result.docFragment);

  assert.deepEqual(highlighted, []);
});

test("buildHighlightFragmentWithDepth: 未閉じ開き括弧より前の確定ペアは維持", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("x（A）y（", 1, 0);
  const highlighted = collectHighlightTexts(result.docFragment);

  assert.deepEqual(highlighted, ["（A）"]);
});

test("buildHighlightFragmentWithDepth: 未対応の閉じ括弧はハイライトしない", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("abc）def", 1, 0);
  const highlighted = collectHighlightTexts(result.docFragment);

  assert.deepEqual(highlighted, []);
});

test("括弧がノードをまたぐ: 安全コンテナ内では連結してハイライトされる", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement("div");
  const p = new FakeElement("p");
  const link = new FakeElement("a");
  const t1 = new FakeTextNode("（");
  const t2 = new FakeTextNode("第三項");
  const t3 = new FakeTextNode("の規定）");

  p.appendChild(t1);
  link.appendChild(t2);
  p.appendChild(link);
  p.appendChild(t3);
  root.appendChild(p);

  context.applyHighlightInContainer(root, 1);
  assert.deepEqual(collectHighlightTexts(root), ["（", "第三項", "の規定）"]);
});

test("括弧がノードをまたぐ: 安全コンテナ内でも未閉じ開き括弧はハイライトしない", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement("div");
  const p = new FakeElement("p");
  const link = new FakeElement("a");
  const t1 = new FakeTextNode("abc（");
  const t2 = new FakeTextNode("第三項");
  const t3 = new FakeTextNode("の規定");

  p.appendChild(t1);
  link.appendChild(t2);
  p.appendChild(link);
  p.appendChild(t3);
  root.appendChild(p);

  context.applyHighlightInContainer(root, 1);
  assert.deepEqual(collectHighlightTexts(root), []);
});

test("安全ガード: table 配下ではクロスノード処理しない", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement("div");
  const table = new FakeElement("table");
  const tr = new FakeElement("tr");
  const td = new FakeElement("td");
  const link = new FakeElement("a");
  const t1 = new FakeTextNode("（");
  const t2 = new FakeTextNode("第三項");
  const t3 = new FakeTextNode("の規定）");

  td.appendChild(t1);
  link.appendChild(t2);
  td.appendChild(link);
  td.appendChild(t3);
  tr.appendChild(td);
  table.appendChild(tr);
  root.appendChild(table);

  context.applyHighlightInContainer(root, 1);
  assert.deepEqual(collectHighlightTexts(root), []);
});

test("getCrossNodeContainer: 安全/危険タグの判定", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const safeRoot = new FakeElement("div");
  const safeP = new FakeElement("p");
  const safeText = new FakeTextNode("x");
  safeP.appendChild(safeText);
  safeRoot.appendChild(safeP);
  assert.equal(context.getCrossNodeContainer(safeText), safeP);

  const unsafeRoot = new FakeElement("div");
  const table = new FakeElement("table");
  const td = new FakeElement("td");
  const unsafeText = new FakeTextNode("x");
  td.appendChild(unsafeText);
  table.appendChild(td);
  unsafeRoot.appendChild(table);
  assert.equal(context.getCrossNodeContainer(unsafeText), null);

  const bodyOnlyText = new FakeTextNode("x");
  bodyOnlyText.parentNode = context.document.body;
  assert.equal(context.getCrossNodeContainer(bodyOnlyText), null);
});

test("getCrossNodeContainer: body 直下まで辿ったら null", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const body = new FakeElement("body");
  context.document.body = body;

  const span = new FakeElement("span");
  const text = new FakeTextNode("x");
  span.appendChild(text);
  body.appendChild(span);

  assert.equal(context.getCrossNodeContainer(text), null);
});

test("collectDecoratableTextNodes: script/style と既存 highlight 内を除外", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement("div");

  const p = new FakeElement("p");
  const targetText = new FakeTextNode("対象（A）");
  p.appendChild(targetText);

  const script = new FakeElement("script");
  script.appendChild(new FakeTextNode("skip（B）"));

  const highlightedSpan = new FakeElement("span");
  highlightedSpan.className = "egov-highlight";
  highlightedSpan.appendChild(new FakeTextNode("skip（C）"));

  root.appendChild(p);
  root.appendChild(script);
  root.appendChild(highlightedSpan);

  const nodes = context.collectDecoratableTextNodes(root);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], targetText);
});

test("getStoredHighlightLevel: legacy decoratorEnabled=false は OFF", () => {
  const { context } = createContentContext();
  assert.equal(context.getStoredHighlightLevel({ decoratorEnabled: false }), 4);
});

test("removeHighlightInRoot: 同一親の複数spanでも normalize は1回だけ", () => {
  const { context } = createContentContext();

  let normalizeCalls = 0;
  const parent = {
    replaceChild: () => {},
    normalize: () => {
      normalizeCalls += 1;
    },
  };
  const spanA = { parentNode: parent, textContent: "（A）" };
  const spanB = { parentNode: parent, textContent: "（B）" };
  const root = {
    querySelectorAll: () => [spanA, spanB],
  };

  context.removeHighlightInRoot(root);
  assert.equal(normalizeCalls, 1);
});

test("removeHighlightInRoot: 親が異なる場合は親ごとに normalize する", () => {
  const { context } = createContentContext();

  let normalizeCallsA = 0;
  let normalizeCallsB = 0;
  const parentA = {
    replaceChild: () => {},
    normalize: () => {
      normalizeCallsA += 1;
    },
  };
  const parentB = {
    replaceChild: () => {},
    normalize: () => {
      normalizeCallsB += 1;
    },
  };
  const spanA = { parentNode: parentA, textContent: "（A）" };
  const spanB = { parentNode: parentB, textContent: "（B）" };
  const root = {
    querySelectorAll: () => [spanA, spanB],
  };

  context.removeHighlightInRoot(root);
  assert.equal(normalizeCallsA, 1);
  assert.equal(normalizeCallsB, 1);
});

test("isDecoratorEnabled: false のみ無効、それ以外は有効", () => {
  const { context } = createContentContext();
  assert.equal(context.isDecoratorEnabled(false), false);
  assert.equal(context.isDecoratorEnabled(undefined), true);
  assert.equal(context.isDecoratorEnabled(true), true);
});

test("setHighlightLevel: 非対象URLでは DOM を変更しない", () => {
  const { context } = createContentContext();
  let touched = false;
  context.document.querySelectorAll = () => {
    touched = true;
    return [];
  };

  context.setHighlightLevel(1);

  assert.equal(touched, false);
});

test("初期化時: OFF では MutationObserver を開始しない", () => {
  const { observerCalls } = createLifecycleContentContext({
    highlightLevel: 4,
  });

  assert.equal(observerCalls.length, 0);
});

test("body 待機中に対象外 URL へ変わったら observer 開始を取り消す", () => {
  const { context, fakeDocument, fakeWindow, rafQueue, observerCalls } =
    createLifecycleContentContext({
      body: null,
    });

  assert.equal(rafQueue.length, 1);
  assert.equal(observerCalls.length, 0);

  fakeWindow.location.href = "https://laws.e-gov.go.jp/result";
  context.handleUrlChangeSignal();
  fakeDocument.body = {
    querySelectorAll: () => [],
  };

  rafQueue.shift()();

  assert.equal(observerCalls.length, 0);
});

test("normalizeHighlightLevel: 範囲外は null", () => {
  const { context } = createContentContext();

  assert.equal(context.normalizeHighlightLevel(-1), null);
  assert.equal(context.normalizeHighlightLevel(99), null);
});

test("applyColorChanges: 色変更時だけ CSS 変数を更新する", () => {
  const { styleCalls, emitStorageChange } = createLifecycleContentContext();
  const initialCallCount = styleCalls.length;

  emitStorageChange({ other: { newValue: 1 } });
  assert.equal(styleCalls.length, initialCallCount);

  emitStorageChange({
    highlightBgColor: { newValue: "#123456" },
    highlightTextColor: { newValue: "#abcdef" },
  });

  assert.deepEqual(styleCalls.slice(-2), [
    ["--egov-highlight-bg", "#123456"],
    ["--egov-highlight-text", "#abcdef"],
  ]);
});

test("notifyContentReady: runtime 不在時は何もしない", () => {
  const { context } = createLifecycleContentContext({
    withRuntime: false,
  });

  assert.doesNotThrow(() => {
    context.notifyContentReady();
  });
});

test("notifyContentReady: sendMessage 例外を握りつぶす", () => {
  const { context } = createLifecycleContentContext({
    sendMessageThrows: true,
  });

  assert.doesNotThrow(() => {
    context.notifyContentReady();
  });
});

test("buildHighlightFragmentWithDepth: 空文字では空 fragment を返す", () => {
  const { context } = createContentContext();
  const result = context.buildHighlightFragmentWithDepth("", 1, 2);

  assert.equal(result.docFragment.childNodes.length, 0);
  assert.equal(result.endDepth, 2);
  assert.equal(result.hasHighlight, false);
});

test("buildFragmentFromMask: 空文字では空 fragment を返す", () => {
  const { context } = createContentContext();
  const result = context.buildFragmentFromMask("", []);

  assert.equal(result.docFragment.childNodes.length, 0);
  assert.equal(result.hasHighlight, false);
});

test("applyHighlightInContainer: テキストノードが無ければ何もしない", () => {
  const { context, FakeElement } = createContentContext();
  const root = new FakeElement("div");

  assert.doesNotThrow(() => {
    context.applyHighlightInContainer(root, 1);
  });
});

test("applyHighlightInContainer: 括弧が無い場合は置換しない", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const root = new FakeElement("div");
  const p = new FakeElement("p");
  const text = new FakeTextNode("括弧なし");
  p.appendChild(text);
  root.appendChild(p);

  context.applyHighlightInContainer(root, 1);

  assert.deepEqual(collectHighlightTexts(root), []);
  assert.equal(p.childNodes[0], text);
});

test("applyHighlightInContainer: 単一ノードの括弧を置換する", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const root = new FakeElement("div");
  const p = new FakeElement("p");
  p.appendChild(new FakeTextNode("前文（A）後文"));
  root.appendChild(p);

  context.applyHighlightInContainer(root, 1);

  assert.deepEqual(collectHighlightTexts(root), ["（A）"]);
});

test("applyHighlightInContainer: 非クロスノード経路でも括弧を置換する", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const root = new FakeElement("div");
  const table = new FakeElement("table");
  const td = new FakeElement("td");
  td.appendChild(new FakeTextNode("前文（A）後文"));
  table.appendChild(td);
  root.appendChild(table);

  context.applyHighlightInContainer(root, 1);

  assert.deepEqual(collectHighlightTexts(root), ["（A）"]);
});

test("applyHighlightInContainer: コンテナ内に括弧なしの塊があっても他コンテナの処理を続ける", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const root = new FakeElement("div");

  const p1 = new FakeElement("p");
  p1.appendChild(new FakeTextNode("（"));
  p1.appendChild(new FakeTextNode("A）"));

  const p2 = new FakeElement("p");
  p2.appendChild(new FakeTextNode("括弧"));
  p2.appendChild(new FakeTextNode("なし"));

  root.appendChild(p1);
  root.appendChild(p2);

  context.applyHighlightInContainer(root, 1);

  assert.deepEqual(collectHighlightTexts(root), ["（", "A）"]);
});

test("applyHighlightInRoot: 現在レベルでルートに反映する", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();
  const root = new FakeElement("div");
  const p = new FakeElement("p");
  p.appendChild(new FakeTextNode("x（A）y"));
  root.appendChild(p);

  context.applyHighlightInRoot(root);

  assert.deepEqual(collectHighlightTexts(root), ["（A）"]);
});

test("初期化時: 対象 URL では observer 開始と content-ready 通知を行う", () => {
  const { observerCalls, sentMessages } = createLifecycleContentContext();

  assert.equal(observerCalls.length, 2);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "egov-content-ready");
});

test("applyHighlight: observer を一時停止して再開する", () => {
  const { context, observerCalls, observerDisconnects } =
    createLifecycleContentContext();
  const initialObserveCount = observerCalls.length;
  const initialDisconnectCount = observerDisconnects.length;

  context.applyHighlight();

  assert.equal(observerDisconnects.length, initialDisconnectCount + 1);
  assert.equal(observerCalls.length, initialObserveCount + 1);
});

test("MutationObserver: refresh は 1 フレームに集約される", () => {
  const { triggerObserver, rafQueue, observerCalls, observerDisconnects } =
    createLifecycleContentContext();
  const initialObserveCount = observerCalls.length;
  const initialDisconnectCount = observerDisconnects.length;

  triggerObserver();
  triggerObserver();

  assert.equal(rafQueue.length, 1);
  rafQueue.shift()();

  assert.equal(observerDisconnects.length, initialDisconnectCount + 1);
  assert.equal(observerCalls.length, initialObserveCount + 1);
});

test("setHighlightLevel: 対象 URL では既存 highlight を外して再適用する", () => {
  let replaceCalls = 0;
  let normalizeCalls = 0;
  const parent = {
    replaceChild: () => {
      replaceCalls += 1;
    },
    normalize: () => {
      normalizeCalls += 1;
    },
  };
  const span = { parentNode: parent, textContent: "（A）" };
  const body = {
    querySelectorAll: () => [],
  };
  const { context } = createLifecycleContentContext({
    body,
  });

  context.document.querySelectorAll = () => [span];
  context.setHighlightLevel(1);

  assert.equal(replaceCalls, 1);
  assert.equal(normalizeCalls, 1);
});

test("syncDecoratorByUrl: 対象外 URL への遷移で observer を停止する", () => {
  const { context, fakeWindow, observerDisconnects } =
    createLifecycleContentContext();
  const initialDisconnectCount = observerDisconnects.length;

  fakeWindow.location.href = "https://example.com/";
  context.syncDecoratorByUrl(true);

  assert.equal(observerDisconnects.length, initialDisconnectCount + 1);
});

test("dispatchUrlChangeEvent: Event コンストラクタが無ければ createEvent を使う", () => {
  const { context, dispatchedEvents } = createLifecycleContentContext({
    withWindowEvent: false,
  });

  context.dispatchUrlChangeEvent();

  assert.equal(dispatchedEvents.at(-1), "egov-locationchange");
});

test("dispatchUrlChangeEvent: dispatchEvent が無ければ何もしない", () => {
  const { context } = createLifecycleContentContext({
    withWindowDispatchEvent: false,
  });

  assert.doesNotThrow(() => {
    context.dispatchUrlChangeEvent();
  });
});

test("history.pushState / replaceState: URL 変化イベントを発火して再同期する", () => {
  const { fakeWindow, sentMessages, dispatchedEvents, observerDisconnects } =
    createLifecycleContentContext();
  const initialMessageCount = sentMessages.length;
  const initialDisconnectCount = observerDisconnects.length;

  fakeWindow.history.pushState({}, "", "/law/b");
  assert.equal(fakeWindow.location.href, "https://laws.e-gov.go.jp/law/b");

  fakeWindow.history.replaceState({}, "", "https://example.com/");

  assert.equal(dispatchedEvents.includes("egov-locationchange"), true);
  assert.equal(sentMessages.length, initialMessageCount + 1);
  assert.equal(observerDisconnects.length, initialDisconnectCount + 2);
  assert.equal(fakeWindow.location.href, "https://example.com/");
});

test("runtime.onMessage: egov-force-sync で再同期する", () => {
  const { emitRuntimeMessage, sentMessages } = createLifecycleContentContext();
  const initialMessageCount = sentMessages.length;

  emitRuntimeMessage({ type: "egov-force-sync" });

  assert.equal(sentMessages.length, initialMessageCount + 1);
});

test("storage.onChanged: area が local 以外なら無視する", () => {
  const { styleCalls, emitStorageChange } = createLifecycleContentContext();
  const initialCallCount = styleCalls.length;

  emitStorageChange({ highlightBgColor: { newValue: "#000000" } }, "sync");

  assert.equal(styleCalls.length, initialCallCount);
});

test("storage.onChanged: highlightLevel の更新を反映する", () => {
  let replaceCalls = 0;
  const parent = {
    replaceChild: () => {
      replaceCalls += 1;
    },
    normalize: () => {},
  };
  const span = { parentNode: parent, textContent: "（A）" };
  const { emitStorageChange, context } = createLifecycleContentContext();
  context.document.querySelectorAll = () => [span];

  emitStorageChange({ highlightLevel: { newValue: 2 } });

  assert.equal(replaceCalls, 1);
});

test("storage.onChanged: 不正な highlightLevel は legacy decoratorEnabled を使う", () => {
  const { emitStorageChange, observerDisconnects } =
    createLifecycleContentContext();
  const initialDisconnectCount = observerDisconnects.length;

  emitStorageChange({
    highlightLevel: { newValue: 99 },
    decoratorEnabled: { newValue: false },
  });

  assert.equal(observerDisconnects.length, initialDisconnectCount + 1);
});

test("startObserverWhenReady: 開始直前に無効化されたら onReady を中断する", () => {
  const { observerCalls, sentMessages } = createLifecycleContentContext({
    onObserve: (context) => {
      context.setHighlightLevel(4);
    },
  });

  assert.equal(observerCalls.length, 1);
  assert.deepEqual(sentMessages, []);
});
