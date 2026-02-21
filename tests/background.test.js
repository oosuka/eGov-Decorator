const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadScript } = require("./helpers/load-script");

function createEvent() {
  let listener = null;
  return {
    addListener: (fn) => {
      listener = fn;
    },
    emit: (...args) => {
      if (listener) listener(...args);
    },
  };
}

function createBackgroundHarness(options = {}) {
  const calls = [];
  const storageSets = [];

  const events = {
    onCommand: createEvent(),
    onInstalled: createEvent(),
    onStartup: createEvent(),
    onActivated: createEvent(),
    onUpdated: createEvent(),
    onRemoved: createEvent(),
    onFocusChanged: createEvent(),
    onStorageChanged: createEvent(),
    onMessage: createEvent(),
  };

  const state = {
    storage: {
      highlightLevel: options.initialHighlightLevel,
      decoratorEnabled: options.initialEnabled,
    },
    allTabs: options.allTabs ?? [],
  };

  const actionApi = {
    setPopup: (payload) => calls.push(["setPopup", payload]),
    setBadgeText: (payload) => calls.push(["setBadgeText", payload]),
    setBadgeBackgroundColor: (payload) =>
      calls.push(["setBadgeBackgroundColor", payload]),
  };

  const chrome = {
    action: actionApi,
    browserAction: null,
    commands: { onCommand: events.onCommand },
    runtime: {
      onInstalled: events.onInstalled,
      onStartup: events.onStartup,
      onMessage: events.onMessage,
      lastError: null,
    },
    tabs: {
      query: (_query, cb) => cb(state.allTabs),
      get: (_id, cb) => cb(null),
      onActivated: events.onActivated,
      onUpdated: events.onUpdated,
      onRemoved: events.onRemoved,
    },
    windows: { onFocusChanged: events.onFocusChanged, WINDOW_ID_NONE: -1 },
    storage: {
      local: {
        get: (_keys, cb) => cb({ ...state.storage }),
        set: (items, cb) => {
          storageSets.push(items);
          state.storage = { ...state.storage, ...items };
          if (cb) cb();
        },
      },
      onChanged: events.onStorageChanged,
    },
  };

  const context = { chrome, Map, console };
  loadScript(path.resolve(__dirname, "..", "src", "background.js"), context);

  return { context, events, calls, storageSets };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test("isTargetUrl: laws/elaws のみ true", () => {
  const { context } = createBackgroundHarness();
  assert.equal(context.isTargetUrl("https://laws.e-gov.go.jp/test"), true);
  assert.equal(context.isTargetUrl("https://elaws.e-gov.go.jp/test"), true);
  assert.equal(context.isTargetUrl("https://example.com/"), false);
});

test("初期化時: 保存 highlightLevel を使って全タブのバッジを更新", () => {
  const { calls } = createBackgroundHarness({
    initialHighlightLevel: 2,
    allTabs: [{ id: 20, url: "https://laws.e-gov.go.jp/a" }],
  });

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 20, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 20, text: "H3" }],
    ["setBadgeBackgroundColor", { tabId: 20, color: "#d93025" }],
  ]);
});

test("初期化時: legacy decoratorEnabled=false から OFF へ移行表示", () => {
  const { calls } = createBackgroundHarness({
    initialEnabled: false,
    allTabs: [{ id: 21, url: "https://laws.e-gov.go.jp/a" }],
  });

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 21, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 21, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 21, color: "#188038" }],
  ]);
});

test("setBadgeForTab: 対象URLは H2 バッジを設定", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(7, "https://laws.e-gov.go.jp/test", 1);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 7, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 7, text: "H2" }],
    ["setBadgeBackgroundColor", { tabId: 7, color: "#d93025" }],
  ]);
});

test("setBadgeForTab: 対象URLは OFF バッジを設定", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(8, "https://laws.e-gov.go.jp/test", 4);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 8, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 8, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 8, color: "#188038" }],
  ]);
});

test("setBadgeForTab: 対象外URLはバッジを消す", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(9, "https://example.com/", 0);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 9, popup: "src/popup-disabled.html" }],
    ["setBadgeText", { tabId: 9, text: "" }],
  ]);
});

test("setBadgeForTab: 同一状態の連続更新はスキップ", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/test", 3);
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/test", 3);

  assert.equal(calls.length, 3);
});

