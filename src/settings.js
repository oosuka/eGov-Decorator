(() => {
  const DEFAULT_BG_COLOR = "#e6e6e6";
  const DEFAULT_TEXT_COLOR = "#ffffff";
  const DEFAULT_HIGHLIGHT_LEVEL = 0;
  const OFF_HIGHLIGHT_LEVEL = 4;
  const MAX_HIGHLIGHT_LEVEL = OFF_HIGHLIGHT_LEVEL;
  const STORAGE_KEYS = Object.freeze({
    decoratorEnabled: "decoratorEnabled",
    highlightLevel: "highlightLevel",
    highlightBgColor: "highlightBgColor",
    highlightTextColor: "highlightTextColor",
  });

  function toSettingsRecord(value) {
    return value && typeof value === "object" ? value : {};
  }

  function getColorOrDefault(value, defaultColor) {
    return value || defaultColor;
  }

  function getStoredColor(result, key, defaultColor) {
    return getColorOrDefault(toSettingsRecord(result)[key], defaultColor);
  }

  function isDecoratorEnabled(value) {
    return value !== false;
  }

  function normalizeHighlightLevel(value) {
    const level = Number(value);
    if (!Number.isInteger(level)) return null;
    if (level < DEFAULT_HIGHLIGHT_LEVEL || level > MAX_HIGHLIGHT_LEVEL) {
      return null;
    }
    return level;
  }

  function getLegacyHighlightLevel(decoratorEnabled) {
    return isDecoratorEnabled(decoratorEnabled)
      ? DEFAULT_HIGHLIGHT_LEVEL
      : OFF_HIGHLIGHT_LEVEL;
  }

  function getStoredHighlightLevel(result) {
    const items = toSettingsRecord(result);
    const normalizedLevel = normalizeHighlightLevel(
      items[STORAGE_KEYS.highlightLevel],
    );
    return (
      normalizedLevel ??
      getLegacyHighlightLevel(items[STORAGE_KEYS.decoratorEnabled])
    );
  }

  function isHighlightEnabled(level) {
    return level !== OFF_HIGHLIGHT_LEVEL;
  }

  function createHighlightLevelStorage(value) {
    const highlightLevel =
      normalizeHighlightLevel(value) ?? DEFAULT_HIGHLIGHT_LEVEL;
    return {
      [STORAGE_KEYS.highlightLevel]: highlightLevel,
      // Keep legacy key in sync for backward compatibility.
      [STORAGE_KEYS.decoratorEnabled]: isHighlightEnabled(highlightLevel),
    };
  }

  globalThis.EgovDecoratorSettings = Object.freeze({
    DEFAULT_BG_COLOR,
    DEFAULT_TEXT_COLOR,
    DEFAULT_HIGHLIGHT_LEVEL,
    OFF_HIGHLIGHT_LEVEL,
    MAX_HIGHLIGHT_LEVEL,
    STORAGE_KEYS,
    getColorOrDefault,
    getStoredColor,
    isDecoratorEnabled,
    normalizeHighlightLevel,
    getLegacyHighlightLevel,
    getStoredHighlightLevel,
    isHighlightEnabled,
    createHighlightLevelStorage,
  });
})();
