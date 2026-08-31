<script>
  /**
   * A metric tile. The caption comes first and the figure second, so a column of
   * these reads as a table of measurements rather than as a row of scoreboards.
   * @type {{ value: string | number, label: string, sub?: string, tone?: string, meter?: number | null }}
   */
  let { value, label, sub = '', tone = 'var(--color-ink)', meter = null } = $props()
</script>

<div class="bg-[var(--color-surface)] px-4 py-3.5">
  <div class="label">{label}</div>
  <div class="mt-2 font-mono text-[30px] leading-none font-medium tracking-[-0.02em]" style="color: {tone}">
    {@html value}
  </div>
  {#if meter !== null}
    <div class="mt-2.5 h-1 w-full overflow-hidden bg-[var(--color-line-soft)]">
      <div class="h-full bg-[var(--color-ink)]" style="width: {Math.max(0, Math.min(100, meter))}%"></div>
    </div>
  {/if}
  {#if sub}
    <div class="mt-2 text-[13.5px] text-[var(--color-ink-3)]">{sub}</div>
  {/if}
</div>