test("commands.onCommand: toggle-decorator でレベルを循環し全タブ更新", () => {
  const { events, storageSets, calls } = createBackgroundHarness({
    initialHighlightLevel: 3,
    allTabs: [{ id: 1, url: "https://laws.e-gov.go.jp/a" }],
  });

  events.onCommand.emit("toggle-decorator");

  assert.deepEqual(normalize(storageSets.at(-1)), {
    highlightLevel: 4,
    decoratorEnabled: false,
  });
  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 1, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 1, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 1, color: "#188038" }],
  ]);
});

test("storage.onChanged: highlightLevel 変更時に反映", () => {
  const { events, calls } = createBackgroundHarness({
    allTabs: [{ id: 10, url: "https://laws.e-gov.go.jp/a" }],
  });

  events.onStorageChanged.emit(
    { highlightLevel: { oldValue: 0, newValue: 2 } },
    "local",
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 10, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 10, text: "H3" }],
    ["setBadgeBackgroundColor", { tabId: 10, color: "#d93025" }],
  ]);
});

test("storage.onChanged: legacy decoratorEnabled 変更も反映", () => {
  const { events, calls } = createBackgroundHarness({
    allTabs: [{ id: 12, url: "https://laws.e-gov.go.jp/a" }],
  });

  events.onStorageChanged.emit(
    { decoratorEnabled: { oldValue: true, newValue: false } },
    "local",
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 12, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 12, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 12, color: "#188038" }],
  ]);
});

test("tabs.onUpdated: loading でキャッシュを破棄し complete で再描画", () => {
  const { context, events, calls } = createBackgroundHarness({
    initialHighlightLevel: 1,
  });

  context.setBadgeForTab(40, "https://laws.e-gov.go.jp/a", 1);
  events.onUpdated.emit(
    40,
    { status: "loading" },
    { url: "https://laws.e-gov.go.jp/a" },
  );
  events.onUpdated.emit(
    40,
    { status: "complete" },
    { url: "https://laws.e-gov.go.jp/a" },
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 40, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 40, text: "H2" }],
    ["setBadgeBackgroundColor", { tabId: 40, color: "#d93025" }],
  ]);
});

test("runtime.onMessage: content 初期化通知で送信元タブを更新", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onMessage.emit(
    { type: "egov-content-ready" },
    { tab: { id: 30, url: "https://laws.e-gov.go.jp/a" } },
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 30, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 30, text: "H1" }],
    ["setBadgeBackgroundColor", { tabId: 30, color: "#d93025" }],
  ]);
});

test("setBadgeForTab: 閉じたタブの Promise reject(No tab with id) を無視する", async () => {
  const calls = [];
  const actionApi = {
    setPopup: (payload) => {
      calls.push(["setPopup", payload]);
      return Promise.reject(new Error(`No tab with id: ${payload.tabId}.`));
    },
    setBadgeText: (payload) => {
      calls.push(["setBadgeText", payload]);
      return Promise.reject(new Error(`No tab with id: ${payload.tabId}.`));
    },
    setBadgeBackgroundColor: (payload) => {
      calls.push(["setBadgeBackgroundColor", payload]);
      return Promise.reject(new Error(`No tab with id: ${payload.tabId}.`));
    },
  };

  const chrome = {
    action: actionApi,
    browserAction: null,
    commands: { onCommand: createEvent() },
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent(),
      lastError: null,
    },
    tabs: {
      query: (_query, cb) => cb([]),
      get: (_id, cb) => cb(null),
      onActivated: createEvent(),
      onUpdated: createEvent(),
      onRemoved: createEvent(),
    },
    windows: { onFocusChanged: createEvent(), WINDOW_ID_NONE: -1 },
    storage: {
      local: {
        get: (_keys, cb) => cb({ highlightLevel: 0 }),
        set: (_items, cb) => cb && cb(),
      },
      onChanged: createEvent(),
    },
  };

  const context = { chrome, Map, console };
  loadScript(path.resolve(__dirname, "..", "src", "background.js"), context);

  context.setBadgeForTab(99, "https://laws.e-gov.go.jp/a", 0);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 99, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 99, text: "H1" }],
    ["setBadgeBackgroundColor", { tabId: 99, color: "#d93025" }],
  ]);
});
