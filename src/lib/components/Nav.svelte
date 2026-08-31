<script>
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'

  const links = [
    { to: 'dashboard', label: 'Dashboard' },
    { to: 'study', label: 'Study' },
    { to: 'cards', label: 'Flashcards' },
    { to: 'quiz', label: 'Quiz' },
    { to: 'exam', label: 'Mock exam' },
    { to: 'review', label: 'Review' },
    { to: 'path', label: 'Path' },
    { to: 'resources', label: 'Resources' },
  ]

  const due = $derived(progress.ready ? progress.cardSummary().due : 0)

  function cycleTheme() {
    const order = ['system', 'light', 'dark']
    const next = order[(order.indexOf(progress.theme) + 1) % order.length]
    progress.setTheme(next)
    try { localStorage.setItem('ccarf-theme', next) } catch {}
  }
</script>

<header
  class="no-print sticky top-0 z-20 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_88%,transparent)] backdrop-blur"
>
  <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
    <a href="#/dashboard" class="flex flex-col leading-tight no-underline">
      <span class="font-mono text-[15px] font-semibold tracking-wide text-[var(--color-clay-text)]">
        CCAR-F
      </span>
      <span class="text-[11px] text-[var(--color-ink-3)]">
        Claude Certified Architect &middot; Foundations
      </span>
    </a>

    <nav class="order-3 flex w-full flex-wrap gap-0.5 sm:order-none sm:ml-auto sm:w-auto">
      {#each links as link (link.to)}
        <a
          href="#/{link.to}"
          class="relative rounded-md px-3 py-1.5 text-[13.5px] font-medium no-underline transition-colors
            {router.view === link.to
              ? 'bg-[var(--color-clay-soft)] text-[var(--color-clay-text)]'
              : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'}"
        >
          {link.label}
          {#if link.to === 'cards' && due > 0}
            <span
              class="ml-1 inline-block min-w-[1.1rem] rounded-full bg-[var(--color-clay)] px-1 text-[10px] font-semibold leading-[1.1rem] text-white"
            >{due}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <div class="ml-auto flex items-center gap-1 sm:ml-0">
      <button
        class="btn btn-ghost btn-sm"
        onclick={cycleTheme}
        title="Theme: {progress.theme}"
        aria-label="Change theme"
      >
        {progress.theme === 'dark' ? '◑' : progress.theme === 'light' ? '◐' : '◎'}
      </button>
      <a href="#/settings" class="btn btn-ghost btn-sm" title="Settings" aria-label="Settings">
        &#9881;
      </a>
    </div>
  </div>
</header>
