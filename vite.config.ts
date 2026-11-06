import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * Web build for both targets: the Capacitor WebView and `vite dev`.
 *
 * `base: './'` keeps every asset URL relative, so the same `dist/` works when
 * Capacitor serves it from its local origin and when it is opened from a
 * sub-path later (D-055).
 */
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
