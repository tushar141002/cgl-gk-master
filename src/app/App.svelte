<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Settings } from '../../shared/contract';
  import type { AppDatabase } from '../data/database';
  import { SettingsRepository } from '../data/repositories/SettingsRepository';
  import { translate, type MessageKey } from '../ui/i18n/messages';
  import { provideI18n } from '../ui/i18n/context';
  import { applyLanguage, applyTheme, writeThemeHint } from '../ui/theme';
  import Home from '../ui/screens/Home.svelte';
  import SettingsScreen from '../ui/screens/Settings.svelte';
  import Placeholder from '../ui/screens/Placeholder.svelte';
  import NavBar from './NavBar.svelte';
  import { currentPath, matchPath, subscribePath, type Route } from './router';

  let { db, initialSettings }: { db: AppDatabase; initialSettings: Settings } = $props();

  const settingsRepo = new SettingsRepository(untrack(() => db));

  let settings = $state<Settings>(untrack(() => initialSettings));
  let path = $state(currentPath());
  let online = $state(true);
  let saveError = $state(false);

  const route = $derived(matchPath(path));
  const titleKey = $derived(titleKeyFor(route));

  provideI18n({
    get language() {
      return settings.language;
    },
    t: (key: MessageKey, vars?: Readonly<Record<string, string | number>>) =>
      translate(settings.language, key, vars),
  });

  onMount(() => {
    const stopRouter = subscribePath((next) => {
      path = next;
    });

    const syncOnline = (): void => {
      online = navigator.onLine;
    };
    syncOnline();
    globalThis.addEventListener('online', syncOnline);
    globalThis.addEventListener('offline', syncOnline);

    return () => {
      stopRouter();
      globalThis.removeEventListener('online', syncOnline);
      globalThis.removeEventListener('offline', syncOnline);
    };
  });

  async function save(patch: Partial<Settings>): Promise<void> {
    try {
      const next = await settingsRepo.update(patch);
      settings = next;
      saveError = false;

      if (patch.theme !== undefined) {
        applyTheme(next.theme, document.documentElement);
        writeThemeHint(next.theme);
      }
      if (patch.language !== undefined) {
        applyLanguage(next.language, document.documentElement);
      }
    } catch (error) {
      console.error('could not save settings', error);
      saveError = true;
      // Put the DOM back where it was; the stored row did not change.
      applyTheme(settings.theme, document.documentElement);
      applyLanguage(settings.language, document.documentElement);
    }
  }

  function titleKeyFor(active: Route): MessageKey {
    switch (active.name) {
      case 'home':
        return 'app.name';
      case 'practice':
        return 'practice.title';
      case 'mock':
        return 'mock.title';
      case 'progress':
        return 'progress.title';
      case 'settings':
        return 'settings.title';
      case 'not-found':
        return 'notFound.title';
    }
  }
</script>

<div class="app-shell">
  <header class="appbar">
    <span class="appbar__title">{translate(settings.language, titleKey)}</span>
  </header>

  <main class="container page stack">
    {#if !online}
      <div class="banner banner--info">{translate(settings.language, 'offline.message')}</div>
    {/if}
    {#if saveError}
      <div class="banner banner--danger" role="alert">
        {translate(settings.language, 'settings.saveFailed')}
      </div>
    {/if}

    {#if route.name === 'home'}
      <Home dailyGoal={settings.dailyGoal} />
    {:else if route.name === 'practice'}
      <Placeholder titleKey="practice.title" />
    {:else if route.name === 'mock'}
      <Placeholder titleKey="mock.title" />
    {:else if route.name === 'progress'}
      <Placeholder titleKey="progress.title" />
    {:else if route.name === 'settings'}
      <SettingsScreen {settings} onchange={(patch) => void save(patch)} />
    {:else}
      <Placeholder titleKey="notFound.title" noteKey="notFound.body" />
    {/if}
  </main>

  <NavBar current={route.name} />
</div>
