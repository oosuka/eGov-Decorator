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
  root.childNodes.forEach((child) => walkTextNodes(child, result));
  return result;
}

function collectHighlightTexts(root, result = []) {
  if (!root) return result;
  if (root.className === "egov-highlight") {
    result.push(root.textContent);
  }
  if (!root.childNodes) return result;
  root.childNodes.forEach((child) => collectHighlightTexts(child, result));
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
