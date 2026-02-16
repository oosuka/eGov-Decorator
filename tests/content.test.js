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
  assert.equal(fragment.childNodes[1].className, "highlight");
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

test("collectDecoratableTextNodes: script/style と既存 highlight 内を除外", () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement("div");

  const p = new FakeElement("p");
  const targetText = new FakeTextNode("対象（A）");
  p.appendChild(targetText);

  const script = new FakeElement("script");
  script.appendChild(new FakeTextNode("skip（B）"));

  const highlightedSpan = new FakeElement("span");
  highlightedSpan.className = "highlight";
  highlightedSpan.appendChild(new FakeTextNode("skip（C）"));

  root.appendChild(p);
  root.appendChild(script);
  root.appendChild(highlightedSpan);

  const nodes = context.collectDecoratableTextNodes(root);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], targetText);
});

test("isDecoratorEnabled: false のみ無効、それ以外は有効", () => {
  const { context } = createContentContext();
  assert.equal(context.isDecoratorEnabled(false), false);
  assert.equal(context.isDecoratorEnabled(undefined), true);
  assert.equal(context.isDecoratorEnabled(true), true);
});
