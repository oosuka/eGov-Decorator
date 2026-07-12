const fs = require("node:fs");
const vm = require("node:vm");

function loadScript(filePath, context) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!vm.isContext(context)) {
    vm.createContext(context);
  }
  vm.runInContext(source, context, { filename: filePath });
  return context;
}

function loadScripts(filePaths, context) {
  filePaths.forEach((filePath) => {
    loadScript(filePath, context);
  });
  return context;
}

module.exports = { loadScript, loadScripts };
