<script>
  import { domainById, scenarioById } from '$lib/content.js'
  import { progress } from '$lib/stores/progress.svelte.js'
  import { presentOptions, richText, isCorrect as checkCorrect } from '$lib/util.js'

  /**
   * @type {{
   *   question: any,
   *   salt?: string,
   *   selected?: string[],
   *   revealed?: boolean,
   *   showScenario?: boolean,
   *   counter?: string,
   *   onselect?: (keys: string[]) => void,
   *   onsubmit?: (keys: string[], correct: boolean) => void,
   *   footer?: import('svelte').Snippet,
   * }}
   */
  let {
    question,
    salt = 'static',
    selected = $bindable([]),
    revealed = $bindable(false),
    showScenario = true,
    counter = '',
    onselect,
    onsubmit,
    footer,
  } = $props()

  const domain = $derived(domainById[question.domain])
  const scenario = $derived(scenarioById[question.scenario])
  const multi = $derived(question.type === 'multi')
  const need = $derived(multi ? (question.selectCount ?? question.correct.length) : 1)

  // Options are relabelled A-D in display order. `src` is the key the content
  // file uses, and everything outside this component works in source keys.
  const view = $derived(presentOptions(question, salt, progress.shuffleOptions))
  const correct = $derived(checkCorrect(selected, question.correct))
  const flagged = $derived(progress.flags.has(question.id))

  /** Letters as the learner sees them, for feedback text. */
  const shownKey = $derived(
    question.correct.map((/** @type {string} */ k) => view.toShown(k)).sort().join(' + '),
  )

  /** @param {string} src */
  function toggle(src) {
    if (revealed) return
    if (multi) {
      if (selected.includes(src)) selected = selected.filter((k) => k !== src)
      else if (selected.length < need) selected = [...selected, src]
      else return
    } else {
      selected = [src]
    }
    onselect?.(selected)
  }

  export function submit() {
    if (revealed || selected.length !== need) return false
    revealed = true
    onsubmit?.(selected, correct)
    return true
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    const idx = 'ABCD'.indexOf(e.key.toUpperCase())
    if (idx >= 0 && view.options[idx]) {
      e.preventDefault()
      toggle(view.options[idx].src)
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<article class="max-w-3xl">
  <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
    <span class="inline-flex items-center gap-2">
      <span class="h-[7px] w-[7px] shrink-0" style="background: {domain.color}"></span>
      <span class="font-mono text-[12.5px] text-[var(--color-ink-2)]">
        {question.domain} &middot; {domain.shortName}
      </span>
    </span>
    <span class="font-mono text-[12.5px] text-[var(--color-ink-3)]">Task {question.task}</span>
    {#if question.source === 'official'}
      <span
        class="border border-[var(--color-accent)] px-1.5 py-px font-mono text-[11.5px] tracking-[0.08em] text-[var(--color-accent)] uppercase"
      >Official sample</span>
    {/if}
    {#if counter}
      <span class="font-mono text-[12.5px] text-[var(--color-ink-3)]">{counter}</span>
    {/if}
    <div class="grow"></div>
    <button
      class="inline-flex items-center gap-1.5 text-[13.5px] transition-colors
        {flagged ? 'text-[var(--color-warn)]' : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink)]'}"
      onclick={() => progress.toggleFlag(question.id)}
      aria-pressed={flagged}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.2">
        <path d="M3 1.5v11M3 2h7.5L9 4.6l1.5 2.6H3" />
      </svg>
      {flagged ? 'Flagged' : 'Flag'}
    </button>
  </div>

  {#if showScenario && scenario}
    <div
      class="mb-4 border border-[var(--color-line)] border-l-2 bg-[var(--color-surface)] px-3.5 py-3"
      style="border-left-color: {domain.color}"
    >
      <div class="label">{scenario.id} &middot; {scenario.title}</div>
      <p class="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
        {@html richText(scenario.narrative)}
      </p>
    </div>
  {/if}

  <p class="text-[17px] leading-relaxed text-pretty">{@html richText(question.stem)}</p>
  <p class="mt-2 font-mono text-[12.5px] text-[var(--color-ink-3)]">
    {multi ? `Select ${need}` : 'Select one'}
    {#if !revealed}<span class="ml-1">&middot; keys A to D work</span>{/if}
  </p>

  <div class="my-4 flex flex-col gap-2">
    {#each view.options as opt (opt.key)}
      {@const isSel = selected.includes(opt.src)}
      {@const isKey = question.correct.includes(opt.src)}
      {@const state = revealed ? (isKey ? 'key' : isSel ? 'picked' : 'plain') : isSel ? 'sel' : 'idle'}
      <button
        type="button"
        data-testid="option"
        disabled={revealed}
        onclick={() => toggle(opt.src)}
        class="flex items-start gap-3 border px-3.5 py-3 text-left transition-colors
          {state === 'key'
            ? 'border-[var(--color-ok)] bg-[var(--color-ok-soft)]'
            : state === 'picked'
              ? 'border-[var(--color-bad)] bg-[var(--color-bad-soft)]'
              : state === 'plain'
                ? 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-75'
                : state === 'sel'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-ink-3)]'}"
      >
        <span
          class="mt-px grid h-[21px] w-[21px] shrink-0 place-items-center border font-mono text-[13.5px] font-medium
            {state === 'key'
              ? 'border-[var(--color-ok)] bg-[var(--color-ok)] text-white'
              : state === 'picked'
                ? 'border-[var(--color-bad)] bg-[var(--color-bad)] text-white'
                : state === 'sel'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'}"
        >{opt.key}</span>
        <span class="min-w-0 grow">
          <span class="flex items-baseline gap-3">
            <span class="min-w-0 grow text-[15.5px] leading-relaxed">{@html richText(opt.text)}</span>
            {#if state === 'key'}
              <span class="shrink-0 font-mono text-[11.5px] tracking-[0.08em] text-[var(--color-ok)] uppercase">key</span>
            {:else if state === 'picked'}
              <span class="shrink-0 font-mono text-[11.5px] tracking-[0.08em] text-[var(--color-bad)] uppercase">you picked</span>
            {/if}
          </span>
          {#if revealed && !isKey && question.why?.[opt.src]}
            <span
              class="mt-2 block border-l-2 border-[var(--color-line)] pl-2.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]"
            >{@html richText(question.why[opt.src])}</span>
          {/if}
        </span>
      </button>
    {/each}
  </div>

  {#if revealed}
    <div
      class="my-4 border border-[var(--color-line)] border-l-2 bg-[var(--color-surface)] px-4 py-3.5"
      style="border-left-color: {correct ? 'var(--color-ok)' : 'var(--color-bad)'}"
    >
      <p class="flex flex-wrap items-baseline gap-x-2.5 text-[14px]">
        <span class="font-semibold" style="color: {correct ? 'var(--color-ok)' : 'var(--color-bad)'}">
          {correct ? 'Correct.' : selected.length ? 'Not quite.' : 'Unanswered.'}
        </span>
        {#if !correct}
          <span class="text-[var(--color-ink-2)]">The key was {shownKey}.</span>
        {/if}
      </p>
      <p class="mt-2 text-[15px] leading-relaxed text-pretty">{@html richText(question.explanation)}</p>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center gap-2.5">
    {#if footer}
      {@render footer()}
    {/if}
  </div>
</article>
