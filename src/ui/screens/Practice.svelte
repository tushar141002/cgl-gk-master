<script lang="ts">
  import type { OptionIndex, Question as QuestionRecord } from '../../../shared/contract';
  import type { FeedbackView, PickReasonView } from '../viewModels';
  import { useI18n } from '../i18n/context';

  /**
   * One question and its instant feedback (D-061).
   *
   * The screen never grades: it paints the option the student tapped, then the
   * locked state the caller hands back. Options stay visible after answering so
   * the student can compare the right answer with their own.
   */
  let {
    question,
    subtopicLabel,
    reason,
    feedback,
    busy,
    error,
    onanswer,
    onskip,
    onnext,
    onretry,
  }: {
    question: QuestionRecord;
    subtopicLabel: string;
    reason: PickReasonView;
    feedback: FeedbackView | null;
    busy: boolean;
    error: boolean;
    onanswer: (chosen: OptionIndex) => void;
    onskip: () => void;
    onnext: () => void;
    onretry: () => void;
  } = $props();

  const { t, language } = useI18n();

  const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
  const text = $derived(language === 'hi' && question.hi !== null ? question.hi : question.en);

  let picked = $state<OptionIndex | null>(null);
  const locked = $derived(feedback !== null);

  // The parent clears `feedback` before serving the next question. A skipped
  // question can be served again, so the same component instance must reset
  // its optimistic selection rather than keep the previous tap highlighted.
  $effect(() => {
    if (feedback === null) picked = null;
  });

  function optionClass(index: OptionIndex): string {
    if (feedback === null) {
      return picked === index ? 'option option--selected' : 'option';
    }
    if (index === question.answer) return 'option option--correct';
    if (feedback.chosen === index) return 'option option--wrong';
    return 'option option--dim';
  }

  function verdict(index: OptionIndex): string | null {
    if (feedback === null) return null;
    if (index === question.answer) return t('practice.correct');
    if (feedback.chosen === index) return t('practice.wrong');
    return null;
  }

  function choose(index: OptionIndex): void {
    if (locked || busy) return;
    picked = index;
    onanswer(index);
  }

  const verdictBanner = $derived(
    feedback === null
      ? null
      : feedback.skipped
        ? { class: 'banner banner--info', text: t('practice.skipped') }
        : feedback.correct
          ? { class: 'banner banner--success', text: t('practice.correct') }
          : { class: 'banner banner--danger', text: t('practice.wrong') },
  );
</script>

<section class="stack">
  <div class="cluster" style="justify-content: space-between">
    <a class="chip chip--action" href="#/practice">← {t('practice.allTopics')}</a>
    <span class="chip" class:chip--accent={reason === 'review'}>
      {reason === 'review' ? t('practice.reviewChip') : t('practice.newChip')}
    </span>
  </div>

  <div>
    <p class="card__meta">{subtopicLabel}</p>
    <h1>{text.q}</h1>
  </div>

  <div class="stack" role="group" aria-label={t('practice.yourAnswer')}>
    {#each text.options as option, index (index)}
      <button
        class={optionClass(index as OptionIndex)}
        type="button"
        disabled={locked || busy}
        aria-pressed={picked === index}
        onclick={() => choose(index as OptionIndex)}
      >
        <span class="option__key">{OPTION_KEYS[index]}</span>
        <span class="option__text">{option}</span>
        {#if verdict(index as OptionIndex) !== null}
          <span class="option__verdict">{verdict(index as OptionIndex)}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="banner banner--danger" role="alert">
      <span>{t('practice.saveFailed')}</span>
      <button class="btn btn--ghost" type="button" onclick={onretry}>{t('practice.retry')}</button>
    </div>
  {/if}

  {#if feedback === null}
    <button class="btn btn--block" type="button" disabled={busy} onclick={onskip}>
      {t('practice.skip')}
    </button>
  {:else}
    <div class="stack" aria-live="polite">
      {#if verdictBanner !== null}
        <div class={verdictBanner.class} role="status">{verdictBanner.text}</div>
      {/if}
      <div class="card card--flat">
        <p class="card__title">{t('practice.explanation')}</p>
        <p class="card__body">{text.explanation}</p>
      </div>
      <button class="btn btn--primary btn--block" type="button" onclick={onnext}>
        {t('practice.next')}
      </button>
    </div>
  {/if}
</section>
