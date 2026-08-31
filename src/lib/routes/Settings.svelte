<script>
  import { progress } from '$lib/stores/progress.svelte.js'
  import { exportBytes, importBytes, reset } from '$lib/db/index.js'
  import { formatBytes } from '$lib/util.js'
  import { questions, flashcards, tasks } from '$lib/content.js'

  const themes = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  const backends = [
    {
      id: 'opfs-sahpool',
      text: 'Origin Private File System, pool VFS. Persistent and the fastest of the three, but only one tab at a time can hold it.',
    },
    {
      id: 'kvvfs',
      text: 'A key-value VFS backed by localStorage. Persistent, same SQL, but capped at the few megabytes localStorage allows.',
    },
    {
      id: 'memory',
      text: 'Nothing is written to disk. The app runs, and everything you do is gone on the next reload.',
    },
  ]

  /** @type {{ text: string, ok: boolean } | null} */
  let status = $state(null)
  let busy = $state(false)
  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null)

  /** @param {unknown} err */
  const message = (err) => (err instanceof Error ? err.message : String(err))

  /** @param {string} value */
  function pickTheme(value) {
    progress.setTheme(value)
    // the pre-paint script in index.html reads this mirror, since SQLite is async
    try {
      localStorage.setItem('ccarf-theme', value)
    } catch {}
  }

  async function doExport() {
    busy = true
    try {
      const bytes = await exportBytes()
      // the wasm export is typed ArrayBufferLike, while Blob wants a plain view
      const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/x-sqlite3' })
      const name = `ccarf-progress-${new Date().toISOString().slice(0, 10)}.sqlite3`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      // revoke on the next tick, because some browsers read the URL after click returns
      setTimeout(() => URL.revokeObjectURL(url), 0)
      status = { text: `Saved ${name}, ${formatBytes(blob.size)}.`, ok: true }
    } catch (err) {
      status = { text: `Export failed: ${message(err)}`, ok: false }
    } finally {
      busy = false
    }
  }

  /** @param {Event} e */
  async function onFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const file = input.files?.[0]
    // clear it so picking the same file twice still fires a change
    input.value = ''
    if (!file) return
    if (!confirm(`Import ${file.name}? This replaces all progress currently in this browser.`)) return

    busy = true
    try {
      const buffer = await file.arrayBuffer()
      await importBytes(buffer)
      await progress.load()
      status = {
        text: `Imported ${file.name}. ${progress.read.size} objectives read, ${progress.totals.answered} answers, ${progress.attempts.length} mock attempts.`,
        ok: true,
      }
    } catch (err) {
      status = {
        text: `Import failed: ${message(err)}. Reload the page and check your progress before carrying on.`,
        ok: false,
      }
    } finally {
      busy = false
    }
  }

  async function doReset() {
    if (
      !confirm(
        'Delete all progress? Reading marks, flashcard boxes, answers, flags and mock attempts go with it. This cannot be undone.',
      )
    )
      return

    busy = true
    try {
      await reset()
      await progress.load()
      status = { text: 'All progress deleted. The study content is untouched.', ok: true }
    } catch (err) {
      status = { text: `Reset failed: ${message(err)}`, ok: false }
    } finally {
      busy = false
    }
  }
</script>

<h1 class="mb-1.5 text-[27px] font-semibold">Settings</h1>
<p class="mb-7 max-w-[68ch] text-[var(--color-ink-2)]">
  Preferences and the data behind them. Your progress is a SQLite database inside this browser. It
  never leaves the machine, which also means no other device has a copy unless you export one.
</p>

