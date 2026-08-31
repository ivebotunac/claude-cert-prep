<script>
  /** @type {{ value: string | number, label: string, sub?: string, tone?: string }} */
  let { value, label, sub = '', tone = 'var(--color-ink)' } = $props()
</script>

<div class="card p-4">
  <div class="font-serif text-[1.9rem] leading-none font-semibold" style="color: {tone}">
    {@html value}
  </div>
  <div class="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
    {label}
  </div>
  {#if sub}
    <div class="mt-1 text-xs text-[var(--color-ink-2)]">{sub}</div>
  {/if}
</div>
