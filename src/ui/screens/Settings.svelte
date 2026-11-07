<script lang="ts">
  import type { Settings } from '../../../shared/contract';
  import type { AuthState } from '../../services/AuthService';
  import { useI18n } from '../i18n/context';

  /** Preferences plus the account card (F7, D-073, D-075). */
  let {
    settings,
    onchange,
    account,
    accountBusy,
    accountProblem,
    canSignIn,
    onSignIn,
    onSignOut,
  }: {
    settings: Settings;
    onchange: (patch: Partial<Settings>) => void;
    account: AuthState;
    accountBusy: boolean;
    accountProblem: 'mismatch' | 'failed' | null;
    canSignIn: boolean;
    onSignIn: () => void;
    onSignOut: () => void;
  } = $props();

  const { t } = useI18n();
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

  <p class="card__meta">{t('settings.note')}</p>
</section>
