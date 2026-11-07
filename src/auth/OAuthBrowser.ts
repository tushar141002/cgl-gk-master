/**
 * The browser surface that hosts the Google consent screen (F7, D-073).
 *
 * Google refuses OAuth inside an embedded WebView, so Android uses a custom tab
 * and returns through the `com.cglgkmaster.app://auth-callback` deep link. This
 * seam keeps `AuthService` free of Capacitor imports and lets tests drive the
 * redirect by hand.
 */
export interface OAuthBrowser {
  /** Opens the consent page. Resolves once it is open, not when it closes. */
  open(url: string): Promise<void>;
  /** Subscribes before opening, so a fast redirect cannot be missed. */
  subscribe(handler: (url: string) => void): Promise<() => void>;
  close(): Promise<void>;
}

/**
 * Android: Capacitor Browser (custom tab) plus the App deep-link listener.
 * Both plugins are imported lazily so the web bundle does not load them.
 */
export class CapacitorOAuthBrowser implements OAuthBrowser {
  async open(url: string): Promise<void> {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  }

  async subscribe(handler: (url: string) => void): Promise<() => void> {
    const { App: NativeApp } = await import('@capacitor/app');
    const listener = await NativeApp.addListener('appUrlOpen', (event) => handler(event.url));
    return () => {
      void listener.remove();
    };
  }

  async close(): Promise<void> {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch {
      // Already closed by the user or the OS.
    }
  }
}

/**
 * Web (dev and a future PWA): a full-page redirect. The page reloads, so the
 * caller resumes from the URL on boot instead of waiting for a callback here.
 */
export class WindowOAuthBrowser implements OAuthBrowser {
  async open(url: string): Promise<void> {
    globalThis.location.assign(url);
  }

  async subscribe(): Promise<() => void> {
    return () => undefined;
  }

  async close(): Promise<void> {
    // The tab is the browser; nothing to close.
  }
}

export function createOAuthBrowser(native: boolean): OAuthBrowser {
  return native ? new CapacitorOAuthBrowser() : new WindowOAuthBrowser();
}
