import { describe, expect, it } from 'vitest';
import {
  base64Url,
  buildAuthorizeUrl,
  challengeFor,
  createPkce,
  createVerifier,
  parseAuthCallback,
  randomBytes,
} from '../../src/auth/pkce';

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE (D-073)', () => {
  it('matches the RFC 7636 Appendix B vector', async () => {
    expect(await challengeFor(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it('base64url has no padding and uses the URL alphabet', () => {
    expect(base64Url(Uint8Array.from([3, 236, 255, 224, 193]))).toBe('A-z_4ME');
  });

  it('mints a verifier inside the 43..128 character range', () => {
    for (let i = 0; i < 20; i += 1) {
      const verifier = createVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it('derives a challenge from the same verifier every time', async () => {
    const pkce = await createPkce(() => Uint8Array.from({ length: 48 }, (_, i) => i));
    expect(pkce.challenge).toBe(await challengeFor(pkce.verifier));
  });

  it('rejects an impossible random length', () => {
    expect(() => randomBytes(0)).toThrow(RangeError);
    expect(() => randomBytes(-1)).toThrow(RangeError);
  });

  it('builds the GoTrue authorize URL for Google', () => {
    const url = buildAuthorizeUrl({
      supabaseUrl: 'https://project.test',
      redirectTo: 'com.cglgkmaster.app://auth-callback',
      challenge: 'challenge-1',
      state: 'state-1',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://project.test/auth/v1/authorize');
    expect(parsed.searchParams.get('provider')).toBe('google');
    expect(parsed.searchParams.get('redirect_to')).toBe('com.cglgkmaster.app://auth-callback');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('s256');
    expect(parsed.searchParams.get('state')).toBe('state-1');
  });
});

describe('auth callback parsing (D-073)', () => {
  it('reads a code from the query when the state matches', () => {
    expect(parseAuthCallback('com.cglgkmaster.app://auth-callback?code=abc&state=s1', 's1')).toEqual({
      kind: 'code',
      code: 'abc',
    });
  });

  it('reads a code from the fragment too', () => {
    expect(parseAuthCallback('com.cglgkmaster.app://auth-callback#code=abc&state=s1', 's1')).toEqual({
      kind: 'code',
      code: 'abc',
    });
  });

  it('never treats a mismatched or missing state as success', () => {
    for (const url of [
      'com.cglgkmaster.app://auth-callback?code=abc&state=other',
      'com.cglgkmaster.app://auth-callback?code=abc',
    ]) {
      expect(parseAuthCallback(url, 's1')).toEqual({
        kind: 'error',
        error: 'state_mismatch',
        description: null,
      });
    }
  });

  it('reports a provider error instead of a code', () => {
    expect(
      parseAuthCallback(
        'com.cglgkmaster.app://auth-callback?error=access_denied&error_description=Denied&state=s1',
        's1',
      ),
    ).toEqual({ kind: 'error', error: 'access_denied', description: 'Denied' });
  });

  it('ignores a URL that carries neither', () => {
    expect(parseAuthCallback('https://localhost/#/settings', 's1')).toEqual({ kind: 'ignored' });
    expect(parseAuthCallback('not a url', 's1')).toEqual({ kind: 'ignored' });
  });
});
