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
      sendMessage: (tabId, message, cb) => {
        calls.push(["sendMessage", { tabId, message }]);
        if (!cb) return;
        const invokeCallback = () => {
          if (options.sendMessageLastError) {
            chrome.runtime.lastError = { message: "No receiver" };
          } else {
            chrome.runtime.lastError = null;
          }
          cb();
          chrome.runtime.lastError = null;
        };
        if (typeof setImmediate === "function") {
          setImmediate(invokeCallback);
          return;
        }
        setTimeout(invokeCallback, 0);
      },
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

async function captureUnhandledRejections(run) {
  const reasons = [];
  const onUnhandledRejection = (reason) => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    await run();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }
  return reasons;
}

test("isTargetUrl: laws/elaws のみ true", () => {
  const { context } = createBackgroundHarness();
  assert.equal(context.isTargetUrl("https://laws.e-gov.go.jp/law/test"), true);
  assert.equal(context.isTargetUrl("https://elaws.e-gov.go.jp/law/test"), true);
  assert.equal(context.isTargetUrl("https://laws.e-gov.go.jp/test"), false);
  assert.equal(context.isTargetUrl("https://example.com/"), false);
});

test("初期化時: 保存 highlightLevel を使って全タブのバッジを更新", () => {
  const { calls } = createBackgroundHarness({
    initialHighlightLevel: 2,
    allTabs: [{ id: 20, url: "https://laws.e-gov.go.jp/law/a" }],
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
    allTabs: [{ id: 21, url: "https://laws.e-gov.go.jp/law/a" }],
  });

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 21, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 21, text: "OFF" }],
    ["setBadgeBackgroundColor", { tabId: 21, color: "#188038" }],
  ]);
});

test("setBadgeForTab: 対象URLは H2 バッジを設定", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(7, "https://laws.e-gov.go.jp/law/test", 1);

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 7, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 7, text: "H2" }],
    ["setBadgeBackgroundColor", { tabId: 7, color: "#d93025" }],
  ]);
});

test("setBadgeForTab: 対象URLは OFF バッジを設定", () => {
  const { context, calls } = createBackgroundHarness();
  context.setBadgeForTab(8, "https://laws.e-gov.go.jp/law/test", 4);

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
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/law/test", 3);
  context.setBadgeForTab(11, "https://laws.e-gov.go.jp/law/test", 3);

  assert.equal(calls.length, 3);
});

test("commands.onCommand: toggle-decorator でレベルを循環し全タブ更新", () => {
  const { events, storageSets, calls } = createBackgroundHarness({
    initialHighlightLevel: 3,
    allTabs: [{ id: 1, url: "https://laws.e-gov.go.jp/law/a" }],
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
    allTabs: [{ id: 10, url: "https://laws.e-gov.go.jp/law/a" }],
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
    allTabs: [{ id: 12, url: "https://laws.e-gov.go.jp/law/a" }],
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

  context.setBadgeForTab(40, "https://laws.e-gov.go.jp/law/a", 1);
  events.onUpdated.emit(
    40,
    { status: "loading" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );
  events.onUpdated.emit(
    40,
    { status: "complete" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );

  const normalizedCalls = normalize(calls);
  assert.equal(
    normalizedCalls.some(
      (entry) =>
        entry[0] === "setPopup" &&
        entry[1].tabId === 40 &&
        entry[1].popup === "src/popup.html",
    ),
    true,
  );
  assert.equal(
    normalizedCalls.some(
      (entry) =>
        entry[0] === "setBadgeText" &&
        entry[1].tabId === 40 &&
        entry[1].text === "H2",
    ),
    true,
  );
  assert.equal(
    normalizedCalls.some(
      (entry) =>
        entry[0] === "setBadgeBackgroundColor" &&
        entry[1].tabId === 40 &&
        entry[1].color === "#d93025",
    ),
    true,
  );
});

test("runtime.onMessage: content 初期化通知で送信元タブを更新", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onMessage.emit(
    { type: "egov-content-ready" },
    { tab: { id: 30, url: "https://laws.e-gov.go.jp/law/a" } },
  );

  assert.deepEqual(normalize(calls.slice(-3)), [
    ["setPopup", { tabId: 30, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 30, text: "H1" }],
    ["setBadgeBackgroundColor", { tabId: 30, color: "#d93025" }],
  ]);
});

test("tabs.onUpdated: URL更新時に content 再同期メッセージを送る", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onUpdated.emit(
    31,
    { url: "https://laws.e-gov.go.jp/law/a" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );

  assert.equal(
    normalize(calls).some(
      (entry) =>
        entry[0] === "sendMessage" &&
        entry[1].tabId === 31 &&
        entry[1].message.type === "egov-force-sync",
    ),
    true,
  );
});

test("tabs.onUpdated: 対象外URLでも content 再同期メッセージを送る", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onUpdated.emit(
    32,
    { url: "https://laws.e-gov.go.jp/result" },
    { url: "https://laws.e-gov.go.jp/result" },
  );

  assert.equal(
    normalize(calls).some(
      (entry) =>
        entry[0] === "sendMessage" &&
        entry[1].tabId === 32 &&
        entry[1].message.type === "egov-force-sync",
    ),
    true,
  );
});

test("tabs.onUpdated: e-Govドメイン外URLでは content 再同期メッセージを送らない", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onUpdated.emit(
    34,
    { url: "https://example.com/path" },
    { url: "https://example.com/path" },
  );

  assert.equal(
    normalize(calls).some(
      (entry) =>
        entry[0] === "sendMessage" &&
        entry[1].tabId === 34 &&
        entry[1].message.type === "egov-force-sync",
    ),
    false,
  );
});

test("tabs.onUpdated: 同一URLへの再同期メッセージは重複送信しない", () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
  });

  events.onUpdated.emit(
    33,
    { url: "https://laws.e-gov.go.jp/law/a" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );
  events.onUpdated.emit(
    33,
    { url: "https://laws.e-gov.go.jp/law/a" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );

  const syncCalls = normalize(calls).filter(
    (entry) =>
      entry[0] === "sendMessage" &&
      entry[1].tabId === 33 &&
      entry[1].message.type === "egov-force-sync",
  );
  assert.equal(syncCalls.length, 1);
});

