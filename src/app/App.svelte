<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import type { Settings } from '../../shared/contract';
  import { appConfig } from '../config';
  import { wipeLocalData, type AppDatabase } from '../data/database';
  import { SettingsRepository } from '../data/repositories/SettingsRepository';
  import { ProgressService } from '../services/ProgressService';
  import { PracticeService } from '../services/PracticeService';
  import { AccountDeletionError } from '../services/AccountService';
  import { AccountMismatchError, type AuthState } from '../services/AuthService';
  import { HistoryError } from '../services/HistoryService';
  import { examDeadlineFrom } from '../services/examDeadline';
  import { PackInstaller } from '../sync/PackInstaller';
  import { CONTENT_PUBLIC_KEY } from '../sync/contentPublicKey';
  import { translate, type MessageKey } from '../ui/i18n/messages';
  import { provideI18n } from '../ui/i18n/context';
  import { applyLanguage, applyTheme, writeThemeHint } from '../ui/theme';
  import SettingsScreen, { type DataProblem } from '../ui/screens/Settings.svelte';
  import Placeholder from '../ui/screens/Placeholder.svelte';
  import HomeRoute from './HomeRoute.svelte';
  import PracticeRoute from './PracticeRoute.svelte';
  import NavBar from './NavBar.svelte';
  import { currentPath, matchPath, subscribePath, type Route } from './router';
  import { createSyncRuntime } from './syncRuntime';

  let { db, initialSettings, deviceId }: { db: AppDatabase; initialSettings: Settings; deviceId: string } =
    $props();

  const settingsRepo = new SettingsRepository(untrack(() => db));
  const progressService = new ProgressService(untrack(() => db));
  const practiceService = new PracticeService(
    untrack(() => db),
    {
      deviceId: untrack(() => deviceId),
    },
  );
  const installer = new PackInstaller(
    untrack(() => db),
    { publicKeyPem: CONTENT_PUBLIC_KEY },
  );

  /**
   * Null on a guest-only build (no Supabase URL/key at compile time), so every
   * account action is hidden instead of failing at runtime (D-073, D-075).
   */
  const runtime = untrack(() =>
    createSyncRuntime({
      db,
      deviceId,
      config: appConfig(),
      examDeadline: examDeadlineFrom(initialSettings.examDate),
      native: Capacitor.isNativePlatform(),
    }),
  );

  let settings = $state<Settings>(untrack(() => initialSettings));
  let path = $state(currentPath());
  let online = $state(true);
  let saveError = $state(false);
  let contentState = $state<'preparing' | 'ready' | 'failed'>('preparing');
  /** Bumped after a successful install so mounted routes re-read the bank. */
  let contentVersion = $state(0);
  let account = $state<AuthState>({ status: 'guest', userId: null, email: null });
  let accountBusy = $state(false);
  let accountProblem = $state<'mismatch' | 'failed' | null>(null);
  let dataBusy = $state(false);
  let dataProblem = $state<DataProblem | null>(null);
  /** The account whose log has already been uploaded and pulled this session. */
  let handledUser: string | null = null;

  const route = $derived(matchPath(path));
  const titleKey = $derived(titleKeyFor(route));
  const examDeadline = $derived(examDeadlineFrom(settings.examDate));

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

    const stopAuth =
      runtime === null
        ? null
        : runtime.auth.subscribe((state) => {
            account = state;
            if (state.status === 'signed-in' && state.userId !== null) {
              if (handledUser !== state.userId) {
                handledUser = state.userId;
                void syncAfterSignIn(state.userId);
              }
            } else {
              handledUser = null;
            }
          });

    if (runtime !== null) {
      void runtime.auth.load(globalThis.location.href).finally(() => {
        runtime.scheduler.start();
      });
    }

    void installContent();

    return () => {
      stopRouter();
      runtime?.scheduler.stop();
      stopAuth?.();
      globalThis.removeEventListener('online', syncOnline);
      globalThis.removeEventListener('offline', syncOnline);
    };
  });

  /**
   * First sync after sign-in (F7, D-074): upload whatever the guest recorded,
   * then download the account's log. Derived state is rebuilt once by the pull;
   * a failure leaves the scheduler to retry with its own backoff.
   */
  async function syncAfterSignIn(userId: string): Promise<void> {
    if (runtime === null) return;

    accountBusy = true;
    accountProblem = null;
    console.info(`signed in as ${userId}`);

    try {
      await runtime.sync.uploadAll({ allowEmpty: true });
    } catch (error) {
      console.warn('could not upload local history', error);
    }

    try {
      const summary = await runtime.history.pull();
      if (summary.inserted > 0) contentVersion += 1;
    } catch (error) {
      if (!(error instanceof HistoryError) || error.code !== 'unauthenticated') {
        console.warn('could not download history', error);
      }
    } finally {
      accountBusy = false;
      void runtime.scheduler.runNow('manual');
    }
  }

  async function signIn(): Promise<void> {
    if (runtime === null) return;

    accountBusy = true;
    accountProblem = null;
    try {
      await runtime.auth.signIn();
      // `syncAfterSignIn` owns `accountBusy` from here.
    } catch (error) {
      accountBusy = false;
      accountProblem = error instanceof AccountMismatchError ? 'mismatch' : 'failed';
      console.warn('sign-in failed', error);
    }
  }

  async function signOut(): Promise<void> {
    if (runtime === null) return;

    accountBusy = true;
    try {
      await runtime.auth.signOut();
      accountProblem = null;
    } finally {
      accountBusy = false;
    }
  }

  /**
   * F12: delete the account on the server, then erase this phone (D-086). Sync
   * is paused first so no batch races the deletion; on failure it resumes and
   * nothing local has changed. On success the app restarts from a clean
   * database, which also creates a fresh device id and default settings.
   */
  async function deleteAccount(): Promise<void> {
    if (runtime === null) return;

    dataBusy = true;
    dataProblem = null;
    runtime.scheduler.stop();
    try {
      await runtime.account.deleteAccount();
      globalThis.location.reload();
    } catch (error) {
      console.warn('account deletion did not finish', error);
      dataProblem =
        error instanceof AccountDeletionError && error.code !== 'not-signed-in' ? error.code : 'failed';
      if (dataProblem !== 'local-wipe-failed') runtime.scheduler.start();
      dataBusy = false;
    }
  }

  /**
   * Erases this phone only (D-086): the remedy for a phone linked to another
   * account (D-075) and the fallback when a deletion could not wipe locally.
   * A signed-in student is signed out; their server account is kept.
   */
  async function eraseDevice(): Promise<void> {
    dataBusy = true;
    dataProblem = null;
    runtime?.scheduler.stop();
    try {
      await wipeLocalData(db);
      await runtime?.auth.signOut();
      globalThis.location.reload();
    } catch (error) {
      console.error('could not erase this phone', error);
      dataProblem = 'erase-failed';
      runtime?.scheduler.start();
      dataBusy = false;
    }
  }

  /**
   * Installs the packs shipped in the APK (D-059). It runs after first paint
   * and never blocks the UI; a failure leaves the retry banner and whatever
   * version was already on the phone.
   */
  async function installContent(): Promise<void> {
    contentState = 'preparing';
    try {
      const result = await installer.install();
      console.info(
        `content ready: ${result.installed.length} installed, ${result.skipped.length} skipped, ` +
          `${result.totalQuestions} question(s)`,
      );
      contentState = 'ready';
      contentVersion += 1;
    } catch (error) {
      console.error('could not install content', error);
      contentState = 'failed';
    }
  }

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
    {#if contentState === 'preparing'}
      <div class="banner banner--info" role="status">{translate(settings.language, 'content.preparing')}</div>
    {:else if contentState === 'failed'}
      <div class="banner banner--danger" role="alert">
        <span>{translate(settings.language, 'content.failed')}</span>
        <button class="btn btn--ghost" type="button" onclick={() => void installContent()}>
          {translate(settings.language, 'common.retry')}
        </button>
      </div>
    {/if}
    {#if saveError}
      <div class="banner banner--danger" role="alert">
        {translate(settings.language, 'settings.saveFailed')}
      </div>
    {/if}

    {#if route.name === 'home'}
      {#key contentVersion}
        <HomeRoute progress={progressService} dailyGoal={settings.dailyGoal} />
      {/key}
    {:else if route.name === 'practice'}
      {#key `practice:${route.subtopic ?? ''}:${contentVersion}`}
        <PracticeRoute
          subtopic={route.subtopic}
          practice={practiceService}
          progress={progressService}
          {examDeadline}
        />
      {/key}
    {:else if route.name === 'mock'}
      <Placeholder titleKey="mock.title" />
    {:else if route.name === 'progress'}
      <Placeholder titleKey="progress.title" />
    {:else if route.name === 'settings'}
      <SettingsScreen
        {settings}
        onchange={(patch) => void save(patch)}
        {account}
        {accountBusy}
        {accountProblem}
        canSignIn={runtime !== null}
        onSignIn={() => void signIn()}
        onSignOut={() => void signOut()}
        {dataBusy}
        {dataProblem}
        onDeleteAccount={() => void deleteAccount()}
        onEraseDevice={() => void eraseDevice()}
      />
    {:else}
      <Placeholder titleKey="notFound.title" noteKey="notFound.body" />
    {/if}
  </main>

  <NavBar current={route.name} />
</div>
