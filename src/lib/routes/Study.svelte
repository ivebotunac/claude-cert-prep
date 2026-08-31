<script>
  import { domains, domainById, scenarios, tasks, questionsByTask, meta } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { router } from '$lib/router.svelte.js'
  import { richText } from '$lib/util.js'

  import Meter from '$lib/components/Meter.svelte'
  import DomainBadge from '$lib/components/DomainBadge.svelte'
  import Empty from '$lib/components/Empty.svelte'

  const domainId = $derived(router.segments[1] ?? '')
  const domain = $derived(domainById[domainId])
  const list = $derived(domain ? tasks.filter((t) => t.domain === domain.id) : [])

  const reading = $derived(progress.readSummary())
  const dp = $derived(domain ? progress.domainProgress(domain.id) : null)
  const allRead = $derived(list.length > 0 && list.every((t) => progress.read.has(t.id)))

  /** @type {Set<string>} */
  let open = $state(new Set())

  // The component stays mounted when the hash moves between domains, so the
  // panels have to be closed by hand.
  $effect(() => {
    domainId
    open = new Set()
  })

  /** @param {string} id */
  function toggleOpen(id) {
    const s = new Set(open)
    s.has(id) ? s.delete(id) : s.add(id)
    open = s
  }

  function toggleAll() {
    progress.setReadBulk(list, !allRead)
  }

  /** @param {string} taskId */
  const bank = (taskId) => questionsByTask[taskId]?.length ?? 0
</script>

