<script lang="ts">
	import { Accordion } from "bits-ui";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	let {
		type = "single",
		collapsible = false,
		children,
		...restProps
	} = $props<Accordion.RootProps & { children?: Snippet }>();
</script>

<Accordion.Root type={type} collapsible={collapsible} {...restProps}>
	{@render children?.()}
</Accordion.Root>

