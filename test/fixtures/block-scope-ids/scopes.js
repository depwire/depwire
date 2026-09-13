export function choose(flag) {
  if (flag) {
    const value = () => 1;
    return value();
  }

  if (!flag) {
    const value = () => 2;
    return value();
  }

  for (let index = 0; index < 1; index++) {
    const value = () => index;
    return value();
  }

  return 0;
}
