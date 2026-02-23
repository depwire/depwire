const config = require('../config');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

function createLogger(module) {
  return {
    debug: (msg) => config.DEBUG && console.log(`[DEBUG][${module}] ${msg}`),
    info: (msg) => console.log(`[INFO][${module}] ${msg}`),
    warn: (msg) => console.warn(`[WARN][${module}] ${msg}`),
    error: (msg) => console.error(`[ERROR][${module}] ${msg}`),
  };
}

module.exports = { createLogger, LOG_LEVELS };
