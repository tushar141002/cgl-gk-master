/**
 * The router (D-056): hash paths, a pure matcher, one DOM subscription.
 *
 * Hash routing works unchanged in the Capacitor WebView and in `vite dev`, and
 * it gives the Android back button a history entry per screen without a server
 * rewrite rule.
 */

export type RouteName = 'home' | 'practice' | 'mock' | 'progress' | 'settings' | 'not-found';

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'practice'; readonly subtopic: string | null }
  | { readonly name: 'mock'; readonly id: string }
  | { readonly name: 'progress' }
  | { readonly name: 'settings' }
  | { readonly name: 'not-found'; readonly path: string };

/** `#/practice/polity` → `practice/polity`; `#` and `#/` → `''`. */
export function parseHash(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  return withoutHash.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Always returns a hash URL, so templates can use it as an href. */
export function buildHref(path: string): string {
  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized.length === 0 ? '#/' : `#/${normalized}`;
}

/** Turns a path into a route; unknown paths stay renderable as a 404. */
export function matchPath(path: string): Route {
  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized === '' || normalized === 'home') return { name: 'home' };

  const segments = normalized.split('/').map(decodeSegment);

  switch (segments[0]) {
    case 'practice': {
      if (segments.length === 1) return { name: 'practice', subtopic: null };
      if (segments.length === 2) return { name: 'practice', subtopic: segments[1] ?? null };
      break;
    }
    case 'mock': {
      if (segments.length === 2) return { name: 'mock', id: segments[1] ?? '' };
      break;
    }
    case 'progress': {
      if (segments.length === 1) return { name: 'progress' };
      break;
    }
    case 'settings': {
      if (segments.length === 1) return { name: 'settings' };
      break;
    }
    default:
      break;
  }

  return { name: 'not-found', path: normalized };
}

/** The path currently in the address bar, without the hash. */
export function currentPath(): string {
  return parseHash(globalThis.location?.hash ?? '');
}

/** Navigates without reloading; a repeated path is a no-op. */
export function navigate(path: string): void {
  const href = buildHref(path);
  if (globalThis.location.hash === href) return;
  globalThis.location.hash = href;
}

/**
 * Calls `listener` immediately and on every hash change. Returns an unsubscribe
 * function. In a non-browser (tests, build-time evaluation) it does nothing.
 */
export function subscribePath(listener: (path: string) => void): () => void {
  if (typeof globalThis.addEventListener !== 'function') return () => undefined;

  const notify = (): void => listener(currentPath());
  notify();
  globalThis.addEventListener('hashchange', notify);
  return () => globalThis.removeEventListener('hashchange', notify);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
