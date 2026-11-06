/// <reference types="vite/client" />

/**
 * Svelte components are checked by the Svelte compiler during `npm run build`;
 * `tsc` only needs to know the module shape so `main.ts` can import them.
 */
declare module '*.svelte' {
  import type { Component } from 'svelte';

  const component: Component<Record<string, unknown>>;
  export default component;
}