{#if !domainId}
  <h1 class="mb-1.5 text-[27px] font-semibold">Study the blueprint</h1>
  <p class="mb-7 max-w-[68ch] text-[var(--color-ink-2)]">
    Every question on the exam traces back to one of {tasks.length} task statements. Read a domain,
    tick each objective off as it lands, then drill it. The wording here follows the guide,
    version {meta.guideVersion}.
  </p>

  <div class="card mb-9 p-5">
    <div class="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="label">Objectives read</span>
      <span class="grow"></span>
      <span class="font-mono text-sm text-[var(--color-ink-2)]">
        {reading.done}/{reading.total}
      </span>
      <span class="pill">{reading.pct}%</span>
    </div>
    <Meter value={reading.pct} />
  </div>

  <h2 class="mb-3 text-lg font-semibold">The five domains</h2>
  <div class="grid gap-3.5 sm:grid-cols-2">
    {#each domains as d (d.id)}
      {@const p = progress.domainProgress(d.id)}
      <a
        href="#/study/{d.id}"
        class="card flex flex-col p-5 no-underline transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
      >
        <div class="flex items-center gap-3">
          <DomainBadge id={d.id} />
          <div class="min-w-0 grow">
            <div class="text-[14.5px] font-medium text-[var(--color-ink)]">{d.name}</div>
            <div class="text-xs text-[var(--color-ink-3)]">
              {d.weight}% of the exam &middot; ~{d.expectedItems} items
            </div>
          </div>
        </div>

        <p class="my-3 grow text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          {@html richText(d.blurb)}
        </p>

        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="text-xs text-[var(--color-ink-3)]">
            {p.read} of {p.readTotal} objectives read
          </span>
          <span class="grow"></span>
          <span
            class="pill border-transparent {p.readPct === 100
              ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
              : ''}"
          >{p.readPct}%</span>
        </div>
        <Meter value={p.readPct} />
      </a>
    {/each}
  </div>

  <h2 class="mb-1.5 mt-9 text-lg font-semibold">The six scenarios</h2>
  <p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
    {meta.scenariosPresented} of these {meta.scenarioBankSize} are drawn for any one sitting, and
    the items hang off them. Knowing the setup before you read a stem saves a minute every time.
  </p>
  <div class="flex flex-col gap-3.5">
    {#each scenarios as s (s.id)}
      <div class="card p-5">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="font-mono text-[13px] font-semibold text-[var(--color-clay-text)]">{s.id}</span>
          <h3 class="text-[15px] font-semibold">{s.title}</h3>
          <span class="grow"></span>
          {#each s.primaryDomains as id (id)}
            {@const d = domainById[id]}
            <span
              class="pill border-transparent"
              style="background: {d.color}22; color: {d.color}"
              title={d.name}
            >{id} &middot; {d.shortName}</span>
          {/each}
        </div>
        <p class="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          {@html richText(s.narrative)}
        </p>
        <ul
          class="mt-3 flex list-disc flex-col gap-1 pl-[1.15rem] text-[13px] leading-relaxed text-[var(--color-ink-3)] marker:text-[var(--color-line-strong)]"
        >
          {#each s.keyProps as prop}
            <li>{@html richText(prop)}</li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{:else if !domain}
  <Empty
    title="No domain by that name"
    body="The blueprint has five domains, D1 through D5. The link you followed points somewhere else."
  >
    <a class="btn" href="#/study">Back to study</a>
  </Empty>
{:else}
  <a
    href="#/study"
    class="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ink-2)] no-underline hover:text-[var(--color-ink)]"
  >
    <span aria-hidden="true">&larr;</span> All domains
  </a>

  <div class="mb-3 flex items-center gap-3.5">
    <DomainBadge id={domain.id} />
    <div class="min-w-0">
      <h1 class="text-[24px] font-semibold leading-tight">{domain.name}</h1>
      <div class="mt-0.5 text-xs text-[var(--color-ink-3)]">
        {domain.weight}% of the exam &middot; ~{domain.expectedItems} items &middot;
        {list.length} task statements
      </div>
    </div>
  </div>

  <p class="mb-4 max-w-[68ch] leading-relaxed text-[var(--color-ink-2)]">
    {@html richText(domain.blurb)}
  </p>

  <div class="mb-6 flex flex-wrap gap-2">
    <a class="btn btn-primary" href="#/quiz?domain={domain.id}">Quiz this domain</a>
    <a class="btn" href="#/cards/{domain.id}">Flashcards</a>
  </div>

  {#if dp}
    <div class="card mb-6 p-5">
      <div class="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="label">Read in this domain</span>
        <span class="font-mono text-sm text-[var(--color-ink-2)]">
          {dp.read}/{dp.readTotal}
        </span>
        <span class="grow"></span>
        <button class="btn btn-sm" onclick={toggleAll}>
          {allRead ? 'Clear all' : 'Mark all read'}
        </button>
      </div>
      <Meter value={dp.readPct} />
    </div>
  {/if}

  <div class="flex flex-col gap-2.5">
    {#each list as t (t.id)}
      {@const isRead = progress.read.has(t.id)}
      {@const isOpen = open.has(t.id)}
      {@const n = bank(t.id)}
      <div class="card overflow-hidden">
        <div
          class="flex items-start gap-3 px-4 py-3.5 sm:px-5 {isRead
            ? 'bg-[var(--color-ok-soft)]'
            : ''}"
        >
          <button
            type="button"
            class="mt-0.5 grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[6px] border transition-colors
              {isRead
                ? 'border-[var(--color-ok)] bg-[var(--color-ok)] text-white'
                : 'border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:border-[var(--color-ink-3)]'}"
            aria-pressed={isRead}
            aria-label="{isRead ? 'Mark task ' + t.id + ' unread' : 'Mark task ' + t.id + ' read'}"
            onclick={() => progress.toggleRead(t)}
          >
            {#if isRead}
              <svg viewBox="0 0 12 10" class="h-[11px] w-[11px]" aria-hidden="true">
                <path
                  d="M1 5.2 4.4 8.6 11 1.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            {/if}
          </button>

          <button
            type="button"
            class="min-w-0 grow cursor-pointer bg-transparent text-left"
            aria-expanded={isOpen}
            aria-controls="task-{t.id}"
            onclick={() => toggleOpen(t.id)}
          >
            <div class="flex items-start gap-2">
              <span class="mt-px font-mono text-[13px] font-semibold text-[var(--color-clay-text)]">
                {t.id}
              </span>
              <span class="min-w-0 grow text-[14.5px] font-medium leading-snug">
                {@html richText(t.title)}
              </span>
              <svg
                viewBox="0 0 10 6"
                class="mt-1.5 h-[7px] w-[11px] shrink-0 text-[var(--color-ink-3)] transition-transform {isOpen
                  ? 'rotate-180'
                  : ''}"
                aria-hidden="true"
              >
                <path
                  d="M1 1 5 5 9 1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <p class="mt-1 text-[13px] italic leading-relaxed text-[var(--color-ink-2)]">
              {@html richText(t.keyIdea)}
            </p>
          </button>
        </div>

        {#if isOpen}
          <div id="task-{t.id}" class="border-t border-[var(--color-line)] px-4 py-4 sm:px-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 class="label mb-2">Knowledge of</h3>
                <ul
                  class="flex list-disc flex-col gap-2 pl-[1.15rem] text-[13.5px] leading-relaxed text-[var(--color-ink-2)] marker:text-[var(--color-line-strong)]"
                >
                  {#each t.knowledge as k}
                    <li>{@html richText(k)}</li>
                  {/each}
                </ul>
              </div>
              <div>
                <h3 class="label mb-2">Skills in</h3>
                <ul
                  class="flex list-disc flex-col gap-2 pl-[1.15rem] text-[13.5px] leading-relaxed text-[var(--color-ink-2)] marker:text-[var(--color-line-strong)]"
                >
                  {#each t.skills as s}
                    <li>{@html richText(s)}</li>
                  {/each}
                </ul>
              </div>
            </div>

            {#if t.traps?.length}
              <div class="mt-5 rounded-lg bg-[var(--color-warn-soft)] px-4 py-3.5">
                <h3 class="label mb-2 text-[var(--color-warn)]">Traps</h3>
                <ul
                  class="flex list-disc flex-col gap-2 pl-[1.15rem] text-[13.5px] leading-relaxed marker:text-[var(--color-warn)]"
                >
                  {#each t.traps as trap}
                    <li>{@html richText(trap)}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            <div class="mt-4 flex flex-wrap items-center gap-2.5">
              {#if n}
                <a class="btn btn-sm" href="#/quiz?task={t.id}">Drill task {t.id}</a>
                <span class="text-xs text-[var(--color-ink-3)]">
                  {n} question{n === 1 ? '' : 's'} in the bank
                </span>
              {:else}
                <span class="text-xs text-[var(--color-ink-3)]">
                  No questions written for this task yet.
                </span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
