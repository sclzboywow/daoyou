import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTurnstileAuthEnabled,
  isTurnstileServerEnabled,
} from './turnstile';

describe('Turnstile configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not protect auth when the client site key is missing', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'server-secret');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');

    expect(isTurnstileServerEnabled()).toBe(true);
    expect(isTurnstileAuthEnabled()).toBe(false);
  });

  it('protects auth when both client and server keys are configured', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'server-secret');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');

    expect(isTurnstileAuthEnabled()).toBe(true);
  });
});
