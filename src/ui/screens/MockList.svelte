<script lang="ts">
  import type { MockSummary } from '../../../shared/contract';
  import type { MessageKey } from '../i18n/messages';
  import { useI18n } from '../i18n/context';
  import { formatMarks, formatWhen, mockPhase, type MockPhase } from '../mockFormat';

  /** The weekend live mocks and the student's own status in each (F8, D-029). */
  let {
    state,
    mocks,
    now,
    errorKey,
    onretry,
  }: {
    state: 'unconfigured' | 'guest' | 'loading' | 'offline' | 'error' | 'ready';
    mocks: readonly MockSummary[];
    /** Server time, so "open" and "closed" match the server's view. */
    now: number;
    errorKey: MessageKey | null;
    onretry: () => void;
  } = $props();

  const { t, language } = useI18n();

  const chip: Record<MockPhase, { key: MessageKey; accent: boolean }> = {
    soon: { key: 'mock.statusSoon', accent: false },
    open: { key: 'mock.statusOpen', accent: true },
    active: { key: 'mock.statusActive', accent: true },
    done: { key: 'mock.statusDone', accent: false },
    expired: { key: 'mock.statusClosed', accent: false },
    closed: { key: 'mock.statusClosed', accent: false },
  };

  function action(phase: MockPhase): MessageKey | null {
    switch (phase) {
      case 'open':
        return 'mock.start';
      case 'active':
        return 'mock.resume';
      case 'done':
        return 'mock.viewResult';
      default:
        return null;
    }
  }

  function when(mock: MockSummary, phase: MockPhase): string {
    if (phase === 'soon') return t('mock.opensOn', { when: formatWhen(mock.opensAt, language) });
    if (now < mock.closesAt) return t('mock.closesOn', { when: formatWhen(mock.closesAt, language) });
    return t('mock.closedOn', { when: formatWhen(mock.closesAt, language) });
  }
</script>

<section class="stack">
  <div>
    <h1>{t('mock.listTitle')}</h1>
    <p class="card__meta">{t('mock.listHint')}</p>
  </div>

  {#if state === 'unconfigured'}
    <p class="card__meta">{t('mock.unconfigured')}</p>
  {:else if state === 'guest'}
    <div class="card stack">
      <p>{t('mock.signIn')}</p>
      <a class="btn btn--primary" href="#/settings">{t('mock.goToSettings')}</a>
    </div>
  {:else if state === 'loading'}
    <div class="banner banner--info" role="status">{t('mock.loading')}</div>
  {:else if state === 'offline'}
    <div class="banner banner--info" role="status">
      <span>{t('mock.offline')}</span>
      <button class="btn btn--ghost" type="button" onclick={onretry}>{t('common.retry')}</button>
    </div>
  {:else if state === 'error'}
    <div class="banner banner--danger" role="alert">
      <span>{t(errorKey ?? 'mock.error.failed')}</span>
      <button class="btn btn--ghost" type="button" onclick={onretry}>{t('common.retry')}</button>
    </div>
  {:else if mocks.length === 0}
    <p class="card__meta">{t('mock.none')}</p>
  {:else}
    {#each mocks as mock (mock.id)}
      {@const phase = mockPhase(mock, now)}
      {@const next = action(phase)}
      <div class="card stack">
        <div class="cluster" style="justify-content: space-between">
          <span class="card__title" lang={language}>{language === 'hi' ? mock.titleHi : mock.titleEn}</span>
          <span class="chip" class:chip--accent={chip[phase].accent}>{t(chip[phase].key)}</span>
        </div>
        <p class="card__meta">
          {t('mock.meta', {
            count: mock.questionCount,
            minutes: Math.round(mock.durationSec / 60),
            correct: formatMarks(mock.markCorrect),
            wrong: formatMarks(mock.markWrong),
          })}
        </p>
        <p class="card__meta">{when(mock, phase)}</p>
        {#if phase === 'done' && mock.session?.score !== null && mock.session?.score !== undefined}
          <p>{t('mock.score')}: <strong>{formatMarks(mock.session.score)}</strong></p>
        {/if}
        {#if next !== null}
          <a
            class="btn"
            class:btn--primary={phase !== 'done'}
            class:btn--ghost={phase === 'done'}
            href={`#/mock/${encodeURIComponent(mock.id)}`}
          >
            {t(next)}
          </a>
        {/if}
      </div>
    {/each}
  {/if}
</section>
