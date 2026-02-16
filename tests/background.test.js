const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadScript } = require('./helpers/load-script');

function createChromeMock(actionApi) {
  const createEvent = () => ({ addListener: () => {} });
  return {
    action: actionApi,
    browserAction: null,
    commands: { onCommand: createEvent() },
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      lastError: null
    },
    tabs: {
      query: (_q, cb) => cb([]),
      get: (_id, cb) => cb(null),
      onActivated: createEvent(),
      onUpdated: createEvent(),
      onRemoved: createEvent()
    },
    windows: { onFocusChanged: createEvent(), WINDOW_ID_NONE: -1 },
    storage: {
      local: {
        get: (_keys, cb) => cb({ decoratorEnabled: true }),
        set: (_items, cb) => cb && cb()
      },
      onChanged: createEvent()
    }
  };
}

function loadBackgroundWithSpies() {
  const calls = [];
  const actionApi = {
    setPopup: (payload) => calls.push(['setPopup', payload]),
    setBadgeText: (payload) => calls.push(['setBadgeText', payload]),
    setBadgeBackgroundColor: (payload) => calls.push(['setBadgeBackgroundColor', payload])
  };

  const context = {
    chrome: createChromeMock(actionApi),
    Map,
    console
  };

  loadScript(path.resolve(__dirname, '..', 'background.js'), context);
  return { context, calls };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('isTargetUrl: laws/elaws のみ true', () => {
  const { context } = loadBackgroundWithSpies();
  assert.equal(context.isTargetUrl('https://laws.e-gov.go.jp/test'), true);
  assert.equal(context.isTargetUrl('https://elaws.e-gov.go.jp/test'), true);
  assert.equal(context.isTargetUrl('https://example.com/'), false);
  assert.equal(context.isTargetUrl(null), false);
});

test('setBadgeForTab: 対象URLは ON バッジを設定', () => {
  const { context, calls } = loadBackgroundWithSpies();
  context.setBadgeForTab(7, 'https://laws.e-gov.go.jp/test', true);

  assert.deepEqual(normalize(calls), [
    ['setPopup', { tabId: 7, popup: 'popup.html' }],
    ['setBadgeText', { tabId: 7, text: 'ON' }],
    ['setBadgeBackgroundColor', { tabId: 7, color: '#d93025' }]
  ]);
});

test('setBadgeForTab: 対象外URLはバッジを消す', () => {
  const { context, calls } = loadBackgroundWithSpies();
  context.setBadgeForTab(9, 'https://example.com/', true);

  assert.deepEqual(normalize(calls), [
    ['setPopup', { tabId: 9, popup: '' }],
    ['setBadgeText', { tabId: 9, text: '' }]
  ]);
});

test('setBadgeForTab: 同一状態の連続更新はスキップ', () => {
  const { context, calls } = loadBackgroundWithSpies();
  context.setBadgeForTab(11, 'https://laws.e-gov.go.jp/test', false);
  context.setBadgeForTab(11, 'https://laws.e-gov.go.jp/test', false);

  assert.equal(calls.length, 3);
});
