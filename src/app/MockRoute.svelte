<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { LeaderboardRow, MockSummary, OptionIndex } from '../../shared/contract';
  import type { MockSessionRow } from '../data/database';
  import { MOCK_SUBMIT_GRACE_MS, MockError, type MockService } from '../services/MockService';
  import type { MessageKey } from '../ui/i18n/messages';
  import { useI18n } from '../ui/i18n/context';
  import { formatMarks, formatWhen, mockPhase } from '../ui/mockFormat';
  import MockList from '../ui/screens/MockList.svelte';
  import MockResult from '../ui/screens/MockResult.svelte';
  import MockTest from '../ui/screens/MockTest.svelte';

  /**
   * `#/mock` lists the live mocks; `#/mock/:id` runs one (F8, D-029, D-090).
   *
   * The route owns the timer, storage calls and error mapping; the screens only
   * paint props. A started mock resumes from the phone, so a dropped connection
   * or a closed app costs nothing but the time that passed meanwhile.
   */
  let {
    id,
    mocks,
    signedIn,
    online,
  }: {
    id: string | null;
    mocks: MockService | null;
    signedIn: boolean;
    online: boolean;
  } = $props();

  const { t, language } = useI18n();

  interface ResultView {
    score: number;
    maxScore: number | null;
    correct: number;
    wrong: number;
    skipped: number;
    timeMs: number | null;
    closesAt: number | null;
  }

  // List
  let listState = $state<'unconfigured' | 'guest' | 'loading' | 'offline' | 'error' | 'ready'>('loading');
  let list = $state<readonly MockSummary[]>([]);
  let clockOffset = $state(0);
  let tick = $state(Date.now());

  // One mock
  let view = $state<'loading' | 'intro' | 'test' | 'result' | 'error'>('loading');
  let errorKey = $state<MessageKey | null>(null);
  let summary = $state<MockSummary | null>(null);
  let session = $state<MockSessionRow | null>(null);
  let phase = $state<'answering' | 'confirm' | 'submitting' | 'timeup' | 'offline'>('answering');
  let starting = $state(false);
  let result = $state<ResultView | null>(null);
  let boardState = $state<'loading' | 'ready' | 'failed'>('loading');
  let top = $state<readonly LeaderboardRow[]>([]);
  let me = $state<LeaderboardRow | null>(null);
  let total = $state(0);

  let shownAt = performance.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const serverNow = $derived(tick + clockOffset);
  const remaining = $derived(
    session === null ? 0 : Math.max(0, session.deadlineAt - (tick + session.clockOffsetMs)),
  );
  const question = $derived(session === null ? null : (session.questions[session.current] ?? null));
  const answeredCount = $derived(
    session === null ? 0 : Object.values(session.answers).filter((answer) => answer.chosen !== null).length,
  );

  onMount(() => {
    timer = setInterval(() => {
      tick = Date.now();
      if (view === 'test' && remaining === 0 && (phase === 'answering' || phase === 'confirm')) {
        phase = 'timeup';
        void submit();
      }
    }, 500);

    if (mocks === null) listState = 'unconfigured';
    else if (!signedIn) listState = 'guest';
    else if (id === null) void loadList();
    else void openMock(id);
  });

  onDestroy(() => {
    if (timer !== null) clearInterval(timer);
  });

  function keyFor(error: unknown): MessageKey {
    const code = error instanceof MockError ? error.code : 'failed';
    return `mock.error.${code}` as MessageKey;
  }

  async function loadList(): Promise<void> {
    if (mocks === null) return;
    if (!online) {
      listState = 'offline';
      return;
    }
    listState = 'loading';
    try {
      const loaded = await mocks.list();
      list = loaded.mocks;
      clockOffset = loaded.clockOffsetMs;
      listState = 'ready';
      void mocks.purgeExpired();
    } catch (error) {
      errorKey = keyFor(error);
      listState = error instanceof MockError && error.code === 'offline' ? 'offline' : 'error';
    }
  }

  async function openMock(mockId: string): Promise<void> {
    if (mocks === null) return;
    view = 'loading';

    const local = await mocks.local(mockId);
    if (local !== null) {
      showTest(local);
      return;
    }

    try {
      const loaded = await mocks.list();
      clockOffset = loaded.clockOffsetMs;
      tick = Date.now();
      const found = loaded.mocks.find((mock) => mock.id === mockId) ?? null;
      summary = found;
      if (found === null) return fail('mock.error.not_found');

      switch (mockPhase(found, tick + clockOffset)) {
        case 'open':
          view = 'intro';
          return;
        case 'active':
          await start();
          return;
        case 'done': {
          const s = found.session!;
          showResult({
            score: s.score ?? 0,
            maxScore: found.questionCount * found.markCorrect,
            correct: s.correct ?? 0,
            wrong: s.wrong ?? 0,
            skipped: s.skipped ?? 0,
            timeMs: null,
            closesAt: found.closesAt,
          });
          return;
        }
        case 'expired':
          return fail('mock.error.expired');
        case 'soon':
          return fail('mock.error.not_open');
        case 'closed':
          return fail('mock.error.closed');
      }
    } catch (error) {
      fail(keyFor(error));
    }
  }

  function fail(key: MessageKey): void {
    errorKey = key;
    view = 'error';
  }

  async function start(): Promise<void> {
    if (mocks === null || id === null) return;
    starting = true;
    try {
      showTest(await mocks.start(id));
    } catch (error) {
      fail(keyFor(error));
    } finally {
      starting = false;
    }
  }

  function showTest(row: MockSessionRow): void {
    session = row;
    phase = 'answering';
    shownAt = performance.now();
    tick = Date.now();
    view = 'test';
  }

  function spent(): number {
    const now = performance.now();
    const ms = now - shownAt;
    shownAt = now;
    return ms;
  }

  async function choose(chosen: OptionIndex | null): Promise<void> {
    if (mocks === null || session === null || question === null) return;
    session = await mocks.record(session.sessionId, question.qid, chosen, spent(), session.current);
  }

  async function move(next: number): Promise<void> {
    if (mocks === null || session === null || question === null) return;
    session = await mocks.moveTo(session.sessionId, next, question.qid, spent());
  }

  async function submit(): Promise<void> {
    if (mocks === null || session === null) return;
    if (phase !== 'timeup') phase = 'submitting';
    if (question !== null) {
      session = await mocks.moveTo(session.sessionId, session.current, question.qid, spent());
    }
    try {
      const graded = await mocks.submit(session.sessionId);
      showResult({ ...graded, closesAt: summary?.closesAt ?? null });
    } catch (error) {
      if (error instanceof MockError && error.code === 'offline') {
        phase = 'offline';
        return;
      }
      fail(keyFor(error));
    }
  }

  function showResult(next: ResultView): void {
    result = next;
    view = 'result';
    void loadBoard();
  }

  async function loadBoard(): Promise<void> {
    if (mocks === null || id === null) return;
    boardState = 'loading';
    try {
      const board = await mocks.leaderboard(id);
      top = board.top;
      me = board.me;
      total = board.total;
      boardState = 'ready';
    } catch {
      boardState = 'failed';
    }
  }

  const title = $derived(summary === null ? '' : language === 'hi' ? summary.titleHi : summary.titleEn);
  const submitUntil = $derived(
    session === null ? '' : formatWhen(session.deadlineAt + MOCK_SUBMIT_GRACE_MS, language),
  );
  const answersAfter = $derived(
    result?.closesAt !== null && result?.closesAt !== undefined && serverNow < result.closesAt
      ? formatWhen(result.closesAt, language)
      : null,
  );
