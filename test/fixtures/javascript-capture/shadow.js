function target() {}
function caller(target) { target(); }
class Box {
  target() {}
  run() { this.target(); }
  miss() { this.unknown(); }
}