<h2 class="mb-3 text-lg font-semibold">Appearance</h2>
<div class="card flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
  <div class="min-w-[14rem] grow">
    <div class="text-[14.5px] font-medium">Theme</div>
    <p class="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
      System follows your operating system and switches with it. Light and dark stay where you put
      them.
    </p>
  </div>
  <div
    class="flex shrink-0 gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
  >
    {#each themes as t (t.value)}
      <button
        class="rounded-md px-3 py-1.5 text-[13.5px] font-medium transition-colors
          {progress.theme === t.value
          ? 'bg-[var(--color-surface)] text-[var(--color-ink)]'
          : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}"
        aria-pressed={progress.theme === t.value}
        onclick={() => pickTheme(t.value)}
      >
        {t.label}
      </button>
    {/each}
  </div>
</div>

<h2 class="mb-3 mt-9 text-lg font-semibold">Practice</h2>
<div class="card flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
  <div class="min-w-[14rem] grow">
    <div class="text-[14.5px] font-medium">Shuffle answer options</div>
    <p class="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
      Options are reordered per question and per sitting, so the position of the right answer is
      never a cue. The order holds steady inside one quiz or one mock attempt, and differs the next
      time you meet the same question.
    </p>
  </div>
  <button
    class="btn shrink-0"
    aria-pressed={progress.shuffleOptions}
    onclick={() => progress.setShuffle(!progress.shuffleOptions)}
  >
    <span
      class="inline-block h-2 w-2 rounded-full"
      style="background: {progress.shuffleOptions ? 'var(--color-ok)' : 'var(--color-line-strong)'}"
    ></span>
    {progress.shuffleOptions ? 'On' : 'Off'}
  </button>
</div>

<h2 class="mb-3 mt-9 text-lg font-semibold">Storage</h2>
<div class="card p-5">
  <div class="flex flex-wrap gap-x-10 gap-y-4">
    <div>
      <span class="label">Backend</span>
      <div class="mt-1 font-mono text-[14.5px]">{progress.storage.backend}</div>
    </div>
    <div>
      <span class="label">Survives a reload</span>
      <div
        class="mt-1 text-[14.5px] font-medium"
        style="color: {progress.storage.persistent ? 'var(--color-ok)' : 'var(--color-bad)'}"
      >
        {progress.storage.persistent ? 'Yes' : 'No'}
      </div>
    </div>
    <div>
      <span class="label">Database size</span>
      <div class="mt-1 font-mono text-[14.5px]">{formatBytes(progress.storage.bytes)}</div>
    </div>
  </div>

  <ul class="mt-5 flex flex-col gap-2.5 border-t border-[var(--color-line)] pt-4">
    {#each backends as b (b.id)}
      {@const active = b.id === progress.storage.backend}
      <li
        class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]
          {active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'}"
      >
        <code>{b.id}</code>
        {#if active}
          <span class="pill border-transparent bg-[var(--color-clay-soft)] text-[var(--color-clay-text)]">
            In use
          </span>
        {/if}
        <span class="min-w-[16rem] grow basis-0">{b.text}</span>
      </li>
    {/each}
  </ul>

  {#if !progress.storage.persistent}
    <div class="mt-4 rounded-lg bg-[var(--color-warn-soft)] px-4 py-3 text-[13.5px] leading-relaxed">
      <b>Nothing is being saved.</b>
      This browser gave the app neither the file system pool nor localStorage, so the database is in
      memory only and closing the tab throws it away. A private window or a second tab on the same
      origin is the usual cause. Export before you leave, and import the file back once you are in a
      normal window.
    </div>
  {:else if progress.storage.backend === 'kvvfs'}
    <p class="mt-4 text-[13px] text-[var(--color-ink-2)]">
      Persistent, but localStorage is small. If the database grows past the quota, writes start
      failing. Export now and then.
    </p>
  {/if}
</div>

<h2 class="mb-3 mt-9 text-lg font-semibold">Your data</h2>
<div class="card divide-y divide-[var(--color-line)] px-5">
  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
    <div class="min-w-[14rem] grow">
      <div class="text-[14.5px] font-medium">Export</div>
      <p class="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
        Downloads the whole database as one file. It is a real SQLite database, not a dump, so the
        <code>sqlite3</code> CLI or DB Browser for SQLite will open it and read every table.
      </p>
    </div>
    <button class="btn btn-primary shrink-0" disabled={busy} onclick={doExport}>
      Export database
    </button>
  </div>

  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
    <div class="min-w-[14rem] grow">
      <div class="text-[14.5px] font-medium">Import</div>
      <p class="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
        Loads an exported file and replaces everything currently stored here. There is no merge, so
        export first if this browser holds progress you want to keep.
      </p>
    </div>
    <input
      class="hidden"
      type="file"
      accept=".sqlite3,.db"
      bind:this={fileInput}
      onchange={onFile}
    />
    <button class="btn shrink-0" disabled={busy} onclick={() => fileInput?.click()}>
      Choose a file
    </button>
  </div>

  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
    <div class="min-w-[14rem] grow">
      <div class="text-[14.5px] font-medium">Reset</div>
      <p class="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
        Empties every table: reading marks, flashcard boxes, answers, flags and mock attempts. The
        question bank and the blueprint are content, not progress, so they stay.
      </p>
    </div>
    <button
      class="btn btn-ghost shrink-0"
      style="color: var(--color-bad)"
      disabled={busy}
      onclick={doReset}
    >
      Delete all progress
    </button>
  </div>
</div>

{#if status}
  <p
    role="status"
    class="mt-3 rounded-lg px-4 py-3 text-[13.5px] leading-relaxed
      {status.ok
      ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
      : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'}"
  >
    {status.text}
  </p>
{/if}

<h2 class="mb-3 mt-9 text-lg font-semibold">About</h2>
<div class="card p-5 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
  <p>
    The study material ships with the app as JSON: {tasks.length} task statements, {questions.length}
    questions and {flashcards.length} flashcards, identical for everyone who opens it. Nothing is
    fetched and there is no account, so the app works with the network off.
  </p>
  <p class="mt-2.5">
    Your progress is the only thing that varies, and it lives in this browser alone. It is not
    synced, not backed up and not visible to anyone else. Export is how a copy gets anywhere else.
  </p>
  <p class="mt-2.5">
    Where the content came from, and what to read next, is listed on
    <a href="#/resources" class="underline">Resources</a>.
  </p>
</div>
