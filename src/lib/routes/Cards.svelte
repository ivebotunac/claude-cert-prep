<script>
  import { untrack } from 'svelte'
  import { domains, domainById, cardsByDomain, flashcards, LEITNER_DAYS } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { router } from '$lib/router.svelte.js'
  import { richText, shuffle, pct } from '$lib/util.js'

  import Meter from '$lib/components/Meter.svelte'
  import Empty from '$lib/components/Empty.svelte'

  const domain = $derived(router.segments[1] ?? '')
  const summary = $derived(progress.cardSummary(domain))

  /** @type {any[]} */
  let queue = $state([])
  let index = $state(0)
  let revealed = $state(false)
  let reviewed = $state(0)
  let lapsed = $state(0)
  let cramming = $state(false)

  const current = $derived(queue[index])
  const currentBox = $derived(current ? (progress.cards.get(current.id)?.box ?? 0) : -1)

  /** Every card in the current filter, due or not. */
  const pool = $derived(domain ? (cardsByDomain[domain] ?? []) : flashcards)

  /** @param {boolean} [cram] */
  function build(cram = false) {
    queue = shuffle(cram ? pool : progress.dueCards(domain))
    index = 0
    revealed = false
    reviewed = 0
    lapsed = 0
    cramming = cram
  }

  // Rebuild on a filter change only. Grading rewrites progress.cards, and reading
  // that here would reshuffle the deck under the learner mid-session.
  $effect(() => {
    domain
    untrack(() => build())
  })

  /** @param {'again' | 'hard' | 'good'} g */
  function grade(g) {
    if (!current || !revealed) return
    progress.gradeCard(current, g)
    reviewed++
    if (g === 'again') lapsed++
    revealed = false
    index++
  }

  /** @param {Event & { currentTarget: HTMLSelectElement }} e */
  function onFilter(e) {
    const v = e.currentTarget.value
    router.go(v ? `/cards/${v}` : '/cards')
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return
    if (!current) return
    // preventDefault stops space from also re-activating the focused card button.
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (revealed) grade('good')
      else revealed = true
      return
    }
    if (!revealed) return
    const g = e.key === '1' ? 'again' : e.key === '2' ? 'hard' : e.key === '3' ? 'good' : null
    if (g) {
      e.preventDefault()
      grade(g)
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<h1 class="text-[24px] font-semibold">Flashcards</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
  Six Leitner boxes. Good moves a card up a box, Hard holds it where it is, Again drops it back to
  box 1. Space reveals and grades as Good, keys 1, 2 and 3 grade directly.
</p>

<div class="mx-auto max-w-2xl">
  <div class="mb-3.5 flex flex-wrap items-center gap-3">
    <select class="field" value={domain} onchange={onFilter} aria-label="Filter cards by domain">
      <option value="">All domains ({flashcards.length})</option>
      {#each domains as d (d.id)}
        <option value={d.id}>{d.id} {d.shortName} ({cardsByDomain[d.id]?.length ?? 0})</option>
      {/each}
    </select>
    <div class="grow"></div>
    <span class="text-[12.5px] text-[var(--color-ink-3)]">
      {reviewed} reviewed{lapsed ? `, ${lapsed} back to box 1` : ''}
    </span>
  </div>

  {#if current}
    <div class="mb-3 flex items-center gap-3">
      <span class="shrink-0 text-[12.5px] text-[var(--color-ink-3)]">
        {index + 1} of {queue.length}{cramming ? ' · cram' : ''}
      </span>
      <Meter value={pct(index, queue.length)} tone="accent" height="h-1" />
    </div>

    {#snippet face(/** @type {any} */ card)}
      {@const d = domainById[card.domain]}
      <div class="flex flex-wrap justify-center gap-2">
        <span class="pill border-transparent" style="background: {d.color}22; color: {d.color}">
          {card.domain} &middot; {d.shortName}
        </span>
        <span class="pill">{card.task === 'meta' ? 'Exam mechanics' : `Task ${card.task}`}</span>
        <span class="pill">Box {currentBox + 1}</span>
      </div>
      <div class="label mt-6 text-center">Term</div>
      <p class="mt-2 text-center text-[27px] leading-snug font-medium text-pretty">
        {@html richText(card.front)}
      </p>
    {/snippet}

    {#if !revealed}
      <button
        type="button"
        class="card flex min-h-[15rem] w-full cursor-pointer flex-col p-6 hover:border-[var(--color-line-strong)]"
        onclick={() => (revealed = true)}
      >
        {@render face(current)}
        <div class="grow"></div>
        <span class="mt-6 text-center text-[12.5px] text-[var(--color-ink-3)]">
          Click to reveal what it is, or press space
        </span>
      </button>
    {:else}
      <div class="card flex min-h-[15rem] flex-col p-6">
        {@render face(current)}
        <hr class="my-5 border-0 border-t border-dashed border-[var(--color-line-strong)]" />
        <div class="label text-center">What it is</div>
        <div class="mx-auto mt-2 max-w-[58ch] text-center text-[17px] leading-relaxed text-pretty">
          {@html richText(current.back)}
        </div>
        <div class="grow"></div>
        <div class="mt-7 flex flex-wrap gap-2">
          <button
            class="btn grow basis-[6.5rem] justify-center border-[var(--color-bad)] text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)]"
            onclick={() => grade('again')}
          >
            Again <span class="text-[12.5px] opacity-60">1</span>
          </button>
          <button class="btn grow basis-[6.5rem] justify-center" onclick={() => grade('hard')}>
            Hard <span class="text-[12.5px] opacity-60">2</span>
          </button>
          <button
            class="btn btn-primary grow basis-[6.5rem] justify-center"
            onclick={() => grade('good')}
          >
            Good <span class="text-[12.5px] opacity-70">3</span>
          </button>
        </div>
      </div>
    {/if}
  {:else}
    <Empty
      title={reviewed ? 'Session done' : 'Nothing due in this filter'}
      body={reviewed
        ? `${reviewed} card${reviewed === 1 ? '' : 's'} reviewed, ${lapsed} sent back to box 1. Cards you got wrong are due again today.`
        : 'Everything here is scheduled for a later day. Come back tomorrow, or cram the whole set now. Cramming still grades, so it will move the boxes.'}
    >
      {#if summary.due > 0}
        <button class="btn btn-primary" onclick={() => build()}>
          Review {summary.due} due
        </button>
      {/if}
      <button class="btn" onclick={() => build(true)} disabled={pool.length === 0}>
        Cram anyway
      </button>
      <a class="btn btn-ghost" href="#/dashboard">Back to dashboard</a>
    </Empty>
  {/if}
</div>

<h2 class="section mt-6 mb-2.5">Leitner boxes</h2>
<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
  {#each summary.boxes as n, i}
    <div
      class="card px-2 py-2.5 text-center {currentBox === i
        ? 'border-[var(--color-accent)]'
        : ''}"
    >
      <div class="font-mono text-[20px] font-semibold {n ? '' : 'text-[var(--color-ink-3)]'}">{n}</div>
      <div
        class="mt-0.5 text-[12.5px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-3)]"
      >
        Box {i + 1}
      </div>
      <div class="text-[12.5px] text-[var(--color-ink-3)]">
        {LEITNER_DAYS[i] === 0 ? 'today' : `${LEITNER_DAYS[i]} days`}
      </div>
    </div>
  {/each}
</div>
<p class="mt-3 text-[14px] text-[var(--color-ink-2)]">
  <span data-testid="due-count">{summary.due}</span> due, {summary.learned} learned,
  {summary.total} total in this filter.
</p>
<p class="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
  Box 1 comes back the same day, then a card you keep getting right returns after 1, 3, 7, 21 and
  finally 60 days.
</p>
