import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';
import { cspPlugin } from './tools/web/csp';

/**
 * Web build for both targets: the Capacitor WebView and `vite dev`.
 *
 * `base: './'` keeps every asset URL relative, so the same `dist/` works when
 * Capacitor serves it from its local origin and when it is opened from a
 * sub-path later (D-055). Production builds carry a strict CSP that allows
 * network calls only to the configured Supabase project (D-087).
 */
export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, process.cwd(), 'VITE_')['VITE_SUPABASE_URL']?.trim() || null;

  return {
    base: './',
    plugins: [svelte(), cspPlugin(supabaseUrl)],
    build: {
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
