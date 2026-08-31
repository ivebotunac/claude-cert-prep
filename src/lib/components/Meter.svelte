<script>
  /** @type {{ value: number, tone?: 'auto' | 'accent' | 'ok' | 'warn' | 'bad', height?: string }} */
  let { value = 0, tone = 'auto', height = 'h-1' } = $props()

  const colour = $derived(
    tone !== 'auto'
      ? `var(--color-${tone})`
      : value >= 75
        ? 'var(--color-ok)'
        : value >= 45
          ? 'var(--color-warn)'
          : value > 0
            ? 'var(--color-bad)'
            : 'var(--color-line-strong)',
  )
</script>

<div class="{height} w-full overflow-hidden bg-[var(--color-line-soft)]">
  <div
    class="h-full transition-[width] duration-300"
    style="width: {Math.max(0, Math.min(100, value))}%; background: {colour}"
  ></div>
</div>
