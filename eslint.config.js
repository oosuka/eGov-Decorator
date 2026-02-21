const js = require("@eslint/js");
const globals = require("globals");

const COMMON_IGNORES = [
  "assets/icons/**",
  "node_modules/**",
  "dist/**",
  "coverage/**",
];

const COMMON_RULES = {
  "no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
  "prefer-const": "error",
};

module.exports = [
  {
    ignores: COMMON_IGNORES,
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
    },
    rules: COMMON_RULES,
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.node,
    },
  },
];
