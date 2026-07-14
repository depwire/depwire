import os from 'os'

const TELEMETRY_URL = 'https://telemetry.depwire.dev/event'

function isOptedOut(): boolean {
  return (
    process.env.DEPWIRE_NO_TELEMETRY === '1' ||
    process.env.DEPWIRE_NO_TELEMETRY === 'true' ||
    process.env.DO_NOT_TRACK === '1'
  )
}

function sendEvent(payload: Record<string, string>): void {
  fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {})
}

export async function trackCommand(command: string, version: string = 'unknown'): Promise<void> {
  if (isOptedOut()) return
  sendEvent({
    command,
    version,
    os: os.platform(),
    node: process.version,
  })
}

export async function trackCloudCta(command: string, version: string = 'unknown'): Promise<void> {
  if (isOptedOut()) return
  sendEvent({
    event: 'cloud_cta_shown',
    command,
    version,
    os: os.platform(),
    node: process.version,
  })
}
