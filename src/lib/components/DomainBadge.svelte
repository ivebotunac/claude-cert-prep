<script>
  import { domainById } from '$lib/content.js'
  /** @type {{ id: string, size?: 'sm' | 'md' }} */
  let { id, size = 'md' } = $props()
  const d = $derived(domainById[id])
</script>

<span
  class="grid shrink-0 place-items-center rounded-lg font-mono font-semibold text-white
    {size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[11px]'}"
  style="background: {d?.color ?? 'var(--color-ink-3)'}"
>{id}</span>
