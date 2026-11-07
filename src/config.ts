/**
 * Build-time configuration (F1, F7, D-077).
 *
 * Vite bakes `VITE_*` values into the bundle at build time. The Supabase URL
 * and anon key are public by design (the anon key is shipped in every Supabase
 * web app and is limited by Row-Level Security). A build without them is
 * guest-only: practice works, and sign-in/sync stay hidden instead of failing
 * at runtime.
 */

export interface AppConfig {
  /** Project URL, no trailing slash. */
  readonly supabaseUrl: string;
  /** Public anon key, used as the `apikey` header. */
  readonly supabaseAnonKey: string;
  /** Where the OAuth provider returns; also registered in Supabase and Android. */
  readonly authRedirectUrl: string;
}

export type AppConfigState =
  { readonly status: 'configured'; readonly config: AppConfig } | { readonly status: 'unconfigured' };

/** Custom scheme + host the Android intent filter listens for (D-077). */
export const DEFAULT_AUTH_REDIRECT_URL = 'com.cglgkmaster.app://auth-callback';

/**
 * Reads configuration from a plain record so tests do not need a Vite build.
 * Blank values are treated as absent, and a trailing slash is removed so the
 * endpoint builders can append `/auth/v1/...` and `/rest/v1/...` directly.
 */
export function readConfig(env: Readonly<Record<string, string | undefined>>): AppConfigState {
  const supabaseUrl = stripTrailingSlash(trimmed(env['VITE_SUPABASE_URL']));
  const supabaseAnonKey = trimmed(env['VITE_SUPABASE_ANON_KEY']);
  const authRedirectUrl = trimmed(env['VITE_AUTH_REDIRECT_URL']) ?? DEFAULT_AUTH_REDIRECT_URL;

  if (supabaseUrl === null || supabaseAnonKey === null) return { status: 'unconfigured' };

  return {
    status: 'configured',
    config: { supabaseUrl, supabaseAnonKey, authRedirectUrl },
  };
}

/** The configuration of the running build. */
export function appConfig(): AppConfigState {
  return readConfig(import.meta.env as unknown as Record<string, string | undefined>);
}

function trimmed(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function stripTrailingSlash(value: string | null): string | null {
  return value === null ? null : value.replace(/\/+$/, '');
}
