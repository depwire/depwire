import { Worker } from './static-wildcard-barrel.js';

class Local {
  static first() {
    Local.later();
    Local.field();
  }
  static later() {}
  static field = () => {};
}

Worker.field();
Local.first();
