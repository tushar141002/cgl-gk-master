<script lang="ts">
  import type { Settings } from '../../../shared/contract';
  import { useI18n } from '../i18n/context';

  /** Only the two preferences the shell owns; the rest of Settings lands later. */
  let {
    settings,
    onchange,
  }: {
    settings: Settings;
    onchange: (patch: Partial<Settings>) => void;
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

  <p class="card__meta">{t('settings.note')}</p>
</section>
