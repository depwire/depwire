import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackCloudCta, trackCommand } from '../src/telemetry.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('telemetry opt-out', () => {
  it.each([
    ['DO_NOT_TRACK', '1'],
    ['DEPWIRE_NO_TELEMETRY', '1'],
    ['DEPWIRE_NO_TELEMETRY', 'true'],
  ])('does not attempt a network call when %s=%s', async (name, value) => {
    delete process.env.DO_NOT_TRACK;
    delete process.env.DEPWIRE_NO_TELEMETRY;
    process.env[name] = value;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await trackCommand('parse', 'test');
    await trackCloudCta('security', 'test');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
