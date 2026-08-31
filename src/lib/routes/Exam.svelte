<script>
  import { onDestroy } from 'svelte'
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import {
    questions, questionById, domains, scenarios, meta, examBlueprint,
  } from '$lib/content.js'
  import { shuffle, isCorrect, scaledScore, formatClock } from '$lib/util.js'
  import * as q from '$lib/db/queries.js'

  import Question from '$lib/components/Question.svelte'

  /** @type {any} */
  let attempt = $state(null)
  /** @type {Map<string, {selected: string[], correct: boolean}>} */
  let answers = $state(new Map())
  /** @type {string[]} */
  let selected = $state([])
  let remaining = $state(0)
  let submitting = $state(false)

  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticker

  // Resume a sitting that was interrupted. The clock kept running, exactly as a
  // real proctored exam would, so a closed tab is not a free pause.
  $effect(() => {
    if (attempt || router.view !== 'exam') return
    q.activeAttempt().then(async (a) => {
      if (!a) return
      attempt = a
      answers = await q.attemptAnswers(a.id)
      selected = answers.get(a.questionIds[a.cursor])?.selected ?? []
      startTicker()
    })
  })

  function startTicker() {
    clearInterval(ticker)
    tick()
    ticker = setInterval(tick, 1000)
  }

  function tick() {
    if (!attempt) return
    remaining = attempt.durationMs - (Date.now() - attempt.startedAt)
    if (remaining <= 0) {
      clearInterval(ticker)
      finish()
    }
  }

  onDestroy(() => clearInterval(ticker))

  /**
   * Draw a paper: four scenarios of six, then fill each domain to its blueprint
   * weight preferring questions that belong to the drawn scenarios, then order
   * by scenario so each narrative is read once.
   */
  function draw() {
    const drawn = shuffle(scenarios.map((s) => s.id)).slice(0, meta.scenariosPresented)
    /** @type {any[]} */
    const picked = []
    for (const d of domains) {
      const inScenario = shuffle(
        questions.filter((x) => x.domain === d.id && drawn.includes(x.scenario)),
      )
      const rest = shuffle(
        questions.filter((x) => x.domain === d.id && !drawn.includes(x.scenario)),
      )
      picked.push(...inScenario.concat(rest).slice(0, examBlueprint[d.id]))
    }
    /** @type {any[]} */
    const ordered = []
    for (const sid of drawn) ordered.push(...shuffle(picked.filter((x) => x.scenario === sid)))
    ordered.push(...shuffle(picked.filter((x) => !drawn.includes(x.scenario))))
    return { ids: ordered.map((x) => x.id), scenarios: drawn }
  }

  async function begin() {
    const paper = draw()
    const id = await q.startAttempt(paper.ids, paper.scenarios, meta.timeLimitMinutes * 60_000)
    attempt = await q.attempt(id)
    answers = new Map()
    selected = []
    startTicker()
  }

  const current = $derived(attempt ? questionById[attempt.questionIds[attempt.cursor]] : null)
  const answeredCount = $derived(answers.size)
  const flaggedCount = $derived(
    attempt
      ? /** @type {string[]} */ (attempt.questionIds).filter((id) => progress.flags.has(id)).length
      : 0,
  )

  /** @param {string[]} keys */
  async function onSelect(keys) {
    if (!attempt || !current) return
    const correct = isCorrect(keys, current.correct)
    const next = new Map(answers)
    next.set(current.id, { selected: keys, correct })
    answers = next
    await progress.recordAnswer(current, keys, correct, 'exam', attempt.id)
  }

  /** @param {number} i */
  async function goTo(i) {
    if (!attempt || i < 0 || i >= attempt.questionIds.length) return
    attempt = { ...attempt, cursor: i }
    selected = answers.get(attempt.questionIds[i])?.selected ?? []
    await q.setAttemptCursor(attempt.id, i)
  }

  async function finish() {
    if (!attempt || submitting) return
    submitting = true
    clearInterval(ticker)
    let correct = 0
    for (const id of attempt.questionIds) if (answers.get(id)?.correct) correct++
    const total = attempt.questionIds.length
    await q.finishAttempt(attempt.id, correct, total, scaledScore(correct, total))
    const id = attempt.id
    attempt = null
    await progress.load()
    router.go(`/result/${id}`)
  }

  function confirmSubmit() {
    const unanswered = attempt.questionIds.length - answeredCount
    if (unanswered > 0) {
      const ok = confirm(
        `${unanswered} item${unanswered === 1 ? '' : 's'} unanswered. Submit anyway?`,
      )
      if (!ok) return
    }
    finish()
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (!attempt) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    if (e.key === 'ArrowRight') goTo(attempt.cursor + 1)
    if (e.key === 'ArrowLeft') goTo(attempt.cursor - 1)
  }
</script>

<svelte:window onkeydown={onKey} />