test("tabs.onUpdated: 受信者なしエラー時は同一URLでも再試行できる", async () => {
  const { events, calls } = createBackgroundHarness({
    initialHighlightLevel: 0,
    sendMessageLastError: true,
  });

  events.onUpdated.emit(
    35,
    { url: "https://laws.e-gov.go.jp/law/a" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );
  await new Promise((resolve) => setImmediate(resolve));

  events.onUpdated.emit(
    35,
    { url: "https://laws.e-gov.go.jp/law/a" },
    { url: "https://laws.e-gov.go.jp/law/a" },
  );

  const syncCalls = normalize(calls).filter(
    (entry) =>
      entry[0] === "sendMessage" &&
      entry[1].tabId === 35 &&
      entry[1].message.type === "egov-force-sync",
  );
  assert.equal(syncCalls.length, 2);
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

  const unhandledRejections = await captureUnhandledRejections(async () => {
    context.setBadgeForTab(99, "https://laws.e-gov.go.jp/law/a", 0);
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(normalize(calls), [
    ["setPopup", { tabId: 99, popup: "src/popup.html" }],
    ["setBadgeText", { tabId: 99, text: "H1" }],
    ["setBadgeBackgroundColor", { tabId: 99, color: "#d93025" }],
  ]);
  assert.equal(unhandledRejections.length, 0);
});

test("setBadgeForTab: No tab with id 以外の Promise reject は console.error で処理する", async () => {
  const errors = [];
  const calls = [];
  const actionApi = {
    setPopup: (payload) => {
      calls.push(["setPopup", payload]);
      return Promise.reject(
        new Error(`Unexpected error for tab ${payload.tabId}`),
      );
    },
    setBadgeText: (payload) => {
      calls.push(["setBadgeText", payload]);
      return Promise.reject(
        new Error(`Unexpected error for tab ${payload.tabId}`),
      );
    },
    setBadgeBackgroundColor: (payload) => {
      calls.push(["setBadgeBackgroundColor", payload]);
      return Promise.reject(
        new Error(`Unexpected error for tab ${payload.tabId}`),
      );
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

  const context = {
    chrome,
    Map,
    console: {
      error: (...args) => errors.push(args.map(String).join(" ")),
      log: () => {},
      warn: () => {},
    },
  };

  loadScript(path.resolve(__dirname, "..", "src", "background.js"), context);

  context.setBadgeForTab(77, "https://laws.e-gov.go.jp/law/a", 0);
  await Promise.resolve();
  await Promise.resolve();
  context.setBadgeForTab(77, "https://laws.e-gov.go.jp/law/a", 0);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errors.length, 6);
  assert.equal(calls.length, 6);
  errors.forEach((line) => {
    assert.match(line, /\[e-Gov Decorator\] action API call failed:/);
    assert.match(line, /Unexpected error for tab 77/);
  });
});

test("setBadgeForTab: 同期 throw(No tab with id) 時にキャッシュを残さない", () => {
  const calls = [];
  const actionApi = {
    setPopup: () => {},
    setBadgeText: (payload) => {
      calls.push(payload);
      throw new Error(`No tab with id: ${payload.tabId}.`);
    },
    setBadgeBackgroundColor: () => {
      throw new Error("should not be called");
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

  context.setBadgeForTab(55, "https://example.com/", 0);
  context.setBadgeForTab(55, "https://example.com/", 0);

  assert.deepEqual(normalize(calls), [
    { tabId: 55, text: "" },
    { tabId: 55, text: "" },
  ]);
});
