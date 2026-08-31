<script>
  import { onMount } from 'svelte'
  import { router } from '$lib/router.svelte.js'
  import { progress, applyTheme } from '$lib/stores/progress.svelte.js'

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
      applyTheme(progress.theme)
      // Mirror the theme for the pre-paint script in index.html.
      try { localStorage.setItem('ccarf-theme', progress.theme) } catch {}
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

<main class="mx-auto w-full max-w-5xl px-5 pb-24 pt-8">
  {#if error}
    <div class="card border-[var(--color-bad)] bg-[var(--color-bad-soft)] p-6">
      <h1 class="mb-2 text-xl font-semibold">Could not open the database</h1>
      <p class="text-sm text-[var(--color-ink-2)]">{error}</p>
      <p class="mt-3 text-sm text-[var(--color-ink-2)]">
        This usually means the browser blocked storage. Try a normal window rather than a private
        one, and close any other tab running this app.
      </p>
    </div>
  {:else if !progress.ready}
    <div class="flex min-h-[50vh] items-center justify-center">
      <div class="text-center">
        <div
          class="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-clay)]"
        ></div>
        <p class="text-sm text-[var(--color-ink-3)]">Opening the local database</p>
      </div>
    </div>
  {:else}
    <View />
  {/if}
</main>

{#if progress.ready && !progress.storage.persistent}
  <div
    class="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-warn-soft)] px-5 py-2.5 text-center text-sm"
  >
    Storage is not persistent in this browser, so progress will be lost on reload.
    <a href="#/settings" class="font-semibold underline">Export regularly</a>.
  </div>
{/if}
