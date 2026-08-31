<script>
  import { onMount } from 'svelte'
  import { router } from '$lib/router.svelte.js'
  import { progress } from '$lib/stores/progress.svelte.js'

  import Nav from '$lib/components/Nav.svelte'
  import Dashboard from '$lib/routes/Dashboard.svelte'
  import Study from '$lib/routes/Study.svelte'
  import Cards from '$lib/routes/Cards.svelte'
  import Quiz from '$lib/routes/Quiz.svelte'
  import Exam from '$lib/routes/Exam.svelte'
  import Result from '$lib/routes/Result.svelte'
  import Review from '$lib/routes/Review.svelte'
  import Path from '$lib/routes/Path.svelte'
  import Settings from '$lib/routes/Settings.svelte'
  import Resources from '$lib/routes/Resources.svelte'

  /** @type {Record<string, any>} */
  const views = {
    dashboard: Dashboard,
    study: Study,
    cards: Cards,
    quiz: Quiz,
    exam: Exam,
    result: Result,
    review: Review,
    path: Path,
    resources: Resources,
    settings: Settings,
  }

  let error = $state('')

  const View = $derived(views[router.view] ?? Dashboard)

  onMount(async () => {
    try {
      await progress.load()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.error(err)
    }
  })
</script>

<svelte:head>
  <title>
    {router.view === 'dashboard' ? 'CCAR-F Prep' : `${router.view} · CCAR-F Prep`}
  </title>
</svelte:head>

<Nav />

<main class="mx-auto w-full max-w-[1280px] px-5 pb-24 pt-7 sm:px-7">
  {#if error}
    <div class="card border-l-2 border-l-[var(--color-bad)] p-6">
      <h1 class="mb-2 text-[19px] font-semibold text-[var(--color-bad)]">Could not open the database</h1>
      <p class="text-[14px] text-[var(--color-ink-2)]">{error}</p>
      <p class="mt-3 text-[14px] text-[var(--color-ink-2)]">
        This usually means the browser blocked storage. Try a normal window rather than a private
        one, and close any other tab running this app.
      </p>
    </div>
  {:else if !progress.ready}
    <div class="flex min-h-[50vh] items-center justify-center">
      <div class="w-full max-w-[220px] text-center">
        <div class="h-[3px] w-full overflow-hidden bg-[var(--color-line-soft)]">
          <div class="boot-bar h-full w-1/3 bg-[var(--color-accent)]"></div>
        </div>
        <p class="mt-3 font-mono text-[12.5px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
          Opening the database
        </p>
      </div>
    </div>
  {:else}
    <View />
  {/if}
</main>

{#if progress.ready && !progress.storage.persistent}
  <div
    class="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-5 py-2.5 text-center text-[14px]"
  >
    Storage is not persistent in this browser, so progress will be lost on reload.
    <a href="#/settings" class="font-semibold underline">Export regularly</a>.
  </div>
{/if}

<style>
  /* The boot bar sweeps rather than spins: a rotating square would read as broken
     in a system with no rounded corners anywhere. */
  .boot-bar {
    animation: sweep 1.1s ease-in-out infinite;
  }
  @keyframes sweep {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
</style>
