export function outer(): number {
  function first(): number {
    return second();
  }

  function second(): number {
    return 1;
  }

  return first();
}
