<script>
  /** @type {{ title: string, body?: string, children?: import('svelte').Snippet }} */
  let { title, body = '', children } = $props()
</script>

<div class="py-16 text-center">
  <p class="font-serif text-lg text-[var(--color-ink-2)]">{title}</p>
  {#if body}<p class="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-3)]">{body}</p>{/if}
  {#if children}<div class="mt-5 flex justify-center gap-2">{@render children()}</div>{/if}
</div>
