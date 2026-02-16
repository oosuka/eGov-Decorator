module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  ignorePatterns: ["images/**"],
  overrides: [
    {
      files: ["background.js", "content.js", "options.js"],
      env: {
        browser: true,
        node: false,
      },
      globals: {
        chrome: "readonly",
      },
    },
    {
      files: ["tests/**/*.js"],
      env: {
        node: true,
        browser: false,
      },
    },
    {
      files: [".eslintrc.cjs"],
      env: {
        node: true,
      },
    },
  ],
};
