const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadScript } = require('./helpers/load-script');

class FakeElement {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) {
      handler(event);
    }
  }
}

function createOptionsContext({ storedValues = {} } = {}) {
  const elements = {
    status: new FakeElement('status'),
    bgColor: new FakeElement('bgColor'),
    textColor: new FakeElement('textColor'),
    'color-form': new FakeElement('color-form'),
    resetBtn: new FakeElement('resetBtn')
  };

  const scheduled = [];
  const getCalls = [];
  const setCalls = [];
  const docListeners = new Map();

  const context = {
    document: {
      getElementById: (id) => elements[id],
      addEventListener: (type, handler) => {
        docListeners.set(type, handler);
      }
    },
    window: {
      setTimeout: (fn, _delay) => {
        scheduled.push(fn);
      }
    },
    chrome: {
      storage: {
        local: {
          get: (keys, cb) => {
            getCalls.push(keys);
            cb(storedValues);
          },
          set: (payload, cb) => {
            setCalls.push(payload);
            if (cb) cb();
          }
        }
      }
    },
    console
  };

  loadScript(path.resolve(__dirname, '..', 'options.js'), context);

  return {
    context,
    elements,
    scheduled,
    getCalls,
    setCalls,
    fireDOMContentLoaded: () => {
      const handler = docListeners.get('DOMContentLoaded');
      if (handler) handler();
    }
  };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('loadSettings: 保存済み色をフォームに反映', () => {
  const { context, elements } = createOptionsContext({
    storedValues: {
      highlightBgColor: '#111111',
      highlightTextColor: '#222222'
    }
  });

  context.loadSettings();

  assert.equal(elements.bgColor.value, '#111111');
  assert.equal(elements.textColor.value, '#222222');
});

test('loadSettings: 未設定時はデフォルト色を反映', () => {
  const { context, elements } = createOptionsContext({ storedValues: {} });

  context.loadSettings();

  assert.equal(elements.bgColor.value, '#e6e6e6');
  assert.equal(elements.textColor.value, '#ffffff');
});

test('saveSettings: storage に保存しステータス表示', () => {
  const { context, elements, scheduled, setCalls } = createOptionsContext();

  context.saveSettings('#aaaaaa', '#bbbbbb');

  assert.deepEqual(normalize(setCalls), [
    { highlightBgColor: '#aaaaaa', highlightTextColor: '#bbbbbb' }
  ]);
  assert.equal(elements.status.textContent, '保存しました');

  scheduled.forEach((fn) => fn());
  assert.equal(elements.status.textContent, '');
});

test('DOMContentLoaded: submit で現在入力値を保存', () => {
  const { elements, setCalls, fireDOMContentLoaded } = createOptionsContext({
    storedValues: { highlightBgColor: '#010101', highlightTextColor: '#020202' }
  });

  fireDOMContentLoaded();

  elements.bgColor.value = '#123456';
  elements.textColor.value = '#654321';

  let prevented = false;
  elements['color-form'].dispatch('submit', {
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.deepEqual(normalize(setCalls.at(-1)), {
    highlightBgColor: '#123456',
    highlightTextColor: '#654321'
  });
});

test('DOMContentLoaded: reset でデフォルト色を保存', () => {
  const { elements, setCalls, fireDOMContentLoaded } = createOptionsContext({
    storedValues: { highlightBgColor: '#010101', highlightTextColor: '#020202' }
  });

  fireDOMContentLoaded();
  elements.resetBtn.dispatch('click');

  assert.equal(elements.bgColor.value, '#e6e6e6');
  assert.equal(elements.textColor.value, '#ffffff');
  assert.deepEqual(normalize(setCalls.at(-1)), {
    highlightBgColor: '#e6e6e6',
    highlightTextColor: '#ffffff'
  });
});
