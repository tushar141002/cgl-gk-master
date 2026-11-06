<script lang="ts">
  import type { MessageKey } from '../i18n/messages';
  import { useI18n } from '../i18n/context';

  /** A route that exists but whose screen ships in a later step. */
  let {
    titleKey,
    noteKey = 'common.comingSoon',
    showBack = true,
  }: { titleKey: MessageKey; noteKey?: MessageKey; showBack?: boolean } = $props();

  const { t } = useI18n();
</script>

<section class="empty">
  <h1 class="empty__title">{t(titleKey)}</h1>
  <p>{t(noteKey)}</p>
  {#if showBack}
    <a class="btn" href="#/home">{t('common.backHome')}</a>
  {/if}
</section>
