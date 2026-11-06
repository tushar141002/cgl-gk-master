<script lang="ts">
  import type { HomeStats } from '../viewModels';
  import { useI18n } from '../i18n/context';

  /** Landing screen: today's goal, streak and a way into practice (F1, F10). */
  let { stats, dailyGoal, loading }: { stats: HomeStats | null; dailyGoal: number; loading: boolean } =
    $props();

  const { t } = useI18n();

  const attempted = $derived(stats?.attemptedToday ?? 0);
  const answered = $derived(Math.min(attempted, dailyGoal));
  const percent = $derived(dailyGoal > 0 ? Math.min(100, (attempted / dailyGoal) * 100) : 0);
  const accuracy = $derived(
    attempted === 0 ? '—' : `${Math.round(((stats?.correctToday ?? 0) / attempted) * 100)}%`,
  );
  const empty = $derived(!loading && stats !== null && stats.questionCount === 0);
</script>

<section class="stack">
  <div>
    <h1>{t('home.title')}</h1>
    <p class="card__meta">{t('home.subtitle')}</p>
  </div>

  <div class="card stack">
    <div class="cluster" style="justify-content: space-between">
      <span class="card__meta">{t('home.goal')}</span>
      <span class="card__meta">{t('home.goalProgress', { done: attempted, goal: dailyGoal })}</span>
    </div>
    <div
      class="progress"
      role="progressbar"
      aria-label={t('home.goal')}
      aria-valuemin={0}
      aria-valuemax={dailyGoal}
      aria-valuenow={answered}
    >
      <div class="progress__bar" style={`--progress: ${percent}%`}></div>
    </div>
    <div class="cluster" style="gap: var(--space-6)">
      <div class="stat">
        <span class="stat__value">{stats?.streak ?? '—'}</span>
        <span class="stat__label">{t('home.streak')}</span>
      </div>
      <div class="stat">
        <span class="stat__value">{accuracy}</span>
        <span class="stat__label">{t('home.accuracy')}</span>
      </div>
      <div class="stat">
        <span class="stat__value">{stats?.averageElo ?? 1200}</span>
        <span class="stat__label">{t('home.rating')}</span>
      </div>
      <div class="stat">
        <span class="stat__value">{stats?.dueCount ?? 0}</span>
        <span class="stat__label">{t('home.due')}</span>
      </div>
    </div>
  </div>

  <a class="btn btn--primary btn--block" href="#/practice">{t('home.start')}</a>

  {#if stats !== null}
    <p class="card__meta">
      {t(stats.questionCount === 1 ? 'practice.questionCountOne' : 'practice.questionCount', {
        count: stats.questionCount,
      })}
    </p>
  {/if}
  {#if empty}
    <p class="card__meta">{t('home.empty')}</p>
  {/if}
</section>
