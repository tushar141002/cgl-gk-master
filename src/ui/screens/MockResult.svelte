<script lang="ts">
  import type { LeaderboardRow } from '../../../shared/contract';
  import { useI18n } from '../i18n/context';
  import { formatClock, formatMarks } from '../mockFormat';

  /** A graded live mock and where it ranks (F8, D-012, D-029). */
  let {
    score,
    maxScore,
    correct,
    wrong,
    skipped,
    timeMs,
    top,
    me,
    total,
    leaderboardState,
    answersAfter,
    onretry,
  }: {
    score: number;
    maxScore: number | null;
    correct: number;
    wrong: number;
    skipped: number;
    timeMs: number | null;
    top: readonly LeaderboardRow[];
    me: LeaderboardRow | null;
    total: number;
    leaderboardState: 'loading' | 'ready' | 'failed';
    /** When the answers unlock, already formatted; null once they are open. */
    answersAfter: string | null;
    onretry: () => void;
  } = $props();

  const { t } = useI18n();
</script>

<section class="stack">
  <a class="chip chip--action" href="#/mock">← {t('mock.back')}</a>
  <h1>{t('mock.resultTitle')}</h1>

  <div class="card stack">
    <div class="stat">
      <span class="stat__label">{t('mock.score')}</span>
      <span class="stat__value">
        {formatMarks(score)}{#if maxScore !== null}&nbsp;/ {formatMarks(maxScore)}{/if}
      </span>
    </div>
    <div class="cluster" style="gap: var(--space-6)">
      <span>{t('mock.correct')}: <strong>{correct}</strong></span>
      <span>{t('mock.wrong')}: <strong>{wrong}</strong></span>
      <span>{t('mock.skipped')}: <strong>{skipped}</strong></span>
      {#if timeMs !== null}
        <span>{t('mock.time')}: <strong>{formatClock(timeMs)}</strong></span>
      {/if}
    </div>
  </div>

  <div class="card stack">
    <span class="field__label">{t('mock.leaderboard')}</span>
    {#if leaderboardState === 'loading'}
      <p class="card__meta">{t('mock.loading')}</p>
    {:else if leaderboardState === 'failed'}
      <div class="banner banner--danger" role="alert">
        <span>{t('mock.error.failed')}</span>
        <button class="btn btn--ghost" type="button" onclick={onretry}>{t('common.retry')}</button>
      </div>
    {:else if top.length === 0}
      <p class="card__meta">{t('mock.noRanks')}</p>
    {:else}
      {#if me !== null}
        <p>{t('mock.rankOf', { rank: me.rank, total })}</p>
      {:else}
        <p class="card__meta">{t('mock.unranked')}</p>
      {/if}
      <ol
        class="stack stack--tight"
        style="list-style: none; padding: 0; margin: 0"
        aria-label={t('mock.leaderboard')}
      >
        {#each top as row, i (i)}
          <li
            class="cluster"
            style="justify-content: space-between"
            aria-current={row.isMe ? 'true' : undefined}
          >
            <span>
              {row.rank}.&nbsp;{#if row.isMe}<strong>{t('mock.you')}</strong>{:else}{row.name}{/if}
            </span>
            <span class="card__meta">{formatMarks(row.score)} · {formatClock(row.timeMs)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  {#if answersAfter !== null}
    <p class="card__meta">{t('mock.answersLater', { when: answersAfter })}</p>
  {/if}
</section>
