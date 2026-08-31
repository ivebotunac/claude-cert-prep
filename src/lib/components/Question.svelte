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

<article class="mx-auto max-w-3xl">
  <div class="mb-3.5 flex flex-wrap items-center gap-2">
    <span
      class="pill border-transparent"
      style="background: {domain.color}22; color: {domain.color}"
    >{question.domain} &middot; {domain.shortName}</span>
    <span class="pill">Task {question.task}</span>
    {#if question.source === 'official'}
      <span class="pill border-transparent bg-[var(--color-clay-soft)] text-[var(--color-clay-text)]">
        Official sample
      </span>
    {/if}
    <div class="grow"></div>
    {#if counter}<span class="text-xs text-[var(--color-ink-3)]">{counter}</span>{/if}
    <button
      class="btn btn-ghost btn-sm"
      onclick={() => progress.toggleFlag(question.id)}
      aria-pressed={flagged}
    >
      {flagged ? '⚑ Flagged' : '⚐ Flag'}
    </button>
  </div>

  {#if showScenario && scenario}
    <div
      class="mb-4 rounded-r-lg border-l-[3px] border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-3.5 py-3 text-[13.5px] text-[var(--color-ink-2)]"
    >
      <b class="text-[var(--color-ink)]">{scenario.id} &middot; {scenario.title}.</b>
      {@html richText(scenario.narrative)}
    </div>
  {/if}

  <p class="text-[16px] leading-relaxed">{@html richText(question.stem)}</p>
  <p class="mt-2 text-xs text-[var(--color-ink-3)]">
    {multi ? `Select ${need}.` : 'Select one.'}
    {#if !revealed}<span class="ml-1">Keys A to D work.</span>{/if}
  </p>

  <div class="my-5 flex flex-col gap-2">
    {#each view.options as opt (opt.key)}
      {@const isSel = selected.includes(opt.src)}
      {@const isKey = question.correct.includes(opt.src)}
      <button
        type="button"
        data-testid="option"
        disabled={revealed}
        onclick={() => toggle(opt.src)}
        class="flex items-start gap-3 rounded-lg border-[1.5px] px-3.5 py-3 text-left leading-relaxed transition-colors
          {revealed
            ? isKey
              ? 'border-[var(--color-ok)] bg-[var(--color-ok-soft)]'
              : isSel
                ? 'border-[var(--color-bad)] bg-[var(--color-bad-soft)]'
                : 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-75'
            : isSel
              ? 'border-[var(--color-clay)] bg-[var(--color-clay-soft)]'
              : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'}"
      >
        <span
          class="mt-px grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[5px] border font-mono text-[12.5px] font-semibold
            {revealed && isKey
              ? 'border-[var(--color-ok)] bg-[var(--color-ok)] text-white'
              : revealed && isSel
                ? 'border-[var(--color-bad)] bg-[var(--color-bad)] text-white'
                : isSel
                  ? 'border-[var(--color-clay)] bg-[var(--color-clay)] text-white'
                  : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'}"
        >{opt.key}</span>
        <span class="min-w-0">
          {@html richText(opt.text)}
          {#if revealed && !isKey && question.why?.[opt.src]}
            <span class="mt-1.5 block text-[12.8px] italic text-[var(--color-ink-2)]">
              {@html richText(question.why[opt.src])}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </div>

  {#if revealed}
    <div
      class="my-4 rounded-lg px-4 py-3.5 {correct
        ? 'bg-[var(--color-ok-soft)]'
        : 'bg-[var(--color-bad-soft)]'}"
    >
      <p class="mb-1.5 font-semibold">
        {#if correct}
          Correct
        {:else if selected.length}
          Not quite. The answer is {shownKey}.
        {:else}
          Answer: {shownKey}
        {/if}
      </p>
      <p class="text-[14.5px] leading-relaxed">{@html richText(question.explanation)}</p>
    </div>
  {/if}

  <div class="mt-5 flex flex-wrap items-center gap-2.5">
    {#if footer}
      {@render footer()}
    {/if}
  </div>
</article>
