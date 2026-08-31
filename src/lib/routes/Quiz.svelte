<script>
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import {
    questions, domains, scenarios, questionById, domainById,
  } from '$lib/content.js'
  import { shuffle, pct } from '$lib/util.js'

  import Question from '$lib/components/Question.svelte'
  import Meter from '$lib/components/Meter.svelte'

  /**
   * @typedef {{ ids: string[], i: number, right: number, answered: number, salt: string, label: string }} Session
   */

  /** @type {Session | null} */
  let session = $state(null)

  /** @type {string[]} */
  let selected = $state([])
  let revealed = $state(false)
  let startedAt = $state(0)

  let scope = $state('all')
  let length = $state('20')

  /** @type {Question | undefined} */
  let questionEl = $state()

  // A quiz can be launched straight from a link, for example the dashboard's
  // "drill this domain" or a review list's "drill these".
  $effect(() => {
    const qp = router.query
    if (session || router.view !== 'quiz') return
    const domain = qp.get('domain')
    const task = qp.get('task')
    const list = qp.get('list')
    const scenario = qp.get('scenario')
    if (domain) start(`domain:${domain}`, 20)
    else if (task) start(`task:${task}`, 0)
    else if (scenario) start(`scenario:${scenario}`, 20)
    else if (list) start(list, 0)
  })

  const pools = $derived({
    all: questions.length,
    unseen: progress.unseenQuestions().length,
    missed: progress.missedQuestions().length,
    shaky: progress.shakyQuestions().length,
    flagged: progress.flaggedQuestions().length,
    official: questions.filter((q) => q.source === 'official').length,
  })

  /** @param {string} value */
  function poolFor(value) {
    if (value.startsWith('domain:')) return questions.filter((q) => q.domain === value.slice(7))
    if (value.startsWith('task:')) return questions.filter((q) => q.task === value.slice(5))
    if (value.startsWith('scenario:')) return questions.filter((q) => q.scenario === value.slice(9))
    if (value === 'unseen') return progress.unseenQuestions()
    if (value === 'missed') return progress.missedQuestions()
    if (value === 'shaky') return progress.shakyQuestions()
    if (value === 'flagged') return progress.flaggedQuestions()
    if (value === 'official') return questions.filter((q) => q.source === 'official')
    return questions
  }

  /** @param {string} value @param {number} limit */
  function start(value, limit) {
    let pool = shuffle(poolFor(value))
    if (!pool.length) return
    if (limit > 0) pool = pool.slice(0, limit)
    session = {
      ids: pool.map((q) => q.id),
      i: 0,
      right: 0,
      answered: 0,
      salt: 'q' + Date.now(),
      label: labelFor(value),
    }
    selected = []
    revealed = false
    startedAt = Date.now()
  }

  /** @param {string} value */
  function labelFor(value) {
    if (value.startsWith('domain:')) return domainById[value.slice(7)]?.name ?? value
    if (value.startsWith('task:')) return `Task ${value.slice(5)}`
    if (value.startsWith('scenario:')) return value.slice(9)
    /** @type {Record<string, string>} */
    const names = {
      all: 'Everything', unseen: 'Not yet attempted', missed: 'Last answered wrong',
      shaky: 'Answered both ways', flagged: 'Flagged', official: 'Official sample questions',
    }
    return names[value] ?? value
  }

  const current = $derived.by(() => (session ? questionById[session.ids[session.i]] : null))
  const done = $derived.by(() => (session ? session.i >= session.ids.length : false))
  const total = $derived.by(() => (session ? session.ids.length : 0))
  const index = $derived.by(() => (session ? session.i : 0))

  /** @param {string[]} keys @param {boolean} correct */
  async function onAnswer(keys, correct) {
    if (!session) return
    session.answered++
    if (correct) session.right++
    await progress.recordAnswer(current, keys, correct, 'quiz', null, Date.now() - startedAt)
  }

  function next() {
    if (!session) return
    session.i++
    selected = []
    revealed = false
    startedAt = Date.now()
  }

  function quit() {
    session = null
    router.go('/quiz')
  }
</script>

