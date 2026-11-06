import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell (D-055). The app is a static SPA in `dist/`; Capacitor serves it
 * from the WebView's local origin, so no network is needed to start.
 *
 * The application id is permanent once the first bundle reaches Play Console;
 * it can still change before the closed test upload.
 */
const config: CapacitorConfig = {
  appId: 'com.cglgkmaster.app',
  appName: 'CGL GK Master',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
