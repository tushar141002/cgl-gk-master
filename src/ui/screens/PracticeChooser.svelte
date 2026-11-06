<script lang="ts">
  import type { TopicRow } from '../viewModels';
  import { useI18n } from '../i18n/context';
  import { humanizeSubtopic, sectionMessageKey } from '../labels';

  /** Pick a sub-topic before answering; `#/practice` has no session yet (D-062). */
  let {
    topics,
    dueCount,
    loading,
    error,
    onretry,
  }: {
    topics: readonly TopicRow[];
    dueCount: number;
    loading: boolean;
    error: boolean;
    onretry: () => void;
  } = $props();

  const { t } = useI18n();

  const sectionLabel = (section: TopicRow['section']): string => t(sectionMessageKey(section));
</script>

<section class="stack">
  <div>
    <h1>{t('practice.chooseTitle')}</h1>
    <p class="card__meta">{t('practice.chooseHint')}</p>
  </div>

  {#if loading}
    <div class="card stack" aria-busy="true">
      <div class="skeleton" style="width: 60%"></div>
      <div class="skeleton" style="width: 40%"></div>
      <div class="skeleton" style="width: 50%"></div>
    </div>
    <p class="card__meta">{t('practice.preparing')}</p>
  {:else if error}
    <div class="banner banner--danger" role="alert">{t('practice.loadFailed')}</div>
    <button class="btn btn--block" type="button" onclick={onretry}>{t('practice.retry')}</button>
  {:else if topics.length === 0}
    <div class="empty">
      <h2 class="empty__title">{t('practice.noTopics')}</h2>
      <p>{t('practice.noTopicsBody')}</p>
    </div>
  {:else}
    {#if dueCount > 0}
      <span class="chip chip--accent">{t('practice.dueCount', { count: dueCount })}</span>
    {/if}

    <ul class="list">
      {#each topics as topic (topic.subtopic)}
        <li>
          <a class="list__row" href={`#/practice/${encodeURIComponent(topic.subtopic)}`}>
            <span class="list__label">
              <span class="card__meta">{sectionLabel(topic.section)}</span>
              <br />
              {humanizeSubtopic(topic.subtopic, topic.section)}
            </span>
            <span class="list__meta">
              {t(topic.count === 1 ? 'practice.questionCountOne' : 'practice.questionCount', {
                count: topic.count,
              })}
            </span>
            <span class="list__meta">{t('practice.rating', { elo: topic.elo })}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
