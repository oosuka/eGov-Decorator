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
      decoratorEnabled: options.initialEnabled ?? true,
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

test("初期化時: 保存状態を使って全タブのバッジを更新", () => {
  const { calls } = createBackgroundHarness({
    initialEnabled: true,
    allTabs: [{ id: 20, url: "https://laws.e-gov.go.jp/a" }],
  });

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 20, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 20, text: "ON" }],
    ["setBadgeBackgroundColor", { tabId: 20, color: "#d93025" }],
  ]);
});

test("setBadgeForTab: 対象URLは ON バッジを設定", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(7, "https://laws.e-gov.go.jp/test", true);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 7, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 7, text: "ON" }],
    ["setBadgeBackgroundColor", { tabId: 7, color: "#d93025" }],
  ]);
});

test("setBadgeForTab: 対象外URLはバッジを消す", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(9, "https://example.com/", true);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 9, popup: "" }],
    ["setBadgeText", { tabId: 9, text: "" }],
  ]);
});

test("setBadgeForTab: 同一状態の連続更新はスキップ", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/test", false);
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/test", false);

  assert.equal(calls.length, 3);
});

test("commands.onCommand: toggle-decorator で状態を反転して全タブ更新", () => {
  const { events, storageSets, calls } = createBackgroundHarness({
    initialEnabled: true,
    allTabs: [{ id: 1, url: "https://laws.e-gov.go.jp/a" }],
  });

  events.onCommand.emit("toggle-decorator");

  assert.deepEqual(normalize(storageSets.at(-1)), { decoratorEnabled: false });
  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 1, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 1, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 1, color: "#188038" }],
  ]);
});

test("storage.onChanged: undefined は既定どおり有効扱い", () => {
  const { events, calls } = createBackgroundHarness({
    allTabs: [{ id: 10, url: "https://laws.e-gov.go.jp/a" }],
  });

  events.onStorageChanged.emit(
    { decoratorEnabled: { oldValue: false, newValue: undefined } },
    "local",
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 10, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 10, text: "ON" }],
    ["setBadgeBackgroundColor", { tabId: 10, color: "#d93025" }],
  ]);
});

test("tabs.onUpdated: loading でキャッシュを破棄し complete で再描画", () => {
  const { context, events, calls } = createBackgroundHarness();

  context.setBadgeForTab(40, "https://laws.e-gov.go.jp/a", true);
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
    ["setBadgeText", { tabId: 40, text: "ON" }],
    ["setBadgeBackgroundColor", { tabId: 40, color: "#d93025" }],
  ]);
});

test("runtime.onMessage: content 初期化通知で送信元タブを更新", () => {
  const { events, calls } = createBackgroundHarness();

  events.onMessage.emit(
    { type: "egov-content-ready" },
    { tab: { id: 30, url: "https://laws.e-gov.go.jp/a" } },
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 30, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 30, text: "ON" }],
    ["setBadgeBackgroundColor", { tabId: 30, color: "#d93025" }],
  ]);
});
