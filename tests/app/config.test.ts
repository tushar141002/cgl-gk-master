import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTH_REDIRECT_URL, readConfig } from '../../src/config';

describe('build-time config (F1, D-073)', () => {
  it('is guest-only when the Supabase URL or key is missing', () => {
    expect(readConfig({})).toEqual({ status: 'unconfigured' });
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.test' })).toEqual({ status: 'unconfigured' });
    expect(readConfig({ VITE_SUPABASE_ANON_KEY: 'key' })).toEqual({ status: 'unconfigured' });
  });

  it('treats blank values as absent', () => {
    expect(readConfig({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: 'key' })).toEqual({
      status: 'unconfigured',
    });
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.test', VITE_SUPABASE_ANON_KEY: '\t' })).toEqual({
      status: 'unconfigured',
    });
  });

  it('trims values, strips a trailing slash and defaults the redirect', () => {
    expect(
      readConfig({
        VITE_SUPABASE_URL: ' https://project.test/ ',
        VITE_SUPABASE_ANON_KEY: ' anon-key ',
      }),
    ).toEqual({
      status: 'configured',
      config: {
        supabaseUrl: 'https://project.test',
        supabaseAnonKey: 'anon-key',
        authRedirectUrl: DEFAULT_AUTH_REDIRECT_URL,
      },
    });
  });

  it('keeps an explicit redirect URL', () => {
    const state = readConfig({
      VITE_SUPABASE_URL: 'https://project.test',
      VITE_SUPABASE_ANON_KEY: 'key',
      VITE_AUTH_REDIRECT_URL: 'com.cglgkmaster.app://auth-callback',
    });

    expect(state).toMatchObject({
      status: 'configured',
      config: { authRedirectUrl: 'com.cglgkmaster.app://auth-callback' },
    });
  });

  it('uses the scheme the Android manifest listens for', () => {
    expect(DEFAULT_AUTH_REDIRECT_URL).toBe('com.cglgkmaster.app://auth-callback');
  });
});
