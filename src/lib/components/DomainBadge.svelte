<script>
  import { domainById } from '$lib/content.js'

  /**
   * A domain marker: a coloured square plus its code. The colour alone would be
   * the whole signal otherwise, which is no signal at all for anyone who cannot
   * separate the five hues.
   * @type {{ id: string, size?: 'sm' | 'md', showId?: boolean }}
   */
  let { id, size = 'md', showId = true } = $props()
  const d = $derived(domainById[id])
</script>

<span class="inline-flex shrink-0 items-center gap-2" title={d?.name ?? id}>
  <span
    class="shrink-0 {size === 'sm' ? 'h-[6px] w-[6px]' : 'h-[7px] w-[7px]'}"
    style="background: {d?.color ?? 'var(--color-ink-3)'}"
  ></span>
  {#if showId}
    <span class="font-mono text-[12.5px] text-[var(--color-ink-2)]">{id}</span>
  {/if}
</span>
