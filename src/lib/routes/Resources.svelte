<script>
  import { exam, context, domainById } from '$lib/content.js'
  import { richText } from '$lib/util.js'

  const log = context.logistics
  const path = context.learningPath

  // The guide's own link groups, then the four path courses, then the researched
  // set last so it is never mistaken for something the guide published.
  const readingGroups = [
    ...exam.resources,
    {
      category: 'Partner Network courses',
      items: path.courses.map((/** @type {any} */ c) => ({
        title: `${c.order}. ${c.title}`,
        url: '',
        note: c.why,
      })),
    },
    { category: 'Further reading', items: context.extraResources },
  ]
</script>

{#snippet domainPills(/** @type {string[]} */ ids)}
  <div class="flex shrink-0 flex-wrap gap-2">
    {#each ids as id (id)}
      {@const d = domainById[id]}
      <span class="inline-flex items-center gap-2" title={d?.name ?? id}>
        <span class="h-[7px] w-[7px] shrink-0" style="background: {d?.color ?? 'var(--color-ink-3)'}"></span>
        <span class="font-mono text-[12.5px] text-[var(--color-ink-2)]">{id}</span>
      </span>
    {/each}
  </div>
{/snippet}

{#snippet textPanel(/** @type {string} */ title, /** @type {string} */ body)}
  <details class="group">
    <summary
      class="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[15px] hover:bg-[var(--color-surface-2)] [&::-webkit-details-marker]:hidden"
    >
      <span
        class="shrink-0 font-mono text-[13px] text-[var(--color-ink-3)] transition-transform group-open:rotate-90"
        aria-hidden="true">&rsaquo;</span
      >
      <span class="min-w-0 grow">{@html richText(title)}</span>
    </summary>
    <div class="px-4 pb-4 pl-10 text-[15px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
      {@html richText(body)}
    </div>
  </details>
{/snippet}

{#snippet scopeList(/** @type {string[]} */ items, /** @type {string} */ mark, /** @type {string} */ tone)}
  <ul class="grid gap-2.5 p-4 sm:grid-cols-2">
    {#each items as s (s)}
      <li class="flex gap-2.5 text-[14px] leading-relaxed">
        <span class="mt-px shrink-0 font-mono text-[13px]" style="color: {tone}" aria-hidden="true">{mark}</span>
        <span class="min-w-0 text-[var(--color-ink-2)]">{@html richText(s)}</span>
      </li>
    {/each}
  </ul>
{/snippet}

<h1 class="text-[24px] font-semibold">Everything else</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
  Exam strategy, the tensions the scenarios are built on, the reading list, and what the guide puts
  in and out of scope. None of it is scored on its own, and all of it shapes how the scored questions
  read.
</p>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
  <div class="min-w-0">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Exam strategy</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">how the official samples behave</span>
    </div>
    <div class="card divide-y divide-[var(--color-line-soft)]">
      {#each exam.strategy as s (s.title)}
        {@render textPanel(s.title, s.body)}
      {/each}
    </div>

    <div class="mt-6 mb-1.5 flex items-baseline gap-2.5">
      <span class="section">The four tensions</span>
    </div>
    <p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
      {@html richText(context.tensions.intro)}
    </p>
    <div class="card rows">
      {#each context.tensions.items as item (item.t)}
        <div class="px-4 py-3.5">
          <div class="text-[15px] font-medium">{@html richText(item.t)}</div>
          <p class="mt-1 max-w-[80ch] text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
            {@html richText(item.b)}
          </p>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-1.5"><span class="section">Distractor patterns</span></div>
    <p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
      Every one of these turns up as a wrong answer in the official samples. Recognising the pattern is
      often faster than reasoning the option through.
    </p>
    <div class="card rows">
      {#each context.distractorPatterns as p, i (i)}
        <div class="flex items-start gap-3 px-4 py-2.5">
          <span class="mt-px shrink-0 font-mono text-[13px] text-[var(--color-bad)]" aria-hidden="true">&times;</span>
          <span class="min-w-0 text-[14px] leading-relaxed text-[var(--color-ink-2)]">{@html richText(p)}</span>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-1.5"><span class="section">In scope</span></div>
    <p class="mb-2.5 text-[14px] text-[var(--color-ink-2)]">
      The {exam.inScope.length} areas the guide says questions are drawn from.
    </p>
    <div class="card">{@render scopeList(exam.inScope, '+', 'var(--color-ok)')}</div>

    <div class="mt-6 mb-1.5"><span class="section">Explicitly out of scope</span></div>
    <p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
      The guide rules these out, so an option leaning on one is very likely a distractor. Recognising
      an excluded topic is often faster than reasoning about the rest of the option.
    </p>
    <div class="card">{@render scopeList(exam.outOfScope, '×', 'var(--color-bad)')}</div>
  </div>

  <div class="min-w-0">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Reading list</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">links need a connection</span>
    </div>
    <div class="flex flex-col gap-6">
      {#each readingGroups as g (g.category)}
        <div>
          <div class="label mb-1.5">{@html richText(g.category)}</div>
          <div class="card rows">
            {#each g.items as item, i (i)}
              <div class="px-4 py-2.5">
                {#if item.url}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    class="text-[14px] font-medium"
                  >
                    {@html richText(item.title)}<span
                      class="ml-1 font-mono text-[12px] text-[var(--color-ink-3)]"
                      aria-hidden="true">&#8599;</span
                    >
                  </a>
                {:else}
                  <span class="text-[14px] font-medium">{@html richText(item.title)}</span>
                {/if}
                <p class="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-3)] text-pretty">
                  {@html richText(item.note)}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-2.5"><span class="section">Technologies named in the guide</span></div>
    <div class="card rows">
      {#each exam.technologies as t (t.name)}
        <div class="px-4 py-2.5">
          <div class="text-[14px] font-semibold">{@html richText(t.name)}</div>
          <div class="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
            {@html richText(t.items)}
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-2.5">
      <span class="section">Exam day</span>
      <span class="ml-2.5 font-mono text-[12px] text-[var(--color-ink-3)]">researched, not the guide</span>
    </div>
    <div class="card rows">
      <div class="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
        <span class="text-[var(--color-ink-2)]">Test time</span><span class="font-mono">{log.testTimeMinutes} min</span>
      </div>
      <div class="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
        <span class="text-[var(--color-ink-2)]">Seat time</span><span class="font-mono">{log.seatTimeMinutes} min</span>
      </div>
      <div class="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
        <span class="text-[var(--color-ink-2)]">Language</span><span>{@html richText(log.language)}</span>
      </div>
      <div class="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
        <span class="text-[var(--color-ink-2)]">Badge</span><span>{@html richText(log.badge)}</span>
      </div>
      {#each log.onvue as rule, i (i)}
        <div class="flex items-start gap-3 px-4 py-2.5">
          <span class="mt-1 h-1 w-1 shrink-0 bg-[var(--color-accent)]" aria-hidden="true"></span>
          <span class="min-w-0 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">{@html richText(rule)}</span>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-2.5"><span class="section">Policies</span></div>
    <div class="card divide-y divide-[var(--color-line-soft)]">
      {#each exam.policies as p (p.title)}
        {@render textPanel(p.title, p.body)}
      {/each}
    </div>
  </div>
</div>
