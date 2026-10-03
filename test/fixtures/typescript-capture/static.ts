import { Worker } from './static-barrel.js';
import { Hidden } from './static-target.js';
import { Worker as WildWorker } from './static-wildcard-barrel.js';

Worker.run();
WildWorker.run();
Worker.instance();
Hidden.run();

class Local {
  static run() {}
  instance() {}
}

Local.run();
Local.instance();
