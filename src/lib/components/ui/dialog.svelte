<script lang="ts">
	import { Dialog } from "bits-ui";
	import type { Snippet } from "svelte";

	// @ts-expect-error - Svelte 5 runes ($bindable, $props)
	let {
		open = $bindable(false),
		children,
		...restProps
	} = $props<Dialog.RootProps & { children?: Snippet }>();
</script>

<Dialog.Root bind:open {...restProps}>
	{@render children?.()}
</Dialog.Root>

