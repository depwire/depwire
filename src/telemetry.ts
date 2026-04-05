import os from 'os'

const TELEMETRY_URL = 'https://telemetry.depwire.dev/event'

export async function trackCommand(command: string, version: string = 'unknown'): Promise<void> {
  if (
    process.env.DEPWIRE_NO_TELEMETRY === '1' ||
    process.env.DEPWIRE_NO_TELEMETRY === 'true' ||
    process.env.DO_NOT_TRACK === '1'
  ) {
    return
  }

  const payload = {
    command,
    version,
    os: os.platform(),
    node: process.version,
  }

  fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {})
}
