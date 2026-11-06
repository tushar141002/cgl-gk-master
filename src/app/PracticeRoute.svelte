<script lang="ts">
  import { onMount } from 'svelte';
  import type { OptionIndex } from '../../shared/contract';
  import type { PracticeFeedback, PracticeQuestion, PracticeService } from '../services/PracticeService';
  import type { ProgressService } from '../services/ProgressService';
  import type { FeedbackView, TopicRow } from '../ui/viewModels';
  import { useI18n } from '../ui/i18n/context';
  import { humanizeSubtopic } from '../ui/labels';
  import Practice from '../ui/screens/Practice.svelte';
  import PracticeChooser from '../ui/screens/PracticeChooser.svelte';

  /**
   * Runs either the chooser (`#/practice`) or one sub-topic session (D-062).
   *
   * The route owns timing and async state; the screen only paints props and
   * calls back (flow.md import matrix).
   */
  let {
    subtopic,
    practice,
    progress,
    examDeadline,
  }: {
    subtopic: string | null;
    practice: PracticeService;
    progress: ProgressService;
    examDeadline: number | undefined;
  } = $props();

  const { t } = useI18n();

  let topics = $state<readonly TopicRow[]>([]);
  let dueCount = $state(0);
  let loading = $state(true);
  let loadError = $state(false);

  let question = $state<PracticeQuestion | null>(null);
  let exhausted = $state(false);
  let feedback = $state<PracticeFeedback | null>(null);
  let busy = $state(false);
  let saveError = $state(false);
  let shownAt = 0;
  let pending: { readonly chosen: OptionIndex | null; readonly ms: number } | null = null;

  onMount(() => {
    if (subtopic === null) void loadChooser();
    else void loadQuestion();
  });

  function now(): number {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  async function loadChooser(): Promise<void> {
    loading = true;
    loadError = false;
    try {
      const [rows, overview] = await Promise.all([progress.topics(), progress.overview()]);
      topics = rows;
      dueCount = overview.dueCount;
    } catch (error) {
      console.error('could not load practice topics', error);
      loadError = true;
    } finally {
      loading = false;
    }
  }

  async function loadQuestion(): Promise<void> {
    if (subtopic === null) return;
    loading = true;
    loadError = false;
    feedback = null;
    saveError = false;
    pending = null;
    question = null;
    exhausted = false;
    try {
      const next = await practice.next(subtopic);
      question = next;
      exhausted = next === null;
      shownAt = now();
    } catch (error) {
      console.error('could not pick the next question', error);
      loadError = true;
    } finally {
      loading = false;
    }
  }

  async function submit(chosen: OptionIndex | null, ms: number): Promise<void> {
    if (question === null || busy) return;
    busy = true;
    saveError = false;
    try {
      feedback = await practice.answer(question.question, chosen, ms, examDeadline);
      pending = null;
    } catch (error) {
      console.error('could not save the answer', error);
      pending = { chosen, ms };
      saveError = true;
    } finally {
      busy = false;
    }
  }

  function answer(chosen: OptionIndex): void {
    if (question === null || feedback !== null) return;
    void submit(chosen, Math.max(0, Math.round(now() - shownAt)));
  }

  function skip(): void {
    if (question === null || feedback !== null) return;
    void submit(null, Math.max(0, Math.round(now() - shownAt)));
  }

  function retry(): void {
    if (pending === null) {
      void loadQuestion();
      return;
    }
    void submit(pending.chosen, pending.ms);
  }

  const subtitle = $derived(subtopic === null ? '' : humanizeSubtopic(subtopic, question?.question.section));
  const feedbackView = $derived<FeedbackView | null>(
    feedback === null
      ? null
      : {
          chosen: feedback.attempt.chosen,
          correct: feedback.correct,
          skipped: feedback.skipped,
        },
  );
</script>

{#if subtopic === null}
  <PracticeChooser {topics} {dueCount} {loading} error={loadError} onretry={() => void loadChooser()} />
{:else if loading}
  <section class="stack" aria-busy="true">
    <p class="card__meta">{subtitle}</p>
    <div class="skeleton" style="height: 4rem"></div>
    <div class="skeleton" style="height: 3rem"></div>
    <div class="skeleton" style="height: 3rem"></div>
    <div class="skeleton" style="height: 3rem"></div>
    <p class="card__meta">{t('practice.preparing')}</p>
  </section>
{:else if loadError}
  <section class="stack">
    <div class="banner banner--danger" role="alert">{t('practice.loadFailed')}</div>
    <button class="btn btn--block" type="button" onclick={() => void loadQuestion()}>
      {t('practice.retry')}
    </button>
    <a class="btn btn--ghost btn--block" href="#/practice">{t('practice.allTopics')}</a>
  </section>
{:else if exhausted || question === null}
  <div class="empty">
    <h1 class="empty__title">{t('practice.empty')}</h1>
    <p>{t('practice.emptyBody')}</p>
    <a class="btn" href="#/practice">{t('practice.allTopics')}</a>
  </div>
{:else}
  {#key question.question.id}
    <Practice
      question={question.question}
      subtopicLabel={subtitle}
      reason={question.reason}
      feedback={feedbackView}
      {busy}
      error={saveError}
      onanswer={answer}
      onskip={skip}
      onnext={() => void loadQuestion()}
      onretry={retry}
    />
  {/key}
{/if}
