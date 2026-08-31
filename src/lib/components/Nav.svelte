<script>
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'

  const links = [
    { to: 'dashboard', label: 'Overview' },
    { to: 'study', label: 'Study' },
    { to: 'cards', label: 'Cards' },
    { to: 'quiz', label: 'Quiz' },
    { to: 'exam', label: 'Mock exam' },
    { to: 'review', label: 'Review' },
    { to: 'path', label: 'Path' },
    { to: 'resources', label: 'Resources' },
  ]

  const due = $derived(progress.ready ? progress.cardSummary().due : 0)
</script>

<header class="no-print sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-surface)]">
  <div class="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 px-5 sm:px-7">
    <a
      href="#/dashboard"
      class="flex flex-col justify-center gap-px py-2.5 leading-tight no-underline sm:h-[65px] sm:py-0"
    >
      <span class="font-mono text-[16px] font-semibold tracking-[0.08em] text-[var(--color-ink)]">
        CCAR-F
      </span>
      <span class="text-[12px] text-[var(--color-ink-3)]">Architect, Foundations</span>
    </a>

    <!-- One nav, not two. Below the breakpoint it wraps onto its own full-width
         row and scrolls sideways; above it, it sits inline. Rendering a second
         copy for small screens would put every destination in the document
         twice, which is what a screen reader would then read out. -->
    <nav
      class="order-last -mx-5 flex w-[calc(100%+2.5rem)] overflow-x-auto border-t border-[var(--color-line-soft)] px-3
        sm:order-none sm:m-0 sm:ml-auto sm:w-auto sm:border-t-0 sm:px-0"
      aria-label="Sections"
    >
      {#each links as link (link.to)}
        {@const on = router.view === link.to}
        <a
          href="#/{link.to}"
          aria-current={on ? 'page' : undefined}
          class="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap no-underline transition-colors sm:h-[65px] sm:py-0
            {on
              ? 'border-[var(--color-accent)] font-medium text-[var(--color-ink)]'
              : 'border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}"
        >
          {link.label}
          {#if link.to === 'cards' && due > 0}
            <span
              class="bg-[var(--color-accent)] px-1.5 py-px font-mono text-[11.5px] leading-[1.3] text-white"
              data-testid="due-badge"
            >{due}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <a
      href="#/settings"
      class="ml-auto flex items-center py-2.5 text-[var(--color-ink-3)] no-underline hover:text-[var(--color-ink)] sm:ml-0 sm:h-[65px] sm:py-0"
      title="Settings"
      aria-label="Settings"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M2 4.5h5M10 4.5h4M2 11.5h4M9 11.5h5" />
        <circle cx="8.5" cy="4.5" r="1.6" />
        <circle cx="7.5" cy="11.5" r="1.6" />
      </svg>
    </a>
  </div>
</header>
