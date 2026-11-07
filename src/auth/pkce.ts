/**
 * PKCE helpers for the Google → GoTrue hand-off (F7, D-073).
 *
 * Everything here is pure or takes its crypto as an argument, so the exact
 * verifier/challenge/URL shape is pinned by tests without a browser. The RFC
 * 7636 example is used as a test vector.
 */

/** 48 random bytes encode to 64 characters, inside the 43–128 range. */
const VERIFIER_BYTES = 48;

/** Bytes allowed in a verifier and in a `state` value (unreserved URL chars). */
const UNRESERVED = /^[A-Za-z0-9\-._~]+$/;

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export type AuthCallback =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'error'; readonly error: string; readonly description: string | null }
  /** A URL that carries neither a code nor an error, e.g. the app's own page. */
  | { readonly kind: 'ignored' };

export interface AuthorizeUrlInput {
  readonly supabaseUrl: string;
  readonly redirectTo: string;
  readonly challenge: string;
  readonly state: string;
}

/** `base64url` without padding, as PKCE and OAuth state require. */
export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(length: number, source: Crypto = globalThis.crypto): Uint8Array {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`length must be a positive integer (got ${String(length)})`);
  }
  const bytes = new Uint8Array(length);
  source.getRandomValues(bytes);
  return bytes;
}

export function createVerifier(random: () => Uint8Array = () => randomBytes(VERIFIER_BYTES)): string {
  const verifier = base64Url(random());
  if (!UNRESERVED.test(verifier)) {
    throw new RangeError('verifier contains characters outside the PKCE set');
  }
  return verifier;
}

/** SHA-256 of the verifier, base64url encoded (S256). */
export async function challengeFor(
  verifier: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function createPkce(
  random: () => Uint8Array = () => randomBytes(VERIFIER_BYTES),
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<PkcePair> {
  const verifier = createVerifier(random);
  return { verifier, challenge: await challengeFor(verifier, subtle) };
}

/** A fresh `state` value; the callback must echo it back exactly. */
export function createState(random: () => Uint8Array = () => randomBytes(16)): string {
  return base64Url(random());
}

/**
 * The GoTrue authorize endpoint for the Google provider.
 *
 * GoTrue reads the PKCE challenge from the query for provider redirects; the
 * `redirect_to` must be an allow-listed URL in the project's auth settings.
 */
export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const query = new URLSearchParams({
    provider: 'google',
    redirect_to: input.redirectTo,
    code_challenge: input.challenge,
    code_challenge_method: 's256',
    state: input.state,
  });
  return `${input.supabaseUrl}/auth/v1/authorize?${query.toString()}`;
}

/**
 * Reads `code` / `error` from a callback URL and checks `state`.
 *
 * Supports both the query string (Supabase PKCE) and the fragment, so a
 * provider that answers in the old implicit style produces a clear error
 * instead of silently doing nothing. A mismatched or missing state is an error,
 * never "ignored": it may be another app or a tampered link.
 */
export function parseAuthCallback(url: string, expectedState: string): AuthCallback {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'ignored' };
  }

  const params = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
  const read = (name: string): string | null => params.get(name) ?? hash.get(name);

  const error = read('error');
  if (error !== null) {
    return { kind: 'error', error, description: read('error_description') };
  }

  const code = read('code');
  if (code === null) return { kind: 'ignored' };

  const state = read('state');
  if (state === null || state !== expectedState) {
    return { kind: 'error', error: 'state_mismatch', description: null };
  }

  return { kind: 'code', code };
}
