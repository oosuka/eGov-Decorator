const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadScript } = require("./helpers/load-script");

const SETTINGS_PATH = path.resolve(__dirname, "..", "src", "settings.js");

function createSettingsContext() {
  return loadScript(SETTINGS_PATH, {});
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test("設定定数: 既定値と storage キーを一元管理する", () => {
  const { EgovDecoratorSettings: settings } = createSettingsContext();

  assert.equal(settings.DEFAULT_BG_COLOR, "#e6e6e6");
  assert.equal(settings.DEFAULT_TEXT_COLOR, "#ffffff");
  assert.equal(settings.DEFAULT_HIGHLIGHT_LEVEL, 0);
  assert.equal(settings.OFF_HIGHLIGHT_LEVEL, 4);
  assert.equal(settings.MAX_HIGHLIGHT_LEVEL, 4);
  assert.deepEqual(normalize(settings.STORAGE_KEYS), {
    decoratorEnabled: "decoratorEnabled",
    highlightLevel: "highlightLevel",
    highlightBgColor: "highlightBgColor",
    highlightTextColor: "highlightTextColor",
  });
  assert.equal(Object.isFrozen(settings), true);
  assert.equal(Object.isFrozen(settings.STORAGE_KEYS), true);
});

test("normalizeHighlightLevel: 0〜4 の整数と数値文字列を受け入れる", async (t) => {
  const { normalizeHighlightLevel } =
    createSettingsContext().EgovDecoratorSettings;
  const cases = [
    [0, 0],
    [1, 1],
    [4, 4],
    ["0", 0],
    ["3", 3],
  ];

  for (const [input, expected] of cases) {
    await t.test(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(normalizeHighlightLevel(input), expected);
    });
  }
});

test("normalizeHighlightLevel: 範囲外・小数・非数値を拒否する", async (t) => {
  const { normalizeHighlightLevel } =
    createSettingsContext().EgovDecoratorSettings;
  const cases = [-1, 5, 1.5, "invalid", undefined];

  for (const input of cases) {
    await t.test(`${String(input)} -> null`, () => {
      assert.equal(normalizeHighlightLevel(input), null);
    });
  }
});

test("getStoredHighlightLevel: 有効な新キーを legacy キーより優先する", () => {
  const { getStoredHighlightLevel } =
    createSettingsContext().EgovDecoratorSettings;

  assert.equal(
    getStoredHighlightLevel({ highlightLevel: 2, decoratorEnabled: false }),
    2,
  );
});

test("getStoredHighlightLevel: 新キーが不正なら legacy キーへフォールバックする", () => {
  const { getStoredHighlightLevel } =
    createSettingsContext().EgovDecoratorSettings;

  assert.equal(
    getStoredHighlightLevel({
      highlightLevel: "invalid",
      decoratorEnabled: false,
    }),
    4,
  );
  assert.equal(getStoredHighlightLevel({ highlightLevel: 99 }), 0);
  assert.equal(getStoredHighlightLevel(null), 0);
});

test("getLegacyHighlightLevel: false のみ OFF として扱う", () => {
  const { getLegacyHighlightLevel } =
    createSettingsContext().EgovDecoratorSettings;

  assert.equal(getLegacyHighlightLevel(false), 4);
  assert.equal(getLegacyHighlightLevel(true), 0);
  assert.equal(getLegacyHighlightLevel(undefined), 0);
  assert.equal(getLegacyHighlightLevel(null), 0);
});

test("getStoredColor: 保存色を返し、未設定では既定色を返す", () => {
  const { getStoredColor } = createSettingsContext().EgovDecoratorSettings;

  assert.equal(
    getStoredColor({ color: "#123456" }, "color", "#ffffff"),
    "#123456",
  );
  assert.equal(getStoredColor({}, "color", "#ffffff"), "#ffffff");
  assert.equal(getStoredColor(null, "color", "#ffffff"), "#ffffff");
});

test("createHighlightLevelStorage: 新旧キーを常に整合させる", async (t) => {
  const { createHighlightLevelStorage } =
    createSettingsContext().EgovDecoratorSettings;
  const cases = [
    [0, { highlightLevel: 0, decoratorEnabled: true }],
    ["3", { highlightLevel: 3, decoratorEnabled: true }],
    [4, { highlightLevel: 4, decoratorEnabled: false }],
    [99, { highlightLevel: 0, decoratorEnabled: true }],
  ];

  for (const [input, expected] of cases) {
    await t.test(`${JSON.stringify(input)} の保存値`, () => {
      assert.deepEqual(normalize(createHighlightLevelStorage(input)), expected);
    });
  }
});

test("読み込み配線: content と popup は settings.js を先に読み込む", () => {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  const popup = fs.readFileSync(path.join(root, "src", "popup.html"), "utf8");
  const background = fs.readFileSync(
    path.join(root, "src", "background.js"),
    "utf8",
  );

  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/settings.js",
    "src/content.js",
  ]);
  assert.ok(
    popup.indexOf('src="settings.js"') < popup.indexOf('src="options.js"'),
  );
  assert.match(background, /importScripts\("settings\.js"\)/);
});
