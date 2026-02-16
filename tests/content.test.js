const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadScript } = require('./helpers/load-script');

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
    this.className = '';
    this.textContent = '';
    this.childNodes = [];
    this.parentNode = null;
    this.classList = {
      contains: (name) => this.className.split(' ').filter(Boolean).includes(name)
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
    readyState: 'loading',
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
        }
      };
    }
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
        onChanged: { addListener: () => {} }
      }
    },
    console
  };

  loadScript(path.resolve(__dirname, '..', 'content.js'), context);
  return { context, FakeElement, FakeTextNode };
}

test('applyHighlightToNode: 括弧部分のみハイライト要素化', () => {
  const { context, FakeTextNode } = createContentContext();
  const fragment = context.applyHighlightToNode(new FakeTextNode('abc（X）def'));

  assert.equal(fragment.childNodes.length, 3);
  assert.equal(fragment.childNodes[0].textContent, 'abc');
  assert.equal(fragment.childNodes[1].className, 'highlight');
  assert.equal(fragment.childNodes[1].textContent, '（X）');
  assert.equal(fragment.childNodes[2].textContent, 'def');
});

test('collectDecoratableTextNodes: script/style と既存 highlight 内を除外', () => {
  const { context, FakeElement, FakeTextNode } = createContentContext();

  const root = new FakeElement('div');

  const p = new FakeElement('p');
  const targetText = new FakeTextNode('対象（A）');
  p.appendChild(targetText);

  const script = new FakeElement('script');
  const skippedByScript = new FakeTextNode('skip（B）');
  script.appendChild(skippedByScript);

  const highlightedSpan = new FakeElement('span');
  highlightedSpan.className = 'highlight';
  const skippedByHighlight = new FakeTextNode('skip（C）');
  highlightedSpan.appendChild(skippedByHighlight);

  const plain = new FakeElement('p');
  const skippedByPattern = new FakeTextNode('括弧なし');
  plain.appendChild(skippedByPattern);

  root.appendChild(p);
  root.appendChild(script);
  root.appendChild(highlightedSpan);
  root.appendChild(plain);

  const nodes = context.collectDecoratableTextNodes(root);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], targetText);
});
