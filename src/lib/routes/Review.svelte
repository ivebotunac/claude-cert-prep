<script>
  import { progress } from '$lib/stores/progress.svelte.js'
  import { richText } from '$lib/util.js'

  import Stat from '$lib/components/Stat.svelte'
  import DomainBadge from '$lib/components/DomainBadge.svelte'
  import Empty from '$lib/components/Empty.svelte'
  import Question from '$lib/components/Question.svelte'

  const missed = $derived(progress.missedQuestions())
  const flagged = $derived(progress.flaggedQuestions())
  const shaky = $derived(progress.shakyQuestions())

  const lists = $derived([
    {
      key: 'missed',
      label: 'Last answer wrong',
      items: missed,
      blurb: 'Questions where the most recent attempt was wrong.',
      emptyTitle: 'Nothing wrong on your last pass',
      emptyBody:
        'Every question you have attempted, you got right the last time you saw it. Answer some more and check back.',
    },
    {
      key: 'flagged',
      label: 'Flagged',
      items: flagged,
      blurb: 'Questions you marked while answering, whether you got them right or not.',
      emptyTitle: 'No flags set',
      emptyBody: 'Flag a question during a quiz or a mock and it waits for you here.',
    },
    {
      key: 'shaky',
      label: 'Inconsistent',
      items: shaky,
      blurb: 'Answered right at least once and wrong at least once.',
      emptyTitle: 'Nothing inconsistent yet',
      emptyBody:
        'This list fills up once you have seen the same question more than once and answered it both ways.',
    },
  ])

  let active = $state('missed')
  const current = $derived(lists.find((l) => l.key === active) ?? lists[0])

  /** @type {Set<string>} rows the learner has expanded */
  let open = $state(new Set())

  /** @param {string} id */
  function toggleRow(id) {
    const s = new Set(open)
    s.has(id) ? s.delete(id) : s.add(id)
    open = s
  }

  /** @param {string} s */
  function excerpt(s) {
    const t = String(s ?? '')
    return t.length > 100 ? t.slice(0, 100).trimEnd() + '…' : t
  }

  /** @param {any} stats a row from progress.answers */
  function tally(stats) {
    if (!stats) return 'not attempted'
    return `${stats.correct} right, ${stats.wrong} wrong`
  }
</script>

<h1 class="text-[24px] font-semibold">Worth another look</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
  Three lists, three different problems. Open any row to see the key and the reason every option
  passes or fails, then drill the whole list as a quiz when you want it tested rather than read.
</p>

<div class="grid gap-3.5 sm:grid-cols-3">
  <Stat
    value={missed.length}
    label="Last answer wrong"
    sub="wrong the last time you saw them"
    tone={missed.length ? 'var(--color-bad)' : 'var(--color-ink)'}
  />
  <Stat value={flagged.length} label="Flagged" sub="marked while answering" />
  <Stat
    value={shaky.length}
    label="Inconsistent"
    sub="right once, wrong another time"
    tone={shaky.length ? 'var(--color-warn)' : 'var(--color-ink)'}
  />
</div>

<p class="mt-3 max-w-[68ch] text-[14px] text-[var(--color-ink-2)]">
  The inconsistent list is where the real gaps hide. Getting an item right once and wrong another
  time usually means you recognised the wording rather than the reasoning, and that is exactly what
  a reworded exam item will catch.
</p>

<div class="mb-4 mt-8 flex flex-wrap items-center gap-2">
  {#each lists as l (l.key)}
    <button
      class="btn btn-sm {active === l.key
        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
        : ''}"
      onclick={() => (active = l.key)}
      aria-pressed={active === l.key}
    >
      {l.label}
      <span class="font-mono text-[12.5px] {active === l.key ? '' : 'text-[var(--color-ink-3)]'}">
        {l.items.length}
      </span>
    </button>
  {/each}
  <button
    class="btn btn-ghost btn-sm ml-auto"
    onclick={() => progress.clearFlags()}
    disabled={!flagged.length}
  >
    Clear all flags
  </button>
</div>

{#if current.items.length}
  <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
    <p class="grow text-[14px] text-[var(--color-ink-2)]">{current.blurb}</p>
    <a class="btn btn-primary btn-sm" href="#/quiz?list={current.key}">
      Drill these {current.items.length} as a quiz
    </a>
  </div>

  <div class="card divide-y divide-[var(--color-line-soft)] overflow-hidden">
    {#each current.items as item (item.id)}
      {@const stats = progress.answers.get(item.id)}
      {@const isOpen = open.has(item.id)}
      <div>
        <button
          class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]"
          onclick={() => toggleRow(item.id)}
          aria-expanded={isOpen}
          aria-controls="review-{item.id}"
        >
          <span class="mt-1 w-3 shrink-0 text-[12.5px] text-[var(--color-ink-3)]">
            {isOpen ? '▾' : '▸'}
          </span>
          <DomainBadge id={item.domain} size="sm" />
          <span class="min-w-0 grow">
            <span class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-[12.5px] text-[var(--color-ink-2)]">{item.task}</span>
              <span class="pill">{tally(stats)}</span>
            </span>
            <span class="mt-1.5 block text-[15.5px] leading-snug text-[var(--color-ink-2)]">
              {@html richText(excerpt(item.stem))}
            </span>
          </span>
        </button>

        <!-- mounted only after the row is opened, so a long list stays cheap -->
        {#if isOpen}
          <div
            id="review-{item.id}"
            class="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-6"
          >
            <Question question={item} revealed={true} showScenario={true} />
          </div>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <Empty title={current.emptyTitle} body={current.emptyBody}>
    <a class="btn" href="#/quiz">Take a quiz</a>
    <a class="btn" href="#/exam">Sit a mock</a>
  </Empty>
{/if}
