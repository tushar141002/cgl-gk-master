<script lang="ts">
  import { useI18n } from '../i18n/context';

  /** Landing screen; real goal and stats arrive with the practice service (Step 6). */
  let { dailyGoal }: { dailyGoal: number } = $props();

  const { t } = useI18n();
</script>

<section class="stack">
  <div>
    <h1>{t('home.title')}</h1>
    <p class="card__meta">{t('home.subtitle')}</p>
  </div>

  <div class="card stack">
    <div class="cluster" style="justify-content: space-between">
      <span class="card__meta">{t('home.goal')}</span>
      <span class="card__meta">{t('home.goalProgress', { done: 0, goal: dailyGoal })}</span>
    </div>
    <div
      class="progress"
      role="progressbar"
      aria-label={t('home.goal')}
      aria-valuemin={0}
      aria-valuemax={dailyGoal}
      aria-valuenow={0}
    >
      <div class="progress__bar" style="--progress: 0%"></div>
    </div>
    <div class="cluster">
      <div class="stat">
        <span class="stat__value">0</span>
        <span class="stat__label">{t('home.streak')}</span>
      </div>
      <div class="stat">
        <span class="stat__value">—</span>
        <span class="stat__label">{t('home.accuracy')}</span>
      </div>
      <div class="stat">
        <span class="stat__value">1200</span>
        <span class="stat__label">{t('home.rating')}</span>
      </div>
    </div>
  </div>

  <a class="btn btn--primary btn--block" href="#/practice">{t('home.start')}</a>
  <a class="btn btn--block" href="#/practice">{t('home.review')}</a>

  <p class="card__meta">{t('home.empty')}</p>
</section>
