<script>
  /**
   * The guide's own answer to "how do I learn this".
   *
   * Section 7 is seven things to build, section 8 is four hands-on exercises with
   * steps. Both were buried in a reading list before, which is the wrong place
   * for the only part of the material you are meant to do rather than read.
   */
  import { exam, context, domainById } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { richText } from '$lib/util.js'

  import Meter from '$lib/components/Meter.svelte'

  const prepIds = $derived(exam.prepPlan.map((/** @type {any} */ _, /** @type {number} */ i) => `prep-${i + 1}`))
  const exerciseIds = $derived(exam.exercises.map((/** @type {any} */ e) => `ex-${e.id}`))

  const prep = $derived(progress.practiceSummary(prepIds))
  const exercises = $derived(progress.practiceSummary(exerciseIds))
  const all = $derived(progress.practiceSummary([...prepIds, ...exerciseIds]))

  /** @type {Set<string>} */
  let open = $state(new Set())

  /** @param {string} id */
  function toggleOpen(id) {
    const s = new Set(open)
    s.has(id) ? s.delete(id) : s.add(id)
    open = s
  }
</script>

{#snippet tick(/** @type {string} */ id, /** @type {'prep' | 'exercise'} */ kind)}
  {@const done = progress.practice.has(id)}
  <button
    type="button"
    role="checkbox"
    aria-checked={done}
    aria-label="Mark done"
    class="mt-0.5 grid h-[21px] w-[21px] shrink-0 place-items-center border transition-colors
      {done
        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
        : 'border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:border-[var(--color-ink-3)]'}"
    onclick={() => progress.togglePractice(id, kind)}
  >
    {#if done}
      <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8">
        <path d="M1.5 5.2 4 7.5 8.5 2.6" />
      </svg>
    {/if}
  </button>
{/snippet}

{#snippet domainMarks(/** @type {string[]} */ ids)}
  <div class="flex shrink-0 flex-wrap gap-2">
    {#each ids as id (id)}
      {@const d = domainById[id]}
      <span class="inline-flex items-center gap-1.5" title={d?.name ?? id}>
        <span class="h-[7px] w-[7px] shrink-0" style="background: {d?.color ?? 'var(--color-ink-3)'}"></span>
        <span class="font-mono text-[12px] text-[var(--color-ink-3)]">{id}</span>
      </span>
    {/each}
  </div>
{/snippet}

<h1 class="text-[24px] font-semibold">Practice</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)] text-pretty">
  The guide names seven things to build and four exercises to work through. Reading tells you what
  the exam covers; this is the part you are meant to do. The exam tests judgement earned by having
  debugged an agentic loop, not by having read about one.
</p>

<div class="mb-6 grid gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
  {#each [{ label: 'Built', s: all }, { label: 'Preparation steps', s: prep }, { label: 'Exercises', s: exercises }] as tile (tile.label)}
    {@const s = tile.s}
    <div class="bg-[var(--color-surface)] px-4 py-3.5">
      <div class="label">{tile.label}</div>
      <div class="mt-2 flex items-baseline gap-1.5">
        <span class="font-mono text-[26px] leading-none font-medium tracking-[-0.02em]">{s.done}</span>
        <span class="font-mono text-[13px] text-[var(--color-ink-3)]">/ {s.total}</span>
      </div>
      <div class="mt-2.5"><Meter value={s.pct} tone={s.pct === 100 ? 'ok' : 'accent'} /></div>
    </div>
  {/each}
</div>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
  <div class="min-w-0">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Build these</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">section 7 of the guide</span>
    </div>
    <div class="card rows">
      {#each exam.prepPlan as p, i (p.title)}
        {@const id = `prep-${i + 1}`}
        {@const done = progress.practice.has(id)}
        <div class="flex items-start gap-3 px-4 py-3.5 {done ? 'bg-[var(--color-ok-soft)]' : ''}">
          {@render tick(id, 'prep')}
          <span class="w-6 shrink-0 pt-0.5 font-mono text-[12.5px] text-[var(--color-ink-3)]">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div class="min-w-0 grow">
            <div class="text-[14.5px] font-medium">{@html richText(p.title)}</div>
            <div class="mt-1 text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
              {@html richText(p.detail)}
            </div>
          </div>
          {@render domainMarks(p.domains)}
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Hands-on exercises</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">section 8, with the guide's own steps</span>
    </div>
    <div class="card rows">
      {#each exam.exercises as ex (ex.id)}
        {@const id = `ex-${ex.id}`}
        {@const done = progress.practice.has(id)}
        {@const isOpen = open.has(ex.id)}
        <div class={done ? 'bg-[var(--color-ok-soft)]' : ''}>
          <div class="flex items-start gap-3 px-4 py-3.5">
            {@render tick(id, 'exercise')}
            <button
              type="button"
              class="flex min-w-0 grow items-start gap-3 text-left"
              onclick={() => toggleOpen(ex.id)}
              aria-expanded={isOpen}
            >
              <span class="shrink-0 pt-0.5 font-mono text-[12.5px] text-[var(--color-accent)]">{ex.id}</span>
              <span class="min-w-0 grow">
                <span class="block text-[14.5px] font-medium">{@html richText(ex.title)}</span>
                <span class="mt-1 block text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
                  {@html richText(ex.objective)}
                </span>
              </span>
              <span
                class="shrink-0 pt-0.5 font-mono text-[13px] text-[var(--color-ink-3)] transition-transform"
                style="transform: rotate({isOpen ? 90 : 0}deg)"
                aria-hidden="true">&rsaquo;</span
              >
            </button>
          </div>
          {#if isOpen}
            <div class="border-t border-[var(--color-line-soft)] bg-[var(--color-surface-3)] px-4 py-3.5 pl-[3.5rem]">
              <div class="label mb-2">Steps</div>
              <ol class="flex list-decimal flex-col gap-2 pl-5 marker:font-mono marker:text-[var(--color-ink-3)]">
                {#each ex.steps as step, i (i)}
                  <li class="text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
                    {@html richText(step)}
                  </li>
                {/each}
              </ol>
              <div class="mt-3.5">{@render domainMarks(ex.domains)}</div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="min-w-0">
    <div class="mb-2.5 flex items-baseline gap-2.5">
      <span class="section">Suggested order</span>
      <span class="font-mono text-[12px] text-[var(--color-ink-3)]">researched, not the guide</span>
    </div>
    <div class="card rows">
      {#each context.studySequence as step, i (i)}
        <div class="flex items-start gap-3 px-4 py-3">
          <span class="shrink-0 pt-px font-mono text-[12.5px] text-[var(--color-ink-3)]">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span class="min-w-0 text-[14px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
            {@html richText(step)}
          </span>
        </div>
      {/each}
    </div>

    <div class="mt-6 mb-2.5"><span class="section">Not on the path, still worth your time</span></div>
    <div class="card rows">
      {#each context.learningPath.notOnPath as item (item.title)}
        <div class="px-4 py-3">
          <div class="text-[14px] font-medium">{@html richText(item.title)}</div>
          <p class="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-3)] text-pretty">
            {@html richText(item.note)}
          </p>
        </div>
      {/each}
    </div>

    <p class="mt-4 font-mono text-[12px] leading-relaxed text-[var(--color-ink-3)]">
      Ticks are stored beside your reading marks and survive an export. They do not feed the
      readiness figure, which stays coverage, retention and accuracy.
    </p>
  </div>
</div>
