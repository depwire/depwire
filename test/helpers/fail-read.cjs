// Inject an actual file-read error across platforms, without POSIX chmod assumptions.
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const original = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (String(file) === process.env.DEPWIRE_TEST_UNREADABLE) {
    throw Object.assign(new Error('Injected EACCES'), { code: 'EACCES' });
  }
  return original.call(this, file, ...args);
};
syncBuiltinESMExports();
