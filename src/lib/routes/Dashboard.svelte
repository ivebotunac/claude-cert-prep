<script>
  import { domains, meta, questions, flashcards } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { formatDate } from '$lib/util.js'
  import * as q from '$lib/db/queries.js'

  import Stat from '$lib/components/Stat.svelte'
  import Meter from '$lib/components/Meter.svelte'

  const r = $derived(progress.readiness())
  const reading = $derived(progress.readSummary())
  const cards = $derived(progress.cardSummary())
  const recs = $derived(progress.recommendations())

  /** @type {any[]} */
  let weakest = $state([])

  $effect(() => {
    q.weakestTasks(3, 5).then((rows) => (weakest = rows))
  })

  const tone = $derived(
    r.score >= 75 ? 'var(--color-ok)' : r.score >= 45 ? 'var(--color-accent)' : 'var(--color-ink)',
  )

  // The readiness bar is the three weighted contributions, not three arbitrary
  // widths, so the segments always add up to the number beside them.
  const parts = $derived([
    { w: r.coverage * 0.3, c: 'var(--color-accent)' },
    { w: r.retention * 0.3, c: '#4ea3af' },
    { w: r.accuracy * 0.4, c: '#92c7ce' },
  ])
</script>

<h1 class="text-[24px] font-semibold">Where you stand</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
  {meta.items} items in {meta.timeLimitMinutes} minutes, {meta.scenariosPresented} scenarios drawn from
  {meta.scenarioBankSize}. The pass mark is {meta.passingScaled} on a scale of {meta.scaleMin} to
  {meta.scaleMax}. USD {meta.feeUsd} an attempt, valid {meta.validityMonths} months.
</p>