{#if !session}
  <h1 class="mb-1.5 text-[27px] font-semibold">Practice quiz</h1>
  <p class="mb-7 max-w-[68ch] text-[var(--color-ink-2)]">
    Immediate feedback after every item, with the reason each wrong option fails. Answers feed your
    accuracy stats and the review lists.
  </p>

  <div class="card max-w-xl p-5">
    <label class="label mb-1.5" for="scope">Scope</label>
    <select id="scope" class="field mb-4 w-full" bind:value={scope}>
      <option value="all">Everything ({pools.all} questions)</option>
      <optgroup label="By domain">
        {#each domains as d (d.id)}
          <option value="domain:{d.id}">
            {d.id} &middot; {d.name} ({questions.filter((q) => q.domain === d.id).length})
          </option>
        {/each}
      </optgroup>
      <optgroup label="By scenario">
        {#each scenarios as s (s.id)}
          <option value="scenario:{s.id}">
            {s.id} &middot; {s.title} ({questions.filter((q) => q.scenario === s.id).length})
          </option>
        {/each}
      </optgroup>
      <optgroup label="By progress">
        <option value="unseen">Not yet attempted ({pools.unseen})</option>
        <option value="missed">Last answered wrong ({pools.missed})</option>
        <option value="shaky">Answered both right and wrong ({pools.shaky})</option>
        <option value="flagged">Flagged ({pools.flagged})</option>
      </optgroup>
      <optgroup label="Special">
        <option value="official">Official sample questions ({pools.official})</option>
      </optgroup>
    </select>

    <label class="label mb-1.5" for="length">Length</label>
    <select id="length" class="field mb-5 w-full" bind:value={length}>
      <option value="10">10 questions</option>
      <option value="20">20 questions</option>
      <option value="40">40 questions</option>
      <option value="0">Everything in scope</option>
    </select>

    {#if !poolFor(scope).length}
      <p class="mb-4 text-sm text-[var(--color-warn)]">
        Nothing matches that scope yet. Answer some questions first, or pick another.
      </p>
    {/if}

    <button
      class="btn btn-primary w-full justify-center"
      disabled={!poolFor(scope).length}
      onclick={() => start(scope, Number(length))}
    >
      Start quiz
    </button>
  </div>

  <p class="mt-5 text-xs text-[var(--color-ink-3)]">
    Questions are drawn at random from the scope. Option order is shuffled per sitting unless you
    turn that off in <a href="#/settings" class="underline">settings</a>.
  </p>
{:else if done}
  {@const accuracy = pct(session.right, session.ids.length)}
  <div class="mx-auto max-w-3xl">
    <div class="card px-5 py-10 text-center">
      <div class="font-serif text-6xl font-semibold leading-none">
        {session.right}<span class="text-2xl text-[var(--color-ink-3)]">/{session.ids.length}</span>
      </div>
      <p
        class="mt-3 text-[17px] font-semibold {accuracy >= 70
          ? 'text-[var(--color-ok)]'
          : 'text-[var(--color-bad)]'}"
      >
        {accuracy}% correct
      </p>
      <p class="mt-3 text-sm text-[var(--color-ink-2)]">{session.label}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <button class="btn btn-primary" onclick={quit}>Another quiz</button>
        <a class="btn" href="#/review">Review mistakes</a>
        <a class="btn btn-ghost" href="#/dashboard">Dashboard</a>
      </div>
    </div>
  </div>
{:else}
  <div class="mx-auto mb-4 flex max-w-3xl items-center gap-3">
    <button class="btn btn-ghost btn-sm" onclick={quit}>&larr; End quiz</button>
    <div class="grow"></div>
    <span class="text-xs text-[var(--color-ink-3)]">
      {session.right}/{session.answered} correct so far
    </span>
  </div>
  <div class="mx-auto mb-6 max-w-3xl">
    <Meter value={pct(session.i, session.ids.length)} tone="clay" height="h-1" />
  </div>

  {#key current.id}
    <Question
      bind:this={questionEl}
      question={current}
      salt={session.salt}
      bind:selected
      bind:revealed
      counter="Question {session.i + 1} of {session.ids.length}"
      onsubmit={onAnswer}
    >
      {#snippet footer()}
        {#if !revealed}
          <button class="btn btn-primary" onclick={() => questionEl?.submit()}>Check answer</button>
        {:else}
          <button class="btn btn-primary" onclick={next}>
            {index === total - 1 ? 'See results' : 'Next question'}
          </button>
        {/if}
      {/snippet}
    </Question>
  {/key}
{/if}
