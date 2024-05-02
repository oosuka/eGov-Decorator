function createHighlightedElement(text) {
  const span = document.createElement('span');
  span.className = 'highlight';
  span.textContent = text;
  return span;
}

function applyHighlightToNode(node) {
  let text = node.textContent;
  let startIndex = 0;
  let openBrackets = 0;
  const docFragment = document.createDocumentFragment();

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '（') {
      if (openBrackets === 0) startIndex = i; // 最初の開き括弧を見つける
      openBrackets++;
    } else if (text[i] === '）') {
      openBrackets--;
      if (openBrackets === 0) { // 対応する閉じ括弧を見つける
        // 開き括弧から閉じ括弧までのテキストを装飾
        if (startIndex > 0) {
          docFragment.appendChild(document.createTextNode(text.slice(0, startIndex)));
        }
        const matchedText = text.slice(startIndex, i + 1);
        docFragment.appendChild(createHighlightedElement(matchedText));
        text = text.slice(i + 1);
        i = -1; // ループをリセット
      }
    }
  }

  if (text.length > 0) {
    // 残りのテキストを追加
    docFragment.appendChild(document.createTextNode(text));
  }

  return docFragment;
}

function applyHighlight() {
  observer.disconnect(); // 監視を一時停止

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let nodes = [];
  let node;

  while ((node = walker.nextNode())) {
    if (/（.*?）/.test(node.nodeValue)) {
      nodes.push(node);
    }
  }

  nodes.forEach((node) => {
    const parent = node.parentNode;
    if (parent && parent.nodeName.toLowerCase() !== 'script' && parent.nodeName.toLowerCase() !== 'style') {
      const highlightedContent = applyHighlightToNode(node);
      parent.replaceChild(highlightedContent, node);
    }
  });

  observer.observe(document.body, observerConfig); // 監視を再開
}

const observerConfig = {
  childList: true,
  subtree: true,
  characterData: false
};

const observer = new MutationObserver((mutations) => {
  applyHighlight();
});

observer.observe(document.body, observerConfig);

// 初期ロード時にも適用
document.addEventListener('DOMContentLoaded', (event) => {
  applyHighlight();
});
