import { Capacitor } from '@capacitor/core';
import { mount } from 'svelte';
import './ui/index.css';
import App from './app/App.svelte';
import { bootstrap } from './app/bootstrap';
import StorageError from './ui/screens/StorageError.svelte';
import { SettingsRepository } from './data/repositories/SettingsRepository';
import { applyLanguage, applyTheme, resolveSystemTheme, writeThemeHint } from './ui/theme';

void start();

/**
 * F1: open storage, establish preferences, then mount. Nothing on the network
 * blocks first paint; sync starts later, after the UI exists.
 */
async function start(): Promise<void> {
  const target = document.getElementById('app');
  if (target === null) throw new Error('index.html is missing #app');

  try {
    const boot = await bootstrap();
    let settings = boot.settings;

    // First install only: follow the phone's theme, then remember it.
    if (boot.settingsCreated) {
      const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
      const theme = resolveSystemTheme(prefersDark);
      if (theme !== settings.theme) {
        settings = await new SettingsRepository(boot.db).update({ theme });
      }
    }

    applyTheme(settings.theme, document.documentElement);
    writeThemeHint(settings.theme);
    applyLanguage(settings.language, document.documentElement);

    mount(App, { target, props: { db: boot.db, initialSettings: settings } });

    if (Capacitor.isNativePlatform()) {
      const { App: NativeApp } = await import('@capacitor/app');
      await NativeApp.addListener('backButton', () => {
        if (globalThis.history.length > 1) globalThis.history.back();
        else void NativeApp.exitApp();
      });
    }
  } catch (error) {
    console.error('CGL GK Master could not start', error);
    mount(StorageError, { target });
  }
}
