<script>
  /** @type {{ value: number, tone?: 'auto' | 'clay' | 'ok' | 'warn' | 'bad', height?: string }} */
  let { value = 0, tone = 'auto', height = 'h-1.5' } = $props()

  const colour = $derived(
    tone !== 'auto'
      ? `var(--color-${tone === 'clay' ? 'clay' : tone})`
      : value >= 75
        ? 'var(--color-ok)'
        : value >= 45
          ? 'var(--color-warn)'
          : value > 0
            ? 'var(--color-bad)'
            : 'var(--color-line-strong)',
  )
</script>

<div class="{height} w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
  <div
    class="h-full rounded-full transition-[width] duration-300"
    style="width: {Math.max(0, Math.min(100, value))}%; background: {colour}"
  ></div>
</div>
