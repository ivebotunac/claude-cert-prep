<script>
  import { router } from '$lib/router.svelte.js'
  import { domains, scenarioById, questionById, meta } from '$lib/content.js'
  import { formatClock, pct, richText } from '$lib/util.js'
  import * as q from '$lib/db/queries.js'

  import Question from '$lib/components/Question.svelte'
  import Meter from '$lib/components/Meter.svelte'
  import DomainBadge from '$lib/components/DomainBadge.svelte'
  import Empty from '$lib/components/Empty.svelte'

  /** @type {any} */
  let attempt = $state(null)
  /** @type {Map<string, any>} */
  let answers = $state(new Map())
  /** @type {any[]} */
  let breakdown = $state([])
  let filter = $state('wrong')
  /** @type {Set<string>} */
  let open = $state(new Set())

  const id = $derived(Number(router.segments[1]))

  $effect(() => {
    if (!Number.isFinite(id)) return
    Promise.all([q.attempt(id), q.attemptAnswers(id), q.attemptDomainBreakdown(id)]).then(
      ([a, ans, bd]) => {
        attempt = a
        answers = ans
        breakdown = bd
      },
    )
  })

  const passed = $derived(attempt ? attempt.scaled >= meta.passingScaled : false)
  const elapsed = $derived(
    attempt ? Math.min(attempt.durationMs, attempt.finishedAt - attempt.startedAt) : 0,
  )

  const items = $derived(
    attempt
      ? /** @type {string[]} */ (attempt.questionIds)
          .map((qid) => ({ q: questionById[qid], a: answers.get(qid) }))
          .filter((x) => x.q)
      : [],
  )
  const shown = $derived(filter === 'wrong' ? items.filter((x) => !x.a?.correct) : items)
  const scenarioNames = $derived(
    attempt
      ? /** @type {string[]} */ (attempt.scenarios).map((s) => scenarioById[s]?.title ?? s).join(', ')
      : '',
  )

  /** @param {string} qid */
  function toggle(qid) {
    const s = new Set(open)
    s.has(qid) ? s.delete(qid) : s.add(qid)
    open = s
  }
</script>

{#if !attempt}
  <Empty title="No such attempt" body="It may have been deleted.">
    <a class="btn" href="#/dashboard">Dashboard</a>
  </Empty>
{:else}
  <div class="card px-5 py-9 text-center">
    <div
      class="font-mono text-[3.9rem] font-semibold leading-none tracking-tight"
      style="color: {passed ? 'var(--color-ok)' : 'var(--color-bad)'}"
      data-testid="scaled-score"
    >
      {attempt.scaled}
    </div>
    <p
      class="mt-2.5 text-[19px] font-semibold {passed
        ? 'text-[var(--color-ok)]'
        : 'text-[var(--color-bad)]'}"
    >
      {passed ? 'Pass' : `Below the ${meta.passingScaled} cut score`}
    </p>
    <p class="mt-3 text-[var(--color-ink-2)]">
      {attempt.correct} of {attempt.total} correct ({pct(attempt.correct, attempt.total)}%)
      in {formatClock(elapsed)}
    </p>
    <p class="mt-2 text-[12.5px] text-[var(--color-ink-3)]">
      Scenarios drawn: {scenarioNames}
    </p>
  </div>

  <h2 class="section mt-6 mb-2.5">Percent correct by domain</h2>
  <div class="card divide-y divide-[var(--color-line-soft)] px-5">
    {#each domains as d (d.id)}
      {@const row = breakdown.find((b) => b.domain === d.id)}
      {@const total = Number(row?.total ?? 0)}
      {@const correct = Number(row?.correct ?? 0)}
      {@const p = pct(correct, total)}
      <div class="flex items-center gap-3.5 py-3">
        <DomainBadge id={d.id} />
        <div class="min-w-0 grow">
          <div class="text-[16.5px] font-medium">{d.name}</div>
          <div class="mt-0.5 text-[14px] text-[var(--color-ink-3)]">
            {correct}/{total} correct &middot; blueprint weight {d.weight}%
          </div>
          <div class="mt-2"><Meter value={p} /></div>
        </div>
        <span
          class="pill border-transparent {p >= 70
            ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
            : p >= 50
              ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'
              : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'}"
        >{p}%</span>
      </div>
    {/each}
    <p class="py-3 text-[12.5px] text-[var(--color-ink-3)]">
      Domain percentages are informational on the real score report and are not used to determine
      pass or fail. Only the total scaled score is.
    </p>
  </div>

  <h2 class="section mt-6 mb-1.5">Item review</h2>
  <p class="mb-4 text-[14px] text-[var(--color-ink-2)]">
    Every item with your answer, the key, and why each distractor fails.
  </p>

  <div class="no-print mb-4 flex flex-wrap items-center gap-2">
    <button
      class="btn btn-sm {filter === 'wrong' ? 'btn-primary' : ''}"
      onclick={() => (filter = 'wrong')}
    >
      Wrong only ({items.filter((x) => !x.a?.correct).length})
    </button>
    <button class="btn btn-sm {filter === 'all' ? 'btn-primary' : ''}" onclick={() => (filter = 'all')}>
      All {attempt.total}
    </button>
    <div class="grow"></div>
    <a class="btn btn-sm btn-ghost" href="#/dashboard">Dashboard</a>
    <a class="btn btn-sm btn-primary" href="#/exam">New attempt</a>
  </div>

  {#if !shown.length}
    <Empty title="Nothing wrong here" body="A clean sweep on this attempt." />
  {:else}
    <div class="flex flex-col gap-2">
      {#each shown as { q: question, a } (question.id)}
        <div class="card overflow-hidden">
          <button
            class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)]"
            onclick={() => toggle(question.id)}
            aria-expanded={open.has(question.id)}
          >
            <span
              class="pill mt-px border-transparent {a?.correct
                ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
                : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'}"
            >{a?.correct ? '✓' : '✗'}</span>
            <span class="mt-0.5 shrink-0 font-mono text-[12.5px] text-[var(--color-ink-3)]">
              {question.domain} {question.task}
            </span>
            <span class="min-w-0 grow text-[14px]">
              {@html richText(question.stem.slice(0, 110))}{question.stem.length > 110 ? '…' : ''}
            </span>
          </button>
          {#if open.has(question.id)}
            <div class="border-t border-[var(--color-line)] px-4 pb-5 pt-4">
              <Question
                {question}
                salt={'e' + attempt.startedAt}
                selected={a?.selected ?? []}
                revealed={true}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}