{#if !attempt}
  <h1 class="text-[24px] font-semibold">Mock exam</h1>
  <p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
    A full simulation: {meta.items} items in {meta.timeLimitMinutes} minutes,
    {meta.scenariosPresented} scenarios drawn at random from {meta.scenarioBankSize}, items sampled
    to the real domain weights, grouped by scenario so each narrative is read once. No feedback until
    you submit, exactly like exam day.
  </p>

  <div class="card max-w-xl p-5">
    <table class="w-full text-[14px]">
      <tbody>
        <tr class="border-b border-[var(--color-line)]">
          <td class="py-1.5">Items</td>
          <td class="py-1.5 text-right font-mono">{meta.items}</td>
        </tr>
        <tr class="border-b border-[var(--color-line)]">
          <td class="py-1.5">Time limit</td>
          <td class="py-1.5 text-right font-mono">{meta.timeLimitMinutes} min</td>
        </tr>
        <tr class="border-b border-[var(--color-line)]">
          <td class="py-1.5">Pace</td>
          <td class="py-1.5 text-right font-mono">
            {(meta.timeLimitMinutes / meta.items).toFixed(1)} min per item
          </td>
        </tr>
        <tr class="border-b border-[var(--color-line)]">
          <td class="py-1.5">Pass mark</td>
          <td class="py-1.5 text-right font-mono">{meta.passingScaled} scaled</td>
        </tr>
        {#each domains as d (d.id)}
          <tr class="border-b border-[var(--color-line)] text-[var(--color-ink-2)]">
            <td class="py-1 text-[12.5px]">{d.id} {d.shortName}</td>
            <td class="py-1 text-right font-mono text-[12.5px]">{examBlueprint[d.id]} items</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="my-4 text-[12.5px] text-[var(--color-ink-3)]">
      Progress is saved to the local database as you go, so closing the tab does not lose the
      attempt. The clock keeps running, so treat it as a real sitting.
    </p>

    <button class="btn btn-primary w-full justify-center" onclick={begin}>
      Begin timed exam
    </button>
  </div>

  <p class="mt-5 text-[12.5px] text-[var(--color-ink-3)]">
    The bank holds {questions.length} questions. With {meta.items} drawn per attempt, repeat sittings
    overlap; the draw is random each time.
  </p>
{:else}
  <div
    class="no-print card sticky top-[3.6rem] z-10 mb-5 flex flex-wrap items-center gap-3 px-4 py-2.5"
  >
    <span
      class="font-mono text-[19px] font-semibold {remaining < 600_000
        ? 'text-[var(--color-bad)]'
        : ''}"
      data-testid="exam-timer"
    >
      {formatClock(remaining)}
    </span>
    <span class="text-[12.5px] text-[var(--color-ink-3)]">
      Item {attempt.cursor + 1} of {attempt.questionIds.length}
    </span>
    <div class="grow"></div>
    <span class="text-[12.5px] text-[var(--color-ink-3)]" data-testid="exam-progress">
      {answeredCount} answered &middot; {flaggedCount} flagged
    </span>
    <button class="btn btn-sm" onclick={() => goTo(attempt.cursor - 1)} aria-label="Previous item">
      &larr;
    </button>
    <button class="btn btn-sm" onclick={() => goTo(attempt.cursor + 1)} aria-label="Next item">
      &rarr;
    </button>
    <button class="btn btn-sm btn-primary" onclick={confirmSubmit} disabled={submitting}>
      Submit
    </button>
  </div>

  {#key current.id}
    <Question
      question={current}
      salt={'e' + attempt.startedAt}
      bind:selected
      revealed={false}
      onselect={onSelect}
    >
      {#snippet footer()}
        <button class="btn" disabled={attempt.cursor === 0} onclick={() => goTo(attempt.cursor - 1)}>
          &larr; Previous
        </button>
        <div class="grow"></div>
        <button
          class="btn btn-primary"
          onclick={() =>
            attempt.cursor === attempt.questionIds.length - 1
              ? confirmSubmit()
              : goTo(attempt.cursor + 1)}
        >
          {attempt.cursor === attempt.questionIds.length - 1 ? 'Review and submit' : 'Next →'}
        </button>
      {/snippet}
    </Question>
  {/key}

  <div class="mx-auto mt-8 max-w-3xl">
    <span class="label mb-2">Jump to item</span>
    <div class="flex flex-wrap gap-1" data-testid="exam-nav">
      {#each attempt.questionIds as id, i (id)}
        <button
          class="h-7 w-7 border font-mono text-[12.5px] transition-colors
            {i === attempt.cursor
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
              : progress.flags.has(id)
                ? 'border-[var(--color-warn)] text-[var(--color-warn)]'
                : answers.has(id)
                  ? 'border-[var(--color-line-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-3)]'}"
          onclick={() => goTo(i)}
          aria-label="Go to item {i + 1}"
        >
          {i + 1}
        </button>
      {/each}
    </div>
  </div>
{/if}