</script>

{#if id === null || listState === 'unconfigured' || listState === 'guest'}
  <MockList state={listState} mocks={list} now={serverNow} {errorKey} onretry={() => void loadList()} />
{:else if view === 'loading'}
  <div class="banner banner--info" role="status">{t('mock.loading')}</div>
{:else if view === 'error'}
  <section class="stack">
    <a class="chip chip--action" href="#/mock">← {t('mock.back')}</a>
    <div class="banner banner--danger" role="alert">{t(errorKey ?? 'mock.error.failed')}</div>
  </section>
{:else if view === 'intro' && summary !== null}
  <section class="stack">
    <a class="chip chip--action" href="#/mock">← {t('mock.back')}</a>
    <h1 lang={language}>{title}</h1>
    <p class="card__meta">
      {t('mock.meta', {
        count: summary.questionCount,
        minutes: Math.round(summary.durationSec / 60),
        correct: formatMarks(summary.markCorrect),
        wrong: formatMarks(summary.markWrong),
      })}
    </p>
    <p>{t('mock.startNote')}</p>
    {#if !online}
      <div class="banner banner--info" role="status">{t('mock.offline')}</div>
    {/if}
    <button
      class="btn btn--primary btn--block"
      type="button"
      disabled={starting || !online}
      onclick={() => void start()}
    >
      {starting ? t('account.busy') : t('mock.start')}
    </button>
  </section>
{:else if view === 'test' && session !== null && question !== null}
  <MockTest
    {question}
    index={session.current}
    total={session.questions.length}
    chosen={session.answers[question.qid]?.chosen ?? null}
    {answeredCount}
    remainingMs={remaining}
    {phase}
    offlineUntil={submitUntil}
    onchoose={(chosen) => void choose(chosen)}
    onmove={(next) => void move(next)}
    onsubmit={() => (phase = 'confirm')}
    onconfirm={() => void submit()}
    oncancel={() => (phase = 'answering')}
  />
{:else if view === 'result' && result !== null}
  <MockResult
    score={result.score}
    maxScore={result.maxScore}
    correct={result.correct}
    wrong={result.wrong}
    skipped={result.skipped}
    timeMs={result.timeMs}
    {top}
    {me}
    {total}
    leaderboardState={boardState}
    {answersAfter}
    onretry={() => void loadBoard()}
  />
{/if}
