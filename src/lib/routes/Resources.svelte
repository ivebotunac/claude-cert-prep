<script>
  import { exam, context, domainById } from '$lib/content.js'
  import { richText } from '$lib/util.js'

  // The guide's own link groups, with the researched set appended last so it is
  // never mistaken for something the guide published.
  const readingGroups = [
    ...exam.resources,
    { category: 'Further reading', items: context.extraResources },
  ]
</script>

{#snippet domainPills(/** @type {string[]} */ ids)}
  <div class="flex shrink-0 flex-wrap gap-1.5">
    {#each ids as id (id)}
      {@const d = domainById[id]}
      <span
        class="pill border-transparent"
        style="background: {d?.color ?? 'var(--color-ink-3)'}22; color: {d?.color ??
          'var(--color-ink-2)'}"
        title={d?.name ?? id}
      >
        {id} &middot; {d?.shortName ?? 'Unknown'}
      </span>
    {/each}
  </div>
{/snippet}

{#snippet textPanel(/** @type {string} */ title, /** @type {string} */ body)}
  <details class="group">
    <summary
      class="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-[14.5px] font-medium hover:bg-[var(--color-surface-2)] [&::-webkit-details-marker]:hidden"
    >
      <span class="min-w-0 grow">{@html richText(title)}</span>
      <span
        class="shrink-0 font-mono text-[var(--color-ink-3)] transition-transform group-open:rotate-90"
        aria-hidden="true">&rsaquo;</span
      >
    </summary>
    <div class="px-5 pb-4 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
      {@html richText(body)}
    </div>
  </details>
{/snippet}

<h1 class="mb-1.5 text-[27px] font-semibold">Everything else</h1>
<p class="mb-7 max-w-[68ch] text-[var(--color-ink-2)]">
  Exam strategy, the official preparation plan, the hands-on exercises and the reading list, plus
  what the guide puts in and out of scope. None of it is scored on its own, and all of it shapes how
  the scored questions read.
</p>

<h2 class="mb-1.5 text-lg font-semibold">Exam strategy</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  How the official sample questions behave, and what that tells you when two options both look
  reasonable.
</p>
<div class="card divide-y divide-[var(--color-line)] overflow-hidden">
  {#each exam.strategy as s (s.title)}
    {@render textPanel(s.title, s.body)}
  {/each}
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Preparation plan</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  The guide's own steps, in its order, with the domains each one feeds.
</p>
<div class="card divide-y divide-[var(--color-line)] px-5">
  {#each exam.prepPlan as p, i (p.title)}
    <div class="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5">
      <div class="min-w-0 grow basis-[15rem]">
        <div class="text-[14.5px] font-medium">
          <span class="mr-1.5 font-mono text-xs text-[var(--color-ink-3)]">{i + 1}</span>
          {@html richText(p.title)}
        </div>
        <div class="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          {@html richText(p.detail)}
        </div>
      </div>
      {@render domainPills(p.domains)}
    </div>
  {/each}
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Hands-on exercises</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  These are the guide's own exercises, and the fastest route to the judgment the exam tests. Reading
  about an agentic loop is not the same as having debugged one.
</p>
<div class="card divide-y divide-[var(--color-line)] overflow-hidden">
  {#each exam.exercises as ex (ex.id)}
    <details class="group">
      <summary
        class="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-[14.5px] font-medium hover:bg-[var(--color-surface-2)] [&::-webkit-details-marker]:hidden"
      >
        <span class="min-w-0 grow">
          <span class="font-mono text-[var(--color-clay-text)]">{ex.id}</span>
          &middot;
          {@html richText(ex.title)}
        </span>
        <span
          class="shrink-0 font-mono text-[var(--color-ink-3)] transition-transform group-open:rotate-90"
          aria-hidden="true">&rsaquo;</span
        >
      </summary>
      <div class="px-5 pb-4">
        <p class="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          {@html richText(ex.objective)}
        </p>
        <ol
          class="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-relaxed marker:font-mono marker:text-[var(--color-ink-3)]"
        >
          {#each ex.steps as step, i (i)}
            <li>{@html richText(step)}</li>
          {/each}
        </ol>
        <div class="mt-4">{@render domainPills(ex.domains)}</div>
      </div>
    </details>
  {/each}
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Reading list</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  Every link the guide gives. Further reading at the end is researched rather than official, so
  treat it as background. All links open in a new tab and need a connection.
</p>
<div class="grid gap-3.5 lg:grid-cols-2">
  {#each readingGroups as g (g.category)}
    <div class="card px-5 py-4">
      <span class="label">{@html richText(g.category)}</span>
      <div class="mt-2.5 divide-y divide-[var(--color-line)]">
        {#each g.items as item, i (i)}
          <div class="py-2.5 first:pt-0 last:pb-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener"
              class="text-[14px] font-medium underline decoration-[var(--color-line-strong)] underline-offset-2 hover:text-[var(--color-clay-text)]"
            >
              {@html richText(item.title)}<span
                class="ml-1 font-mono text-[11px] text-[var(--color-ink-3)]"
                aria-hidden="true">&#8599;</span
              >
            </a>
            <p class="mt-0.5 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
              {@html richText(item.note)}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">In scope</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  The {exam.inScope.length} areas the guide says questions are drawn from.
</p>
<div class="card p-5">
  <ul class="grid gap-2.5 sm:grid-cols-2">
    {#each exam.inScope as s (s)}
      <li class="flex gap-2.5 text-[14px] leading-relaxed">
        <span class="mt-px shrink-0 font-mono text-[var(--color-ok)]" aria-hidden="true">&check;</span
        >
        <span class="min-w-0">{@html richText(s)}</span>
      </li>
    {/each}
  </ul>
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Explicitly out of scope</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  The guide rules these out, so an option leaning on one of them is very likely a distractor. Worth
  reading twice: recognising an excluded topic is often faster than reasoning about the rest of the
  option.
</p>
<div class="card p-5">
  <ul class="grid gap-2.5 sm:grid-cols-2">
    {#each exam.outOfScope as s (s)}
      <li class="flex gap-2.5 text-[14px] leading-relaxed">
        <span class="mt-px shrink-0 font-mono text-[var(--color-bad)]" aria-hidden="true">&times;</span
        >
        <span class="min-w-0">{@html richText(s)}</span>
      </li>
    {/each}
  </ul>
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Technologies and concepts</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  Named in the guide as the surface questions are written against.
</p>
<div class="card p-5">
  <table class="w-full text-left text-sm">
    <tbody>
      {#each exam.technologies as t (t.name)}
        <tr class="border-t border-[var(--color-line)] first:border-0">
          <th
            scope="row"
            class="w-[30%] min-w-[7.5rem] py-2.5 pr-4 align-top font-semibold"
          >
            {@html richText(t.name)}
          </th>
          <td class="py-2.5 align-top leading-relaxed text-[var(--color-ink-2)]">
            {@html richText(t.items)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<h2 class="mb-1.5 mt-9 text-lg font-semibold">Policies</h2>
<p class="mb-3 max-w-[68ch] text-sm text-[var(--color-ink-2)]">
  Scoring, scheduling, identification, retakes and conduct, as the guide states them.
</p>
<div class="card divide-y divide-[var(--color-line)] overflow-hidden">
  {#each exam.policies as p (p.title)}
    {@render textPanel(p.title, p.body)}
  {/each}
</div>
