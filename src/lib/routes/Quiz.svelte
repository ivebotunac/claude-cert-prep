<script>
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import {
    questions, domains, scenarios, questionById, domainById,
    questionsByDomain, questionsByScenario,
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

  /** The one-click shortcuts in the side panel map back to a scope value. */
  /** @type {Record<string, string>} */
  const SHORTCUTS = {
    Everything: 'all',
    'Not yet attempted': 'unseen',
    'Last answered wrong': 'missed',
    'Answered both ways': 'shaky',
    Flagged: 'flagged',
    'Official samples': 'official',
  }

  /** @param {string} name */
  const labelToScope = (name) => SHORTCUTS[name] ?? 'all'

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
  <h1 class="text-[24px] font-semibold">Practice quiz</h1>
  <p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
    Immediate feedback after every item, with the reason each wrong option fails. Answers feed your
    accuracy figures and the review lists.
  </p>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
    <div>
      <div class="section mb-2.5">Scope</div>
      <div class="card p-4">
        <label class="label mb-1.5" for="scope">Draw from</label>
        <select id="scope" class="field mb-4 w-full" bind:value={scope}>
          <option value="all">Everything ({pools.all} questions)</option>
          <optgroup label="By domain">
            {#each domains as d (d.id)}
              <option value="domain:{d.id}">
                {d.id} &middot; {d.name} ({questionsByDomain[d.id]?.length ?? 0})
              </option>
            {/each}
          </optgroup>
          <optgroup label="By scenario">
            {#each scenarios as sc (sc.id)}
              <option value="scenario:{sc.id}">
                {sc.id} &middot; {sc.title} ({questionsByScenario[sc.id]?.length ?? 0})
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

        <span class="label mb-1.5" id="length-label">Length</span>
        <div class="mb-4 flex gap-px bg-[var(--color-line)] p-px" role="group" aria-labelledby="length-label">
          {#each [['10', '10', '10 questions'], ['20', '20', '20 questions'], ['40', '40', '40 questions'], ['0', 'all', 'Everything in scope']] as [value, text, name] (value)}
            <button
              class="grow py-2 font-mono text-[13px] transition-colors
                {length === value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}"
              aria-label={name}
              aria-pressed={length === value}
              onclick={() => (length = value)}
            >{text}</button>
          {/each}
        </div>

        {#if !poolFor(scope).length}
          <p class="mb-3 text-[14px] text-[var(--color-warn)]">
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
    </div>

    <div>
      <div class="section mb-2.5">The bank</div>
      <div class="card rows">
        {#each [['Everything', pools.all], ['Not yet attempted', pools.unseen], ['Last answered wrong', pools.missed], ['Answered both ways', pools.shaky], ['Flagged', pools.flagged], ['Official samples', pools.official]] as [name, n] (name)}
          <button
            class="flex w-full items-baseline justify-between gap-4 px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--color-surface-2)]"
            onclick={() => start(labelToScope(String(name)), 20)}
            disabled={!n}
          >
            <span class="text-[var(--color-ink-2)]">{name}</span>
            <span class="font-mono">{n}</span>
          </button>
        {/each}
      </div>
      <p class="mt-3 font-mono text-[12px] leading-relaxed text-[var(--color-ink-3)]">
        Questions are drawn at random from the scope. Option order is shuffled per sitting unless
        you turn that off in <a href="#/settings">settings</a>.
      </p>
    </div>
  </div>
{:else if done}
  {@const accuracy = pct(session.right, session.ids.length)}
  <div class="max-w-3xl">
    <div class="card px-6 py-10 text-center">
      <div class="label">{session.label}</div>
      <div class="mt-3 font-mono text-[58px] leading-none font-medium tracking-[-0.035em]">
        {session.right}<span class="text-[25px] text-[var(--color-ink-3)]">/{session.ids.length}</span>
      </div>
      <p
        class="mt-3 font-mono text-[17px]"
        style="color: {accuracy >= 70 ? 'var(--color-ok)' : 'var(--color-bad)'}"
      >
        {accuracy}% correct
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <button class="btn btn-primary" onclick={quit}>Another quiz</button>
        <a class="btn" href="#/review">Review mistakes</a>
        <a class="btn btn-ghost" href="#/dashboard">Overview</a>
      </div>
    </div>
  </div>
{:else}
  <div class="mb-3 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
    <button class="btn btn-ghost btn-sm" onclick={quit}>&larr; End quiz</button>
    <span class="font-mono text-[12.5px] text-[var(--color-ink-3)]">{session.label}</span>
    <div class="grow"></div>
    <span class="font-mono text-[12.5px] text-[var(--color-ink-3)]">
      {session.right}/{session.answered} correct so far
    </span>
    <div class="w-[120px] shrink-0">
      <Meter value={pct(session.i, session.ids.length)} tone="accent" />
    </div>
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
