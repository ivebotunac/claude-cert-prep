<script>
  import { context, domainById } from '$lib/content.js'
  import { richText, formatDate } from '$lib/util.js'

  const path = context.learningPath
  const log = context.logistics

  // Parsed as a local date so the day does not shift backwards in a west-of-UTC zone.
  const researched = (() => {
    const [y, m, d] = String(context.researchedOn).split('-').map(Number)
    return formatDate(new Date(y, m - 1, d).getTime())
  })()
</script>

<h1 class="text-[24px] font-semibold">The path and the day</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">{@html richText(path.intro)}</p>

<h2 class="section mt-6 mb-2.5">Course order</h2>
<div class="flex flex-col gap-2.5">
  {#each path.courses as course (course.order)}
    <details class="card group px-5">
      <summary
        class="-mx-5 flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 [&::-webkit-details-marker]:hidden"
      >
        <span
          class="grid h-7 w-7 shrink-0 place-items-center bg-[var(--color-accent-soft)] font-mono text-[14px] font-semibold text-[var(--color-accent)]"
        >{course.order}</span>
        <span class="min-w-0 grow text-[16.5px] font-medium">{@html richText(course.title)}</span>
        <span class="flex flex-wrap gap-1.5">
          {#each course.mapsTo as id (id)}
            {@const d = domainById[id]}
            <span
              class="pill border-transparent"
              style="background: {d.color}22; color: {d.color}"
            >{id} &middot; {d.shortName}</span>
          {/each}
        </span>
        <span
          class="shrink-0 text-[var(--color-ink-3)] transition-transform group-open:rotate-90"
          aria-hidden="true"
        >&rsaquo;</span>
      </summary>

      <div class="border-t border-[var(--color-line)] py-4 text-[16.5px] leading-relaxed">
        <p class="text-[var(--color-ink-2)]">{@html richText(course.summary)}</p>

        <p class="label mt-4">Why it matters here</p>
        <p class="mt-1.5">{@html richText(course.why)}</p>

        {#if course.modules?.length}
          <p class="label mt-4">Modules, {course.modules.length} in all</p>
          <ol class="mt-1.5 list-decimal pl-5 marker:text-[var(--color-ink-3)]">
            {#each course.modules as m, i (i)}
              <li class="py-0.5 pl-0.5">{@html richText(m)}</li>
            {/each}
          </ol>
        {/if}
      </div>
    </details>
  {/each}
</div>

<h2 class="section mt-6 mb-2.5">Not on the path, still worth your time</h2>
<div class="card divide-y divide-[var(--color-line-soft)] px-5">
  {#each path.notOnPath as item (item.title)}
    <div class="py-3.5">
      <div class="text-[16.5px] font-medium">{@html richText(item.title)}</div>
      <p class="mt-1 text-[15.5px] leading-relaxed text-[var(--color-ink-2)]">
        {@html richText(item.note)}
      </p>
    </div>
  {/each}
</div>

<h2 class="section mt-6 mb-2.5">Suggested sequence</h2>
<div class="card p-5">
  <ol class="flex flex-col gap-3">
    {#each context.studySequence as step, i (i)}
      <li class="flex items-start gap-3 text-[16.5px] leading-relaxed">
        <span
          class="mt-px grid h-[21px] w-[21px] shrink-0 place-items-center bg-[var(--color-surface-2)] font-mono text-[13.5px] font-semibold text-[var(--color-ink-2)]"
        >{i + 1}</span>
        <span class="min-w-0">{@html richText(step)}</span>
      </li>
    {/each}
  </ol>
</div>

<h2 class="section mt-6 mb-1.5">The four tensions</h2>
<p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
  {@html richText(context.tensions.intro)}
</p>
<div class="grid gap-3.5 sm:grid-cols-2">
  {#each context.tensions.items as item (item.t)}
    <div class="card p-5">
      <h3 class="text-[17px] font-semibold">{@html richText(item.t)}</h3>
      <p class="mt-2 text-[16px] leading-relaxed text-[var(--color-ink-2)]">
        {@html richText(item.b)}
      </p>
    </div>
  {/each}
</div>

<h2 class="section mt-6 mb-1.5">Distractor patterns to recognise</h2>
<p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
  Every one of these turns up as a wrong answer in the official samples. Spotting the pattern is
  often faster than reasoning the option through.
</p>
<div class="card divide-y divide-[var(--color-line-soft)] px-5">
  {#each context.distractorPatterns as p, i (i)}
    <div class="flex items-start gap-3 py-2.5 text-[16.5px] leading-relaxed">
      <span
        class="mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center bg-[var(--color-bad-soft)] text-[12.5px] font-semibold text-[var(--color-bad)]"
        aria-hidden="true"
      >&times;</span>
      <span class="min-w-0">{@html richText(p)}</span>
    </div>
  {/each}
</div>

<h2 class="section mt-6 mb-2.5">Exam day mechanics</h2>
<div class="grid gap-3.5 sm:grid-cols-2">
  <div class="card p-5">
    <h3 class="mb-3 text-[17px] font-semibold">At a glance</h3>
    <table class="w-full text-[16px]">
      <tbody>
        <tr class="border-b border-[var(--color-line)]">
          <th class="py-2 pr-3 text-left font-normal text-[var(--color-ink-2)]">Language</th>
          <td class="py-2 text-right font-medium">{@html richText(log.language)}</td>
        </tr>
        <tr class="border-b border-[var(--color-line)]">
          <th class="py-2 pr-3 text-left font-normal text-[var(--color-ink-2)]">Test time</th>
          <td class="py-2 text-right font-mono">{log.testTimeMinutes} min</td>
        </tr>
        <tr class="border-b border-[var(--color-line)]">
          <th class="py-2 pr-3 text-left font-normal text-[var(--color-ink-2)]">Seat time</th>
          <td class="py-2 text-right font-mono">{log.seatTimeMinutes} min</td>
        </tr>
        <tr>
          <th class="py-2 pr-3 text-left font-normal text-[var(--color-ink-2)]">Badge</th>
          <td class="py-2 text-right">{@html richText(log.badge)}</td>
        </tr>
      </tbody>
    </table>
    <p class="mt-3.5 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
      {@html richText(log.eligibility)}
    </p>
  </div>

  <div class="card p-5">
    <h3 class="mb-3 text-[17px] font-semibold">Online proctoring (OnVUE)</h3>
    <ul class="flex flex-col gap-2.5">
      {#each log.onvue as rule, i (i)}
        <li class="flex items-start gap-2.5 text-[16px] leading-relaxed">
          <span class="mt-2 h-1.5 w-1.5 shrink-0 bg-[var(--color-accent)]" aria-hidden="true"
          ></span>
          <span class="min-w-0">{@html richText(rule)}</span>
        </li>
      {/each}
    </ul>
  </div>
</div>

<h2 class="section mt-6 mb-2.5">The credential family</h2>
<div class="card overflow-x-auto overflow-x-auto p-5">
  <table class="w-full min-w-[520px] text-[14px]">
    <thead>
      <tr class="text-[13px] uppercase tracking-wider text-[var(--color-ink-3)]">
        <th class="px-2 pb-2 text-left font-semibold">Code</th>
        <th class="px-2 pb-2 text-left font-semibold">Name</th>
        <th class="px-2 pb-2 text-left font-semibold">Note</th>
      </tr>
    </thead>
    <tbody>
      {#each context.credentials as c (c.code)}
        <tr class="border-t border-[var(--color-line)] {c.you ? 'bg-[var(--color-accent-soft)]' : ''}">
          <td class="px-2 py-2 font-mono whitespace-nowrap {c.you ? 'font-semibold text-[var(--color-accent)]' : ''}">
            {c.code}
          </td>
          <td class="px-2 py-2">{@html richText(c.name)}</td>
          <td class="px-2 py-2 text-[var(--color-ink-2)]">{@html richText(c.note)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<h2 class="section mt-6 mb-1.5">Partner tiers</h2>
<p class="mb-2.5 max-w-[76ch] text-[14px] text-[var(--color-ink-2)] text-pretty">
  {@html richText(context.partnerTiers.intro)}
</p>
<div class="card overflow-x-auto overflow-x-auto p-5">
  <table class="w-full min-w-[560px] text-[14px]">
    <thead>
      <tr class="text-[13px] uppercase tracking-wider text-[var(--color-ink-3)]">
        <th class="px-2 pb-2 text-left font-semibold">Tier</th>
        <th class="px-2 pb-2 text-left font-semibold">Certifications</th>
        <th class="px-2 pb-2 text-left font-semibold">Joint customers</th>
        <th class="px-2 pb-2 text-left font-semibold">Stories</th>
        <th class="px-2 pb-2 text-left font-semibold">Notes</th>
      </tr>
    </thead>
    <tbody>
      {#each context.partnerTiers.tiers as t (t.name)}
        <tr class="border-t border-[var(--color-line)]">
          <td class="px-2 py-2 font-medium whitespace-nowrap">{@html richText(t.name)}</td>
          <td class="px-2 py-2 font-mono">{t.certs}</td>
          <td class="px-2 py-2 text-[var(--color-ink-2)]">{@html richText(t.customers)}</td>
          <td class="px-2 py-2 font-mono">{t.stories}</td>
          <td class="px-2 py-2 text-[var(--color-ink-2)]">{@html richText(t.extra)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<h2 class="section mt-6 mb-2.5">Be careful with</h2>
<div class="card divide-y divide-[var(--color-line-soft)] px-5">
  {#each context.communityCaveats as c, i (i)}
    <div class="flex items-start gap-3 py-2.5 text-[16.5px] leading-relaxed">
      <span
        class="mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center bg-[var(--color-warn-soft)] text-[12.5px] font-semibold text-[var(--color-warn)]"
        aria-hidden="true"
      >!</span>
      <span class="min-w-0">{@html richText(c)}</span>
    </div>
  {/each}
</div>

<p class="mt-9 max-w-[68ch] text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
  Everything on this page is researched context gathered on {researched}, not the official exam
  guide. Where the two disagree, the guide wins.
</p>
