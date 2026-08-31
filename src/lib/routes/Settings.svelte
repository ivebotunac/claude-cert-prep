<script>
  import { progress } from '$lib/stores/progress.svelte.js'
  import { exportBytes, importBytes, reset } from '$lib/db/index.js'
  import { formatBytes } from '$lib/util.js'
  import { questions, flashcards, tasks } from '$lib/content.js'

  const backends = {
    'opfs-sahpool':
      'Origin Private File System, pool VFS. Persistent and the fastest of the three, but only one tab at a time can hold it.',
    kvvfs:
      'A key-value VFS backed by localStorage. Persistent, the same SQL, but capped at the few megabytes localStorage allows.',
    memory:
      'Nothing is written to disk. The app runs, and everything you do is gone on the next reload.',
  }

  /** @type {{ text: string, ok: boolean } | null} */
  let status = $state(null)
  let busy = $state(false)
  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null)

  /** @param {unknown} err */
  const message = (err) => (err instanceof Error ? err.message : String(err))

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

{#snippet row(
  /** @type {string} */ label,
  /** @type {string} */ desc,
  /** @type {import('svelte').Snippet} */ control,
)}
  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
    <div class="min-w-0 grow basis-[18rem]">
      <div class="text-[15px] font-medium">{label}</div>
      <div class="mt-0.5 max-w-[76ch] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
        {desc}
      </div>
    </div>
    <div class="shrink-0">{@render control()}</div>
  </div>
{/snippet}

{#snippet fact(/** @type {string} */ k, /** @type {string} */ v, tone = 'var(--color-ink)')}
  <div class="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
    <span class="text-[var(--color-ink-2)]">{k}</span>
    <span class="font-mono" style="color: {tone}">{v}</span>
  </div>
{/snippet}

<h1 class="text-[24px] font-semibold">Settings</h1>
<p class="mt-1 mb-5 max-w-[76ch] text-[15px] text-[var(--color-ink-2)]">
  Everything here is local to this browser. Nothing is synced, nothing is backed up, and nothing is
  visible to anyone else. Export is how a copy gets anywhere.
</p>

{#if status}
  <div
    class="card mb-5 border-l-2 px-4 py-3 text-[14px] leading-relaxed"
    style="border-left-color: {status.ok ? 'var(--color-ok)' : 'var(--color-bad)'}"
  >
    {status.text}
  </div>
{/if}

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
  <div>
    <div class="section mb-2.5">Your progress</div>
    <div class="card rows">
      {#snippet exportBtn()}
        <button class="btn btn-primary" disabled={busy} onclick={doExport}>Export database</button>
      {/snippet}
      {@render row(
        'Export',
        'Writes a real .sqlite3 file. It opens in the sqlite3 CLI or DB Browser, so your study history is queryable outside this app.',
        exportBtn,
      )}

      {#snippet importBtn()}
        <input class="hidden" type="file" accept=".sqlite3,.db" bind:this={fileInput} onchange={onFile} />
        <button class="btn" disabled={busy} onclick={() => fileInput?.click()}>Choose a file</button>
      {/snippet}
      {@render row(
        'Import',
        'Loads an exported file and replaces everything stored here. There is no merge, so export first if this browser holds progress you want to keep.',
        importBtn,
      )}

      {#snippet resetBtn()}
        <button class="btn btn-danger" disabled={busy} onclick={doReset}>Delete all progress</button>
      {/snippet}
      {@render row(
        'Reset',
        'Empties every table: reading marks, flashcard boxes, answers, flags and mock attempts. The question bank is content, not progress, so it stays.',
        resetBtn,
      )}
    </div>

    <div class="section mt-6 mb-2.5">Behaviour</div>
    <div class="card rows">
      {#snippet shuffleToggle()}
        <button
          class="flex h-[19px] w-[34px] items-center border p-[2px] transition-colors
            {progress.shuffleOptions
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
              : 'border-[var(--color-line-strong)] bg-[var(--color-surface-2)]'}"
          role="switch"
          aria-checked={progress.shuffleOptions}
          aria-label="Shuffle option order"
          onclick={() => progress.setShuffle(!progress.shuffleOptions)}
        >
          <span
            class="h-[13px] w-[13px] bg-white transition-transform
              {progress.shuffleOptions ? 'translate-x-[15px]' : ''}"
          ></span>
        </button>
      {/snippet}
      {@render row(
        'Shuffle option order',
        'Options are relabelled A to D in a different order each sitting, seeded from the question id. Answer position can never become a cue.',
        shuffleToggle,
      )}

      {#snippet noSetting()}
        <span class="font-mono text-[12.5px] text-[var(--color-ink-3)]">no setting</span>
      {/snippet}
      {@render row(
        'Light only',
        'The interface is designed for one palette and does not follow the system dark setting. One set of colours, tuned once, is easier to keep honest than two.',
        noSetting,
      )}
    </div>
  </div>

  <div>
    <div class="section mb-2.5">Storage</div>
    <div class="card rows">
      {@render fact(
        'Backend',
        progress.storage.backend,
        progress.storage.persistent ? 'var(--color-ok)' : 'var(--color-bad)',
      )}
      {@render fact('Persistent', progress.storage.persistent ? 'yes' : 'no')}
      {@render fact('Size', formatBytes(progress.storage.bytes))}
      <p class="px-4 py-2.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        {backends[/** @type {keyof typeof backends} */ (progress.storage.backend)]}
      </p>
    </div>

    <div class="section mt-6 mb-2.5">Study content</div>
    <div class="card rows">
      {@render fact('Guide revision', `v${progress.content.guideVersion ?? '?'}`)}
      {@render fact('Exam code', progress.content.examCode ?? 'CCAR-F')}
      {@render fact('Questions', String(questions.length))}
      {@render fact('Flashcards', String(flashcards.length))}
      {@render fact('Task statements', String(tasks.length))}
      {@render fact('Size', formatBytes(Number(progress.content.bytes ?? 0)))}
      <p class="px-4 py-2.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        Attached read-only beside your progress. SQLite refuses a write to it, so nothing here can
        rewrite an exam question, and an exported progress file carries none of it.
      </p>
    </div>
  </div>
</div>
