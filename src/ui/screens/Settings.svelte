<script module lang="ts">
  /** Why the last delete or erase did not finish; mirrors `AccountDeletionCode`. */
  export type DataProblem = 'offline' | 'unauthenticated' | 'failed' | 'local-wipe-failed' | 'erase-failed';
</script>

<script lang="ts">
  import type { Settings } from '../../../shared/contract';
  import type { AuthState } from '../../services/AuthService';
  import { useI18n } from '../i18n/context';
  import type { MessageKey } from '../i18n/messages';

  /** Preferences, the account card and the data controls (F7, F12, D-073, D-075, D-086). */
  let {
    settings,
    onchange,
    account,
    accountBusy,
    accountProblem,
    canSignIn,
    onSignIn,
    onSignOut,
    dataBusy,
    dataProblem,
    onDeleteAccount,
    onEraseDevice,
  }: {
    settings: Settings;
    onchange: (patch: Partial<Settings>) => void;
    account: AuthState;
    accountBusy: boolean;
    accountProblem: 'mismatch' | 'failed' | null;
    canSignIn: boolean;
    onSignIn: () => void;
    onSignOut: () => void;
    dataBusy: boolean;
    dataProblem: DataProblem | null;
    onDeleteAccount: () => void;
    onEraseDevice: () => void;
  } = $props();

  const { t } = useI18n();

  /** Nothing is deleted on the first tap; the second, explicit button does it. */
  let confirming = $state<'delete' | 'erase' | null>(null);

  const problemKey: Record<DataProblem, MessageKey> = {
    offline: 'data.offline',
    unauthenticated: 'data.unauthenticated',
    failed: 'data.failed',
    'local-wipe-failed': 'data.wipeFailed',
    'erase-failed': 'data.eraseFailed',
  };
</script>

<section class="stack">
  <h1>{t('settings.title')}</h1>

  <div class="card stack">
    <span class="field__label">{t('settings.language')}</span>
    <div class="segmented" role="group" aria-label={t('settings.language')}>
      <button
        class="segmented__option"
        type="button"
        aria-pressed={settings.language === 'en'}
        onclick={() => onchange({ language: 'en' })}
      >
        English
      </button>
      <button
        class="segmented__option"
        type="button"
        lang="hi"
        aria-pressed={settings.language === 'hi'}
        onclick={() => onchange({ language: 'hi' })}
      >
        हिंदी
      </button>
    </div>
  </div>

  <div class="card stack">
    <span class="field__label">{t('settings.theme')}</span>
    <div class="segmented" role="group" aria-label={t('settings.theme')}>
      <button
        class="segmented__option"
        type="button"
        aria-pressed={settings.theme === 'light'}
        onclick={() => onchange({ theme: 'light' })}
      >
        {t('settings.themeLight')}
      </button>
      <button
        class="segmented__option"
        type="button"
        aria-pressed={settings.theme === 'dark'}
        onclick={() => onchange({ theme: 'dark' })}
      >
        {t('settings.themeDark')}
      </button>
    </div>
  </div>

  <div class="card stack">
    <span class="field__label">{t('account.title')}</span>

    {#if !canSignIn}
      <p class="card__meta">{t('account.unconfigured')}</p>
    {:else if account.status === 'signed-in'}
      <p>
        {t('account.signedIn')}{#if account.email !== null}&nbsp;· {account.email}{/if}
      </p>
      <button class="btn btn--ghost" type="button" disabled={accountBusy} onclick={onSignOut}>
        {accountBusy ? t('account.busy') : t('account.signOut')}
      </button>
    {:else}
      <p>{t('account.guest')}</p>
      <p class="card__meta">{t('account.guestNote')}</p>
      <button class="btn btn--primary" type="button" disabled={accountBusy} onclick={onSignIn}>
        {accountBusy ? t('account.busy') : t('account.signIn')}
      </button>
    {/if}

    {#if accountProblem === 'mismatch'}
      <p class="banner banner--danger" role="alert">{t('account.mismatch')}</p>
    {:else if accountProblem === 'failed'}
      <p class="banner banner--danger" role="alert">{t('account.failed')}</p>
    {/if}
  </div>

  <div class="card stack">
    <span class="field__label">{t('data.title')}</span>

    {#if canSignIn && account.status === 'signed-in'}
      <p class="card__meta">{t('data.deleteNote')}</p>
      {#if confirming === 'delete'}
        <p role="alert">{t('data.confirm')}</p>
        <div class="cluster">
          <button class="btn btn--danger" type="button" disabled={dataBusy} onclick={onDeleteAccount}>
            {dataBusy ? t('account.busy') : t('data.confirmDelete')}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            disabled={dataBusy}
            onclick={() => (confirming = null)}
          >
            {t('data.cancel')}
          </button>
        </div>
      {:else}
        <button
          class="btn btn--ghost"
          type="button"
          disabled={dataBusy || accountBusy}
          onclick={() => (confirming = 'delete')}
        >
          {t('data.deleteAccount')}
        </button>
      {/if}
    {/if}

    <p class="card__meta">{t('data.eraseNote')}</p>
    {#if confirming === 'erase'}
      <p role="alert">{t('data.confirm')}</p>
      <div class="cluster">
        <button class="btn btn--danger" type="button" disabled={dataBusy} onclick={onEraseDevice}>
          {dataBusy ? t('account.busy') : t('data.confirmErase')}
        </button>
        <button class="btn btn--ghost" type="button" disabled={dataBusy} onclick={() => (confirming = null)}>
          {t('data.cancel')}
        </button>
      </div>
    {:else}
      <button
        class="btn btn--ghost"
        type="button"
        disabled={dataBusy || accountBusy}
        onclick={() => (confirming = 'erase')}
      >
        {t('data.erase')}
      </button>
    {/if}

    {#if dataProblem !== null}
      <p class="banner banner--danger" role="alert">{t(problemKey[dataProblem])}</p>
    {/if}
  </div>

  <p class="card__meta">{t('settings.note')}</p>
</section>
