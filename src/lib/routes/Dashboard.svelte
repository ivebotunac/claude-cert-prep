<script>
  import { domains, meta, questions, flashcards } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { formatDate } from '$lib/util.js'
  import * as q from '$lib/db/queries.js'

  import Stat from '$lib/components/Stat.svelte'
  import Meter from '$lib/components/Meter.svelte'
  import DomainBadge from '$lib/components/DomainBadge.svelte'

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
    r.score >= 75 ? 'var(--color-ok)' : r.score >= 45 ? 'var(--color-warn)' : 'var(--color-ink)',
  )
</script>

<h1 class="mb-1.5 text-[27px] font-semibold">Where you stand</h1>
<p class="mb-7 max-w-[68ch] text-[var(--color-ink-2)]">
  {meta.items} items in {meta.timeLimitMinutes} minutes, {meta.scenariosPresented} scenarios drawn from
  {meta.scenarioBankSize}. Pass at {meta.passingScaled} on a {meta.scaleMin}&ndash;{meta.scaleMax} scale.
  ${meta.feeUsd} per attempt, valid {meta.validityMonths} months.
</p>

<div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
  <Stat
    value={`${r.score}<span class="text-lg text-[var(--color-ink-3)]">%</span>`}
    label="Readiness"
    sub="coverage 30 / retention 30 / accuracy 40"
    {tone}
  />
  <Stat
    value={`${reading.done}<span class="text-lg text-[var(--color-ink-3)]">/${reading.total}</span>`}
    label="Objectives read"
    sub="{reading.pct}% of the blueprint"
  />
  <Stat
    value={cards.due}
    label="Cards due"
    sub="{cards.learned} of {cards.total} in box 4 or higher"
  />
  <Stat
    value={progress.totals.answered
      ? `${progress.totals.accuracy}<span class="text-lg text-[var(--color-ink-3)]">%</span>`
      : '&ndash;'}
    label="Question accuracy"
    sub="{progress.totals.answered} answers logged"
  />
</div>

<h2 class="mb-3 mt-9 text-lg font-semibold">By domain</h2>
<div class="card divide-y divide-[var(--color-line)] px-5">
  {#each domains as d (d.id)}
    {@const p = progress.domainProgress(d.id)}
    <div class="flex items-center gap-3.5 py-3">
      <DomainBadge id={d.id} />
      <div class="min-w-0 grow">
        <div class="text-[14.5px] font-medium">
          {d.name}
          <span class="ml-1 text-xs font-normal text-[var(--color-ink-3)]">
            {d.weight}% &middot; ~{d.expectedItems} items
          </span>
        </div>
        <div class="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">
          {p.read}/{p.readTotal} objectives &middot;
          {p.cards.learned}/{p.cards.total} cards learned &middot;
          {p.answered ? `${p.accuracy}% over ${p.answered} answers` : 'no questions attempted'}
        </div>
        <div class="mt-2"><Meter value={p.readPct} /></div>
      </div>
      <div class="flex shrink-0 gap-1.5">
        <a class="btn btn-sm" href="#/study/{d.id}">Study</a>
        <a class="btn btn-sm" href="#/quiz?domain={d.id}">Quiz</a>
      </div>
    </div>
  {/each}
</div>

<h2 class="mb-3 mt-9 text-lg font-semibold">Next move</h2>
<div class="card p-5">
  <ul class="flex flex-col gap-3">
    {#each recs as rec}
      <li class="flex flex-wrap items-center gap-2.5 text-[14.5px]">
        <span class="grow">{@html rec.text}</span>
        <a class="btn btn-sm" href={rec.href}>{rec.cta}</a>
      </li>
    {/each}
  </ul>
</div>

{#if weakest.length}
  <h2 class="mb-1.5 mt-9 text-lg font-semibold">Weakest objectives</h2>
  <p class="mb-3 text-sm text-[var(--color-ink-2)]">
    Ranked by accuracy across every answer you have given, with at least three attempts.
  </p>
  <div class="card divide-y divide-[var(--color-line)] px-5">
    {#each weakest as w}
      <div class="flex items-center gap-3.5 py-2.5">
        <DomainBadge id={w.domain} size="sm" />
        <div class="grow">
          <div class="text-sm font-medium">Task {w.task}</div>
          <div class="mt-1"><Meter value={Number(w.accuracy)} height="h-1" /></div>
        </div>
        <span class="font-mono text-sm text-[var(--color-ink-2)]">
          {w.correct}/{w.attempts}
        </span>
        <a class="btn btn-sm btn-ghost" href="#/quiz?task={w.task}">Drill</a>
      </div>
    {/each}
  </div>
{/if}

<h2 class="mb-3 mt-9 text-lg font-semibold">Mock exam history</h2>
<div class="card p-5">
  {#if !progress.attempts.length}
    <p class="text-sm text-[var(--color-ink-2)]">
      No attempts yet. A full mock is {meta.items} items in {meta.timeLimitMinutes} minutes, weighted
      to the real blueprint. <a href="#/exam" class="underline">Start one</a>.
    </p>
  {:else}
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[11.5px] uppercase tracking-wider text-[var(--color-ink-3)]">
          <th class="pb-2 text-left font-semibold">Date</th>
          <th class="pb-2 text-right font-semibold">Correct</th>
          <th class="pb-2 text-right font-semibold">Scaled</th>
          <th class="pb-2 text-left font-semibold">Result</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each progress.attempts as a (a.id)}
          <tr class="border-t border-[var(--color-line)]">
            <td class="py-2">{formatDate(a.finishedAt)}</td>
            <td class="py-2 text-right font-mono">{a.correct}/{a.total}</td>
            <td class="py-2 text-right font-mono">{a.scaled}</td>
            <td class="py-2">
              <span
                class="pill border-transparent {a.scaled >= meta.passingScaled
                  ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
                  : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'}"
              >
                {a.scaled >= meta.passingScaled ? 'Pass' : 'Fail'}
              </span>
            </td>
            <td class="py-2 text-right">
              <a class="btn btn-sm btn-ghost" href="#/result/{a.id}">Report</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="mt-4 text-xs text-[var(--color-ink-3)]">
      Scaled scores are approximated: Anthropic publishes the {meta.passingScaled} cut but not the
      raw-to-scaled mapping, so 720 is anchored at 70% correct.
    </p>
  {/if}
</div>

<p class="mt-9 text-xs text-[var(--color-ink-3)]">
  Bank holds {questions.length} questions and {flashcards.length} flashcards.
  Progress is stored locally via {progress.storage.backend}.
</p>
