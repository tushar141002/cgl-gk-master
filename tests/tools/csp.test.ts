import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCsp, injectCsp, inlineScriptHashes } from '../../tools/web/csp';

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function directive(policy: string, name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  if (found === undefined) throw new Error(`no ${name} directive`);
  return found.slice(1);
}

describe('buildCsp', () => {
  it('limits network calls to the app and the Supabase origin', () => {
    const policy = buildCsp({ supabaseUrl: 'https://abc.supabase.co/', scriptHashes: [] });

    expect(directive(policy, 'connect-src')).toEqual(["'self'", 'https://abc.supabase.co']);
  });

  it('allows no network origin for a guest-only build', () => {
    const policy = buildCsp({ supabaseUrl: null, scriptHashes: [] });

    expect(directive(policy, 'connect-src')).toEqual(["'self'"]);
  });

  it('allows inline scripts only by hash, never unsafe-inline or eval', () => {
    const policy = buildCsp({ supabaseUrl: null, scriptHashes: ['sha256-abc='] });

    expect(directive(policy, 'script-src')).toEqual(["'self'", "'sha256-abc='"]);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(policy, 'style-src')).toEqual(["'self'"]);
  });

  it('blocks plugins, frames, workers, base rewriting and form posts', () => {
    const policy = buildCsp({ supabaseUrl: null, scriptHashes: [] });

    for (const name of ['object-src', 'frame-src', 'worker-src', 'base-uri', 'form-action']) {
      expect(directive(policy, name), name).toEqual(["'none'"]);
    }
  });
});

describe('inlineScriptHashes', () => {
  it('hashes the theme script in index.html and skips the module entry', () => {
    const hashes = inlineScriptHashes(INDEX_HTML);

    expect(hashes).toHaveLength(1);
    const body = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML)![1]!;
    expect(hashes[0]).toBe(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  });
});

describe('injectCsp', () => {
  it('puts the policy right after the charset, before any script', () => {
    const html = injectCsp(INDEX_HTML, "default-src 'self'");
    const csp = html.indexOf('http-equiv="Content-Security-Policy"');

    expect(csp).toBeGreaterThan(html.indexOf('<meta charset'));
    expect(csp).toBeLessThan(html.indexOf('<script'));
  });

  it('refuses a page that already has a policy', () => {
    const once = injectCsp(INDEX_HTML, "default-src 'self'");

    expect(() => injectCsp(once, "default-src 'self'")).toThrow('already declares');
  });
});

describe('the app never renders raw HTML', () => {
  it('has no {@html}, innerHTML or eval in src', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(svelte|ts)$/.test(name)) {
          const text = readFileSync(path, 'utf8');
          if (/\{@html|\.innerHTML\s*=|\beval\(|new Function\(/.test(text)) offenders.push(path);
        }
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});
