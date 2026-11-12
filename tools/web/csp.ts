import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy for the shipped app (PROJECT_SPEC.md §9, D-087).
 *
 * The session token lives in `localStorage` (D-073), so the real defence for it
 * is that no foreign script can run. The policy allows only the app's own files,
 * the one inline theme script by hash, and network calls to the configured
 * Supabase project. It is added to production builds only: `vite dev` injects
 * inline scripts and styles for hot reload, which a strict policy would block.
 */

export interface CspOptions {
  /** `VITE_SUPABASE_URL`; null for a guest-only build, which then talks to nobody. */
  readonly supabaseUrl: string | null;
  /** `sha256-...` sources for the inline scripts in index.html. */
  readonly scriptHashes: readonly string[];
}

export function buildCsp(options: CspOptions): string {
  const connect = ["'self'"];
  if (options.supabaseUrl !== null) connect.push(new URL(options.supabaseUrl).origin);

  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...options.scriptHashes.map((hash) => `'${hash}'`)]],
    // Stylesheets come from our own files; only `style="..."` attributes on
    // elements are inline (layout helpers and the progress bar width).
    ['style-src', ["'self'"]],
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', connect],
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['worker-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/** The `sha256-...` source for each inline (no `src`) script in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? '';
    if (/\ssrc\s*=/i.test(attributes)) continue;
    const body = match[2] ?? '';
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return hashes;
}

/** Inserts the policy as the first element after `<meta charset>`. */
export function injectCsp(html: string, policy: string): string {
  if (html.includes('http-equiv="Content-Security-Policy"')) {
    throw new Error('index.html already declares a Content-Security-Policy');
  }
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(html);
  if (charset === null) throw new Error('index.html is missing <meta charset>');

  const tag = `\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  const end = charset.index + charset[0].length;
  return html.slice(0, end) + tag + html.slice(end);
}

/** Vite plugin: adds the policy to the final index.html of a production build. */
export function cspPlugin(supabaseUrl: string | null): Plugin {
  return {
    name: 'cgl-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return injectCsp(html, buildCsp({ supabaseUrl, scriptHashes: inlineScriptHashes(html) }));
      },
    },
  };
}
