<script lang="ts">
  import type { MockQuestion, OptionIndex } from '../../../shared/contract';
  import { useI18n } from '../i18n/context';
  import { formatClock } from '../mockFormat';

  /**
   * One live-mock question at a time with a server-clock countdown (F8).
   *
   * Nothing is graded or revealed here: a choice can be changed or cleared
   * until submit, as in the real exam. The route owns time and storage.
   */
  let {
    question,
    index,
    total,
    chosen,
    answeredCount,
    remainingMs,
    phase,
    offlineUntil,
    onchoose,
    onmove,
    onsubmit,
    onconfirm,
    oncancel,
  }: {
    question: MockQuestion;
    index: number;
    total: number;
    chosen: OptionIndex | null;
    answeredCount: number;
    remainingMs: number;
    phase: 'answering' | 'confirm' | 'submitting' | 'timeup' | 'offline';
    /** Shown with the offline banner: the last moment a submit is accepted. */
    offlineUntil: string;
    onchoose: (chosen: OptionIndex | null) => void;
    onmove: (index: number) => void;
    onsubmit: () => void;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  const { t, language } = useI18n();

  const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
  const text = $derived(language === 'hi' && question.hi !== null ? question.hi : question.en);
  const locked = $derived(phase === 'submitting' || phase === 'timeup');
  const low = $derived(remainingMs <= 60_000);
</script>

<section class="stack">
  <div class="cluster" style="justify-content: space-between">
    <span class="card__meta">{t('mock.questionOf', { n: index + 1, total })}</span>
    <span class="chip" class:chip--accent={low} role="timer" aria-label={t('mock.timeLeft')}>
      {t('mock.timeLeft')}
      {formatClock(remainingMs)}
    </span>
  </div>

  <h1>{text.q}</h1>

  <div class="stack" role="group" aria-label={t('practice.yourAnswer')}>
    {#each text.options as option, i (i)}
      <button
        class="option"
        class:option--selected={chosen === i}
        type="button"
        disabled={locked}
        aria-pressed={chosen === i}
        onclick={() => onchoose(chosen === i ? null : (i as OptionIndex))}
      >
        <span class="option__key">{OPTION_KEYS[i]}</span>
        <span class="option__text">{option}</span>
      </button>
    {/each}
  </div>

  {#if chosen !== null && !locked}
    <button class="btn btn--ghost" type="button" onclick={() => onchoose(null)}>{t('mock.clear')}</button>
  {/if}

  <div class="cluster" style="justify-content: space-between">
    <button
      class="btn btn--ghost"
      type="button"
      disabled={locked || index === 0}
      onclick={() => onmove(index - 1)}
    >
      {t('mock.prev')}
    </button>
    <span class="card__meta">{t('mock.answered', { done: answeredCount, total })}</span>
    <button
      class="btn btn--ghost"
      type="button"
      disabled={locked || index === total - 1}
      onclick={() => onmove(index + 1)}
    >
      {t('mock.next')}
    </button>
  </div>

  {#if phase === 'confirm'}
    <div class="card stack" role="alertdialog" aria-label={t('mock.submit')}>
      <p>{t('mock.submitConfirm', { count: total - answeredCount })}</p>
      <div class="cluster">
        <button class="btn btn--primary" type="button" onclick={onconfirm}>{t('mock.submitYes')}</button>
        <button class="btn btn--ghost" type="button" onclick={oncancel}>{t('mock.keepGoing')}</button>
      </div>
    </div>
  {:else if phase === 'submitting'}
    <div class="banner banner--info" role="status">{t('mock.submitting')}</div>
  {:else if phase === 'timeup'}
    <div class="banner banner--info" role="status">{t('mock.timeUp')}</div>
  {:else}
    {#if phase === 'offline'}
      <div class="banner banner--danger" role="alert">{t('mock.submitOffline', { when: offlineUntil })}</div>
    {/if}
    <button class="btn btn--primary btn--block" type="button" onclick={onsubmit}>{t('mock.submit')}</button>
  {/if}
</section>
