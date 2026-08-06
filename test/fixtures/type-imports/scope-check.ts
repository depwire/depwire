function helper(): number {
  return 1;
}

export function checkSecrets(): number {
  const findings = helper();

  function nestedHelper(): number {
    return findings;
  }

  return findings + nestedHelper();
}
