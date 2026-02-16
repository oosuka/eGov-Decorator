const fs = require('node:fs');
const vm = require('node:vm');

function loadScript(filePath, context) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });
  return context;
}

module.exports = { loadScript };