<div class="grid gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-4">
  <div class="bg-[var(--color-surface)] px-4 py-3.5">
    <div class="label">Readiness</div>
    <div class="mt-2 flex items-baseline gap-1.5">
      <span class="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]" style="color: {tone}">
        {r.score}
      </span>
      <span class="font-mono text-[15px] text-[var(--color-ink-3)]">%</span>
    </div>
    <div class="mt-2.5 flex h-1 w-full gap-px bg-[var(--color-line-soft)]">
      {#each parts as p, i (i)}
        <div style="width: {p.w}%; background: {p.c}"></div>
      {/each}
    </div>
    <div class="mt-2 text-[13.5px] text-[var(--color-ink-3)]">
      coverage {r.coverage}, retention {r.retention}, accuracy {r.accuracy}
    </div>
  </div>

  <Stat
    value={`${reading.done}<span class="text-[15px] text-[var(--color-ink-3)]"> / ${reading.total}</span>`}
    label="Objectives read"
    meter={reading.pct}
    sub="{reading.pct}% of the blueprint"
  />
  <Stat
    value={`${cards.due}<span class="text-[15px] text-[var(--color-ink-3)]"> of ${cards.total}</span>`}
    label="Cards due"
    meter={cards.total ? Math.round((cards.learned / cards.total) * 100) : 0}
    sub="{cards.learned} in box three or higher"
  />
  <Stat
    value={progress.totals.answered
      ? `${progress.totals.accuracy}<span class="text-[15px] text-[var(--color-ink-3)]">%</span>`
      : '&ndash;'}
    label="Question accuracy"
    meter={progress.totals.accuracy}
    sub="{progress.totals.answered} of {questions.length} answered"
  />
</div>

<div class="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
  <div class="min-w-0">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Domains</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">
        weight / read / cards / accuracy
      </span>
    </div>
    <div class="card overflow-x-auto">
      <table class="w-full min-w-[520px] font-mono text-[13.5px]">
        <thead>
          <tr>
            <th class="th">Domain</th>
            <th class="th text-right">Wt</th>
            <th class="th text-right">Read</th>
            <th class="th text-right">Cards</th>
            <th class="th text-right">Acc</th>
            <th class="th w-[104px]"></th>
          </tr>
        </thead>
        <tbody>
          {#each domains as d (d.id)}
            {@const p = progress.domainProgress(d.id)}
            <tr>
              <td class="td">
                <span class="inline-flex items-center gap-2.5">
                  <span class="h-[7px] w-[7px] shrink-0" style="background: {d.color}"></span>
                  <span class="font-sans text-[14px]" title={d.name}>{d.shortName}</span>
                </span>
              </td>
              <td class="td text-right text-[var(--color-ink-2)]">{d.weight}%</td>
              <td class="td text-right">{p.read}/{p.readTotal}</td>
              <td class="td text-right">{p.cards.learned}/{p.cards.total}</td>
              <td
                class="td text-right"
                style="color: {p.answered === 0
                  ? 'var(--color-ink-3)'
                  : p.accuracy < 70
                    ? 'var(--color-bad)'
                    : 'var(--color-ink)'}"
              >
                {p.answered ? `${p.accuracy}%` : '–'}
              </td>
              <td class="td font-sans">
                <a href="#/study/{d.id}">Study</a>
                <span class="text-[var(--color-line-strong)]">|</span>
                <a href="#/quiz?domain={d.id}">Quiz</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if weakest.length}
      <div class="mt-6 mb-2.5 flex items-baseline gap-2.5">
        <span class="section">Weakest objectives</span>
        <span class="font-mono text-[12px] text-[var(--color-ink-3)]">minimum three attempts</span>
      </div>
      <div class="card rows">
        {#each weakest as w (w.task)}
          {@const acc = Number(w.accuracy)}
          <div class="flex items-center gap-3 px-3 py-2.5">
            <span
              class="h-[7px] w-[7px] shrink-0"
              style="background: {domains.find((d) => d.id === w.domain)?.color}"
            ></span>
            <span class="w-8 shrink-0 font-mono text-[13.5px]">{w.task}</span>
            <span class="grow"></span>
            <div class="w-20 shrink-0">
              <Meter value={acc} />
            </div>
            <span class="w-11 shrink-0 text-right font-mono text-[13px] text-[var(--color-ink-2)]">
              {w.correct}/{w.attempts}
            </span>
            <a class="shrink-0 text-[13.5px]" href="#/quiz?task={w.task}">Drill</a>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="min-w-0">
    <div class="section mb-2.5">Next move</div>
    <div class="card rows">
      {#each recs as rec, i (i)}
        <div class="flex gap-3 px-3 py-3">
          <span class="shrink-0 pt-0.5 font-mono text-[12px] text-[var(--color-ink-3)]">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div class="min-w-0 grow">
            <div class="text-[14px] leading-relaxed text-pretty">{@html rec.text}</div>
            <a class="mt-1.5 inline-block text-[13.5px]" href={rec.href}>{rec.cta} &rarr;</a>
          </div>
        </div>
      {/each}
    </div>

    <div class="section mt-6 mb-2.5">Mock attempts</div>
    <div class="card">
      {#if !progress.attempts.length}
        <p class="px-3 py-3 text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
          None yet. A full mock is {meta.items} items in {meta.timeLimitMinutes} minutes, weighted to
          the real blueprint. <a href="#/exam">Start one</a>.
        </p>
      {:else}
        <table class="w-full font-mono text-[13px]">
          <thead>
            <tr>
              <th class="th">Date</th>
              <th class="th text-right">Raw</th>
              <th class="th text-right">Scaled</th>
              <th class="th text-right">Result</th>
              <th class="th w-10"></th>
            </tr>
          </thead>
          <tbody>
            {#each progress.attempts as a (a.id)}
              {@const passed = a.scaled >= meta.passingScaled}
              <tr>
                <td class="td">{formatDate(a.finishedAt)}</td>
                <td class="td text-right">{a.correct}/{a.total}</td>
                <td class="td text-right">{a.scaled}</td>
                <td class="td text-right" style="color: {passed ? 'var(--color-ok)' : 'var(--color-bad)'}">
                  {passed ? 'pass' : 'fail'}
                </td>
                <td class="td text-right font-sans">
                  <a href="#/result/{a.id}">Open</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <p class="mt-3 font-mono text-[12px] leading-relaxed text-[var(--color-ink-3)]">
      {questions.length} questions and {flashcards.length} cards, attached read only.
    </p>
  </div>
</div>
