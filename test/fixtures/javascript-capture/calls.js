function target() {}
const obj = {};
obj.target();
const holder = {};
holder.method = function method() {
  target();
  setTimeout(() => target(), 1);
};
target();
