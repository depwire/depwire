function target() {}
class TargetClass {}
function typed(value: TargetClass) { new TargetClass(); void value; }
const object = { run() { target(); } };
class Box {
  field = () => target();
  @decorate(target())
  method() { target(); }
}
function decorate(_value: unknown) { return () => {}; }
const callback = () => target();
[1].forEach(() => target());
(() => target())();
target();
new TargetClass();
unknown();
unknownReceiver.run();
const dynamic = {} as { ctor: new () => object };
new dynamic.ctor();
void object;
void callback;
void Box;
